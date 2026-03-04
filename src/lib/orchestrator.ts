import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logBus } from './logger';
import { db } from './db';
import type { WorkerMessage, LogEvent, ExecutionStats } from './types';

interface ActiveExecution {
  id: string;
  process: ChildProcess;
  timeoutHandle: NodeJS.Timeout;
}

// Prepared statements for performance
const insertRun = db.prepare(`
  INSERT INTO runs (id, status, started_at) VALUES (?, 'running', ?)
`);
const updateRunStatus = db.prepare(`
  UPDATE runs SET status = ?, finished_at = ? WHERE id = ?
`);
const updateRunStats = db.prepare(`
  UPDATE runs SET total_jobs = ?, applied_jobs = ?, needs_info_jobs = ?, manual_jobs = ?, discarded_jobs = ? WHERE id = ?
`);
const insertLog = db.prepare(`
  INSERT INTO logs (run_id, timestamp, level, stage, message, meta) VALUES (?, ?, ?, ?, ?, ?)
`);
const upsertJob = db.prepare(`
  INSERT INTO jobs (id, run_id, title, company, url, score, reason)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = CASE WHEN excluded.title != 'Unknown' THEN excluded.title ELSE jobs.title END,
    company = CASE WHEN excluded.company != 'Unknown' THEN excluded.company ELSE jobs.company END,
    url = COALESCE(excluded.url, jobs.url),
    score = COALESCE(excluded.score, jobs.score),
    reason = COALESCE(excluded.reason, jobs.reason)
`);

class Orchestrator {
  private active: ActiveExecution | null = null;

  isRunning(): boolean {
    return this.active !== null;
  }

  getActiveExecutionId(): string | null {
    return this.active?.id ?? null;
  }

  getLogs(runId: string): LogEvent[] {
    const rows = db.prepare('SELECT timestamp, level, stage, message, meta FROM logs WHERE run_id = ? ORDER BY id').all(runId) as Array<{
      timestamp: string; level: string; stage: string; message: string; meta: string | null;
    }>;
    return rows.map(r => ({
      timestamp: r.timestamp,
      level: r.level as LogEvent['level'],
      stage: r.stage as LogEvent['stage'],
      message: r.message,
      meta: r.meta ? JSON.parse(r.meta) : undefined,
    }));
  }

  getStats(runId: string): ExecutionStats | null {
    const row = db.prepare('SELECT total_jobs, applied_jobs, needs_info_jobs, manual_jobs, discarded_jobs FROM runs WHERE id = ?').get(runId) as {
      total_jobs: number; applied_jobs: number; needs_info_jobs: number; manual_jobs: number; discarded_jobs: number;
    } | undefined;
    if (!row) return null;
    return {
      totalJobs: row.total_jobs,
      appliedJobs: row.applied_jobs,
      needsInfoJobs: row.needs_info_jobs,
      manualJobs: row.manual_jobs,
      discardedJobs: row.discarded_jobs,
    };
  }

  listRuns(): Array<{
    runId: string; status: string; startedAt: string; finishedAt: string | null;
    stats: ExecutionStats;
  }> {
    const rows = db.prepare(`
      SELECT id, status, started_at, finished_at, total_jobs, applied_jobs, needs_info_jobs, manual_jobs, discarded_jobs
      FROM runs ORDER BY started_at DESC LIMIT 50
    `).all() as Array<{
      id: string; status: string; started_at: string; finished_at: string | null;
      total_jobs: number; applied_jobs: number; needs_info_jobs: number; manual_jobs: number; discarded_jobs: number;
    }>;
    return rows.map(r => ({
      runId: r.id,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      stats: {
        totalJobs: r.total_jobs,
        appliedJobs: r.applied_jobs,
        needsInfoJobs: r.needs_info_jobs,
        manualJobs: r.manual_jobs,
        discardedJobs: r.discarded_jobs,
      },
    }));
  }

  getRun(runId: string) {
    const run = db.prepare('SELECT id, status, started_at, finished_at, total_jobs, applied_jobs, needs_info_jobs, manual_jobs, discarded_jobs FROM runs WHERE id = ?').get(runId) as {
      id: string; status: string; started_at: string; finished_at: string | null;
      total_jobs: number; applied_jobs: number; needs_info_jobs: number; manual_jobs: number; discarded_jobs: number;
    } | undefined;
    if (!run) return null;

    const logs = this.getLogs(runId);
    const jobs = db.prepare('SELECT id, title, company, url, score, reason FROM jobs WHERE run_id = ? ORDER BY created_at').all(runId) as Array<{
      id: string; title: string; company: string; url: string | null; score: number | null; reason: string | null;
    }>;

    return {
      runId: run.id,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      stats: {
        totalJobs: run.total_jobs,
        appliedJobs: run.applied_jobs,
        needsInfoJobs: run.needs_info_jobs,
        manualJobs: run.manual_jobs,
        discardedJobs: run.discarded_jobs,
      },
      logs,
      jobs,
    };
  }

