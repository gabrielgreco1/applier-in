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

export default function Home() {
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

  const handleStartWithConfig = async (searchUrl: string, maxPages: number) => {
    setShowConfigModal(false);
    setLogs([]);
    setStats({ totalJobs: 0, appliedJobs: 0, needsInfoJobs: 0, manualJobs: 0, discardedJobs: 0 });
    setStatus('running');

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchUrl, maxPages }),
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
      <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">AutoApply</h1>
            <p className="text-[11px] text-gray-600 -mt-0.5">AI-powered LinkedIn job agent</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/config" className="h-8 px-4 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-xs
                                  font-medium transition-all border border-gray-700/50 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Config
          </a>
          <ExecutionControls status={status} onStart={handleStart} onStop={handleStop} />
        </div>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ height: 'calc(100vh - 260px)', minHeight: '400px' }}>
        <div className="lg:col-span-4 min-h-0">
          <ResultsSummary logs={logs} status={status} />
        </div>
        <div className="lg:col-span-8 min-h-0">
          <LogConsole
            logs={filteredLogs}
            stageFilter={stageFilter}
            onFilterChange={setStageFilter}
            onDownload={handleDownloadLogs}
          />
        </div>
      </div>

      {/* Past Runs */}
      <PastRuns currentRunId={executionId} onLoadRun={handleLoadRun} />
      </div>
    </>
  );
}
