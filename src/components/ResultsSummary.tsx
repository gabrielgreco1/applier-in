'use client';

import { useState } from 'react';

interface LogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface Job {
  jobId: string;
  title: string;
  company: string;
  url?: string;
  score?: number;
  reason?: 'applied' | 'needs_info' | 'manual' | 'discarded';
}

type SectionKey = 'applied' | 'needs_info' | 'manual' | 'discarded';

interface ResultsSummaryProps {
  logs: LogEvent[];
  status: 'idle' | 'running' | 'stopped' | 'finished' | 'error';
}

function parseJobs(logs: LogEvent[]): Map<string, Job> {
  const jobs = new Map<string, Job>();

  logs.forEach((log) => {
    const jobId = log.meta?.jobId as string;
    if (!jobId) return;

    if (!jobs.has(jobId)) {
      jobs.set(jobId, { jobId, title: 'Unknown', company: 'Unknown', url: undefined });
    }
    const job = jobs.get(jobId)!;

    if (log.meta?.url) job.url = log.meta.url as string;
    if (log.meta?.jobTitle) job.title = log.meta.jobTitle as string;
    if (log.meta?.company) job.company = log.meta.company as string;
    if (log.stage === 'scoring' && log.meta?.match_score !== undefined) {
      job.score = log.meta.match_score as number;
    }

    if (log.stage === 'apply' && log.message.includes('Application submitted')) {
      job.reason = 'applied';
    } else if (log.meta?.needsInfo) {
      job.reason = 'needs_info';
    } else if (log.stage === 'fallback' && log.message.includes('Flagged for manual')) {
      job.reason = 'manual';
    } else if (log.stage === 'decision' && log.message.includes('Skipping job')) {
      job.reason = 'discarded';
    }
  });

  return jobs;
}

const SECTIONS: Array<{ key: SectionKey; label: string; dot: string; accent: string; hoverBg: string }> = [
  { key: 'applied',    label: 'Applied',       dot: 'bg-emerald-400', accent: 'text-emerald-400', hoverBg: 'hover:bg-emerald-500/5' },
  { key: 'needs_info', label: 'Needs Info',    dot: 'bg-orange-400',  accent: 'text-orange-400',  hoverBg: 'hover:bg-orange-500/5' },
  { key: 'manual',     label: 'Manual Apply',  dot: 'bg-amber-400',   accent: 'text-amber-400',   hoverBg: 'hover:bg-amber-500/5' },
  { key: 'discarded',  label: 'Skipped',       dot: 'bg-red-400',     accent: 'text-red-400',     hoverBg: 'hover:bg-red-500/5' },
];

export function ResultsSummary({ logs, status }: ResultsSummaryProps) {
  const [expanded, setExpanded] = useState<SectionKey | null>('applied');

  const allJobs = parseJobs(logs);
  const buckets: Record<SectionKey, Job[]> = {
    applied: [], needs_info: [], manual: [], discarded: [],
  };
  allJobs.forEach((job) => {
    if (job.reason && buckets[job.reason]) buckets[job.reason].push(job);
  });

  const total = Object.values(buckets).reduce((s, b) => s + b.length, 0);

  if (status === 'idle' && total === 0) return null;

  return (
    <div className="rounded-xl bg-gray-900/80 border border-gray-800/60 overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between shrink-0 bg-gray-900/50">
        <span className="text-xs font-semibold text-gray-300 tracking-wide">Job Results</span>
        {status === 'running' && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-700">
            <svg className="w-8 h-8 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-xs">{status === 'running' ? 'Processing jobs...' : 'No results yet'}</span>
          </div>
        ) : (
          SECTIONS.map(({ key, label, dot, accent, hoverBg }) => {
            const jobs = buckets[key];
            const isOpen = expanded === key;

            return (
              <div key={key} className="border-b border-gray-800/40 last:border-b-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors ${hoverBg}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className={`text-xs font-medium ${accent}`}>{label}</span>
                  <span className="text-[10px] font-mono text-gray-600 bg-gray-800/60 rounded-full px-2 py-0.5">
                    {jobs.length}
                  </span>
                  <svg
                    className={`w-3 h-3 ml-auto text-gray-700 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="pb-1">
                    {jobs.length === 0 ? (
                      <div className="px-4 py-3 text-[11px] text-gray-700">None yet</div>
                    ) : jobs.map((job) => (
                      <div key={job.jobId}
                           className="flex items-center gap-3 px-4 py-2 mx-2 rounded-lg hover:bg-gray-800/40 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-gray-200 truncate font-medium">{job.title}</div>
                          <div className="text-[11px] text-gray-600 truncate">{job.company}</div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {job.score !== undefined && (
                            <span className="text-[10px] font-mono text-gray-600 tabular-nums bg-gray-800/50 rounded px-1.5 py-0.5">
                              {job.score}
                            </span>
                          )}
                          {job.url && (
                            <a href={job.url} target="_blank" rel="noopener noreferrer"
                               className="text-[10px] text-blue-500 hover:text-blue-400 font-medium transition-colors">
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
