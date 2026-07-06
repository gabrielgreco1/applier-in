'use client';

import { useState, useEffect } from 'react';

interface RunSummary {
  runId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stats: {
    totalJobs: number;
    appliedJobs: number;
    needsInfoJobs: number;
    manualJobs: number;
    discardedJobs: number;
  };
}

interface Props {
  currentRunId: string | null;
  onLoadRun: (runId: string) => void;
}

export function PastRuns({ currentRunId, onLoadRun }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/runs');
        if (res.ok) setRuns(await res.json());
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (runs.length === 0) return null;

  const statusColors: Record<string, string> = {
    finished: 'text-emerald-400',
    error: 'text-red-400',
    stopped: 'text-amber-400',
    running: 'text-blue-400',
  };

  const statusDots: Record<string, string> = {
    finished: 'bg-emerald-400',
    error: 'bg-red-400',
    stopped: 'bg-amber-400',
    running: 'bg-blue-400 animate-pulse',
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">History</div>
          <div className="panel-kicker">Recent executions from this machine.</div>
        </div>
      </div>
      <div className="divide-y divide-white/5 max-h-52 overflow-y-auto scrollbar-soft">
        {runs.map((run) => {
          const isCurrent = run.runId === currentRunId;
          const d = new Date(run.startedAt);
          const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });

          return (
            <button
              key={run.runId}
              onClick={() => onLoadRun(run.runId)}
              className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors ${
                isCurrent ? 'bg-[rgba(87,230,255,0.04)] border-l-2 border-[var(--accent)]' : 'border-l-2 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDots[run.status] || 'bg-gray-600'}`} />
                <span className="text-xs text-[var(--text-faint)] font-mono tabular-nums whitespace-nowrap">{dateStr} {timeStr}</span>
                <span className={`text-[10px] font-semibold capitalize ${statusColors[run.status] || 'text-gray-500'}`}>
                  {run.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono tabular-nums shrink-0 ml-auto">
                <span className="text-[var(--text-faint)]">{run.stats.totalJobs} total</span>
                <span className="text-emerald-400">{run.stats.appliedJobs}</span>
                <span className="text-orange-400">{run.stats.needsInfoJobs || 0}</span>
                <span className="text-amber-400">{run.stats.manualJobs}</span>
                <span className="text-red-400">{run.stats.discardedJobs}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