  start(executionId: string, searchUrl: string, maxPages: number): void {
    if (this.active) {
      throw new Error('An execution is already running');
    }

    const startedAt = new Date().toISOString();
    insertRun.run(executionId, startedAt);

    const cwd = process.cwd();
    const workerFile = ['src', 'workers', 'autoApplyWorker.ts'].join(path.sep);
    const tsxBin = path.join(cwd, 'node_modules', '.bin', 'tsx');

    const child = spawn(tsxBin, [workerFile], {
      cwd,
      env: {
        ...process.env,
        EXECUTION_ID: executionId,
        JOB_SEARCH_URL: searchUrl,
        MAX_PAGES: String(maxPages),
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const timeoutMs = parseInt(process.env.EXECUTION_TIMEOUT_MS || '1200000', 10);
    const timeoutHandle = setTimeout(() => {
      this.stop(executionId, 'Execution timed out after ' + (timeoutMs / 60000) + ' minutes');
    }, timeoutMs);

    this.active = { id: executionId, process: child, timeoutHandle };

    child.on('message', (msg: WorkerMessage) => {
      switch (msg.type) {
        case 'log':
          this.handleLog(executionId, msg.payload);
          break;
        case 'stats':
          this.handleStats(executionId, msg.payload);
          break;
        case 'done':
          this.handleDone(executionId, msg.payload.status, msg.payload.stats);
          break;
      }
    });

    child.on('exit', (code) => {
      if (this.active?.id === executionId) {
        if (code !== 0 && code !== null) {
          this.handleDone(executionId, 'error', null);
        }
        clearTimeout(this.active.timeoutHandle);
        this.active = null;
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      this.handleLog(executionId, {
        timestamp: new Date().toISOString(),
        level: 'error',
        stage: 'system',
        message: data.toString().trim().slice(0, 500),
      });
    });

    this.handleLog(executionId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      stage: 'system',
      message: 'Execution started',
    });
  }

  stop(executionId: string, reason?: string): void {
    if (!this.active || this.active.id !== executionId) {
      throw new Error('No matching execution is running');
    }

    const child = this.active.process;
    try { child.send({ type: 'stop' }); } catch { /* dead */ }

    const killTimeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* dead */ }
    }, 5000);
    child.once('exit', () => clearTimeout(killTimeout));

    this.handleLog(executionId, {
      timestamp: new Date().toISOString(),
      level: 'warn',
      stage: 'system',
      message: reason || 'Execution stopped by user',
    });

    updateRunStatus.run('stopped', new Date().toISOString(), executionId);
    clearTimeout(this.active.timeoutHandle);
    this.active = null;
  }

  private handleLog(executionId: string, event: LogEvent) {
    // Persist to SQLite
    insertLog.run(executionId, event.timestamp, event.level, event.stage, event.message, event.meta ? JSON.stringify(event.meta) : null);

    // Track jobs from log meta
    if (event.meta?.jobId) {
      const jobId = event.meta.jobId as string;
      const title = (event.meta.jobTitle as string) || 'Unknown';
      const company = (event.meta.company as string) || 'Unknown';
      const url = (event.meta.url as string) || null;
      const score = event.meta.match_score != null ? (event.meta.match_score as number) : null;

      let reason: string | null = null;
      if (event.stage === 'apply' && event.message.includes('Application submitted')) {
        reason = 'applied';
      } else if (event.meta.needsInfo) {
        reason = 'needs_info';
      } else if (event.stage === 'fallback' && event.message.includes('Flagged for manual')) {
        reason = 'manual';
      } else if (event.stage === 'decision' && event.message.includes('Skipping job')) {
        reason = 'discarded';
      }

      upsertJob.run(jobId, executionId, title, company, url, score, reason);
    }

    // Emit to SSE subscribers
    logBus.emitLog(executionId, event);
  }

  private handleStats(executionId: string, stats: ExecutionStats) {
    updateRunStats.run(stats.totalJobs, stats.appliedJobs, stats.needsInfoJobs, stats.manualJobs, stats.discardedJobs, executionId);

    logBus.emitLog(executionId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      stage: 'system',
      message: `Stats: ${stats.totalJobs} processed, ${stats.appliedJobs} applied, ${stats.needsInfoJobs || 0} needs info, ${stats.manualJobs} manual, ${stats.discardedJobs} skipped`,
      meta: { ...stats },
    });
  }

  private handleDone(executionId: string, status: 'finished' | 'error', finalStats: ExecutionStats | null) {
    if (finalStats) {
      updateRunStats.run(finalStats.totalJobs, finalStats.appliedJobs, finalStats.needsInfoJobs, finalStats.manualJobs, finalStats.discardedJobs, executionId);
    }
    this.handleLog(executionId, {
      timestamp: new Date().toISOString(),
      level: status === 'finished' ? 'success' : 'error',
      stage: 'system',
      message: status === 'finished' ? 'Execution completed successfully' : 'Execution ended with error',
    });
    updateRunStatus.run(status, new Date().toISOString(), executionId);

    if (this.active?.id === executionId) {
      clearTimeout(this.active.timeoutHandle);
      this.active = null;
    }
  }
}

const g = globalThis as unknown as { orchestrator: Orchestrator };
export const orchestrator = g.orchestrator ?? new Orchestrator();
g.orchestrator = orchestrator;
