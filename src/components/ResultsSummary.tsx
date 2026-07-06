'use client';

import { useState } from 'react';
import { downloadRunXlsx, type LogEvent, type RunStats, collectJobsFromLogs } from '@/lib/runExport';

interface Job {
  jobId: string;
  title: string;
  company: string;
  url?: string;
  score?: number;
  reason?: 'applied' | 'already_applied' | 'needs_info' | 'manual' | 'discarded';
}

type SectionKey = 'applied' | 'already_applied' | 'needs_info' | 'manual' | 'discarded';

interface ResultsSummaryProps {
  logs: LogEvent[];
  status: 'idle' | 'running' | 'stopped' | 'finished' | 'error';
  stats: RunStats;
  runId: string | null;
}

const SECTIONS: Array<{ key: SectionKey; label: string; dot: string; accent: string; hoverBg: string }> = [
  { key: 'applied',    label: 'Applied',       dot: 'bg-emerald-400', accent: 'text-emerald-400', hoverBg: 'hover:bg-emerald-500/5' },
  { key: 'already_applied', label: 'Applied Previously', dot: 'bg-cyan-400', accent: 'text-cyan-400', hoverBg: 'hover:bg-cyan-500/5' },
  { key: 'needs_info', label: 'Needs Info',    dot: 'bg-orange-400',  accent: 'text-orange-400',  hoverBg: 'hover:bg-orange-500/5' },
  { key: 'manual',     label: 'Manual Apply',  dot: 'bg-amber-400',   accent: 'text-amber-400',   hoverBg: 'hover:bg-amber-500/5' },
  { key: 'discarded',  label: 'Skipped',       dot: 'bg-red-400',     accent: 'text-red-400',     hoverBg: 'hover:bg-red-500/5' },
];

export function ResultsSummary({ logs, status, stats, runId }: ResultsSummaryProps) {
  const [expanded, setExpanded] = useState<SectionKey | null>('applied');
  const [exporting, setExporting] = useState(false);
  const allJobs = collectJobsFromLogs(logs);
  const buckets: Record<SectionKey, Job[]> = {
    applied: [], already_applied: [], needs_info: [], manual: [], discarded: [],
  };
  allJobs.forEach((job) => {
    if (job.status && buckets[job.status]) buckets[job.status].push({
      jobId: job.jobId,
      title: job.title,
      company: job.company,
      url: job.url || undefined,
      score: job.score ?? undefined,
      reason: job.status,
    });
  });

  const total = Object.values(buckets).reduce((s, b) => s + b.length, 0);
  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadRunXlsx({ logs, stats, status, runId });
    } finally {
      setExporting(false);
    }
  };

  if (status === 'idle' && total === 0) return null;

  return (
    <div className="panel panel-compact h-full flex flex-col">
      <div className="panel-header">
        <div>
          <div className="panel-title">Job Results</div>
          <div className="panel-kicker">Applied jobs exported as XLSX, with summary and full history.</div>
        </div>
        <button
          onClick={handleExport}
          disabled={logs.length === 0 || exporting}
          className="btn-soft text-[11px] font-semibold disabled:opacity-35"
        >
          {exporting ? 'Exporting...' : 'Export XLSX'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-[var(--text-faint)]">
            <svg className="w-8 h-8 text-[var(--text-faint)]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-xs">{status === 'running' ? 'Processing jobs...' : 'No results yet'}</span>
          </div>
        ) : (
          SECTIONS.map(({ key, label, dot, accent, hoverBg }) => {
            const jobs = buckets[key];
            const isOpen = expanded === key;

            return (
              <div key={key} className="border-b border-white/5 last:border-b-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 transition-colors ${hoverBg}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className={`text-xs font-medium ${accent}`}>{label}</span>
                  <span className="text-[10px] font-mono text-[var(--text-faint)] bg-white/5 rounded-full px-2 py-0.5">
                    {jobs.length}
                  </span>
                  <span className={`ml-auto text-[10px] font-mono text-[var(--text-faint)] ${isOpen ? 'opacity-100' : 'opacity-60'}`}>
                    {isOpen ? 'open' : 'closed'}
                  </span>
                </button>

                {isOpen && (
                  <div className="pb-1">
                    {jobs.length === 0 ? (
                      <div className="px-4 py-3 text-[11px] text-[var(--text-faint)]">None yet</div>
                    ) : jobs.map((job) => (
                      <div key={job.jobId}
                           className="flex items-center gap-3 px-4 py-2 mx-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-[var(--text)] truncate font-medium">{job.title}</div>
                          <div className="text-[11px] text-[var(--text-faint)] truncate">{job.company}</div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {job.score !== undefined && (
                            <span className="text-[10px] font-mono text-[var(--text-faint)] tabular-nums bg-white/5 rounded px-1.5 py-0.5">
                              {job.score}
                            </span>
                          )}
                          {job.url && (
                            <a href={job.url} target="_blank" rel="noopener noreferrer"
                               className="text-[10px] text-[var(--accent)] hover:opacity-80 font-medium transition-colors">
                              Open
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
