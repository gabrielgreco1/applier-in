'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ExecutionControls } from '@/components/ExecutionControls';
import { StatsBar } from '@/components/StatsBar';
import { LogConsole } from '@/components/LogConsole';
import { ResultsSummary } from '@/components/ResultsSummary';
import { PastRuns } from '@/components/PastRuns';
import { ConfigModal } from '@/components/ConfigModal';

interface LogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface Stats {
  totalJobs: number;
  appliedJobs: number;
  needsInfoJobs: number;
  manualJobs: number;
  discardedJobs: number;
}

export default function Dashboard() {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'stopped' | 'finished' | 'error'>('idle');
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalJobs: 0, appliedJobs: 0, needsInfoJobs: 0, manualJobs: 0, discardedJobs: 0,
  });
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connectSSE = useCallback((execId: string) => {
    eventSourceRef.current?.close();
    const es = new EventSource(`/api/logs/${execId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const logEvent: LogEvent = JSON.parse(event.data);
      setLogs((prev) => [...prev, logEvent]);

      if (logEvent.meta?.totalJobs !== undefined) {
        setStats({
          totalJobs: (logEvent.meta.totalJobs as number) || 0,
          appliedJobs: (logEvent.meta.appliedJobs as number) || 0,
          needsInfoJobs: (logEvent.meta.needsInfoJobs as number) || 0,
          manualJobs: (logEvent.meta.manualJobs as number) || 0,
          discardedJobs: (logEvent.meta.discardedJobs as number) || 0,
        });
      }

      if (logEvent.stage === 'system') {
        if (logEvent.message.includes('completed successfully')) setStatus('finished');
        if (logEvent.message.includes('ended with error')) setStatus('error');
      }
    };

    es.onerror = () => { /* auto-reconnect */ };
  }, []);

  const handleStart = () => {
    setShowConfigModal(true);
  };

  const handleStartWithConfig = async (searchUrl: string, maxPages: number, easyApplyOnly: boolean) => {
    setShowConfigModal(false);
    setLogs([]);
    setStats({ totalJobs: 0, appliedJobs: 0, needsInfoJobs: 0, manualJobs: 0, discardedJobs: 0 });
    setStatus('running');

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchUrl, maxPages, easyApplyOnly }),
      });
      const data = await res.json();
      if (res.ok) {
        setExecutionId(data.executionId);
        connectSSE(data.executionId);
      } else {
        setStatus('error');
        setLogs([{ timestamp: new Date().toISOString(), level: 'error', stage: 'system', message: data.error || 'Failed to start' }]);
      }
    } catch (err) {
      setStatus('error');
      setLogs([{ timestamp: new Date().toISOString(), level: 'error', stage: 'system', message: `Network error: ${err instanceof Error ? err.message : String(err)}` }]);
    }
  };

  const handleStop = async () => {
    if (!executionId) return;
    try { await fetch(`/api/stop/${executionId}`, { method: 'POST' }); } catch { /* */ }
    setStatus('stopped');
    eventSourceRef.current?.close();
  };

  const handleLoadRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const run = await res.json();
      setExecutionId(runId);
      setLogs(run.logs || []);
      setStats(run.stats || { totalJobs: 0, appliedJobs: 0, needsInfoJobs: 0, manualJobs: 0, discardedJobs: 0 });
      setStatus(run.status || 'finished');
    } catch { /* ignore */ }
  };

  const handleDownloadLogs = () => {
    const text = logs.map((l) =>
      `[${l.timestamp}] [${l.level.toUpperCase().padEnd(7)}] [${l.stage.padEnd(10)}] ${l.message}`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-${executionId || 'logs'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  const filteredLogs = stageFilter ? logs.filter((l) => l.stage === stageFilter) : logs;

  return (
    <>
      <ConfigModal
        isOpen={showConfigModal}
        onSubmit={handleStartWithConfig}
        onCancel={() => setShowConfigModal(false)}
      />
      <div className={`space-y-5 ${status === 'running' ? 'run-live' : ''}`}>
        <section className="studio-hero">
          <div className="studio-hero-inner">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="eyebrow">AutoApply Local</div>
                <h1 className="hero-title">LinkedIn job agent workspace.</h1>
                <p className="hero-copy">
                  Configure once, run locally, review the execution stream, and export applied jobs to XLSX.
                </p>
                <div className="chip-row">
                  <div className="chip"><strong>{stats.appliedJobs}</strong> applied</div>
                  <div className="chip"><strong>{stats.totalJobs}</strong> processed</div>
                  <div className="chip"><strong>{status}</strong> runtime</div>
                  <div className="chip">Open source local app</div>
                </div>
              </div>
              <div className="button-row">
                <a href="/config" className="btn-soft text-sm font-semibold">Config</a>
                <ExecutionControls status={status} onStart={handleStart} onStop={handleStop} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="chip"><strong>Easy Apply</strong> filter on launch</div>
              <div className="chip">Export XLSX ready</div>
            </div>
          </div>
        </section>

        <div className="notice">
          <p className="text-[11px] leading-5">
            AutoApply is not affiliated with LinkedIn. Automation may violate their Terms of Service.
            <strong> LinkedIn search runs often start throttling around 50 jobs, and this app hard-limits runs to 5 pages to reduce account risk.</strong>
          </p>
        </div>

        <StatsBar stats={stats} />

        <div className="app-grid-2" style={{ minHeight: 'calc(100vh - 310px)' }}>
          <div className="min-h-0">
            <ResultsSummary logs={logs} status={status} stats={stats} runId={executionId} />
          </div>
          <div className="min-h-0">
            <LogConsole
              logs={filteredLogs}
              stageFilter={stageFilter}
              onFilterChange={setStageFilter}
              onDownload={handleDownloadLogs}
            />
          </div>
        </div>

        <PastRuns currentRunId={executionId} onLoadRun={handleLoadRun} />
      </div>
    </>
  );
}
