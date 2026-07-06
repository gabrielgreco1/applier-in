'use client';

import { useEffect, useRef } from 'react';

interface LogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface Props {
  logs: LogEvent[];
  stageFilter: string | null;
  onFilterChange: (stage: string | null) => void;
  onDownload: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-blue-400/80',
  success: 'text-emerald-400/80',
  warn: 'text-amber-400/80',
  error: 'text-red-400/80',
};

const LEVEL_BG: Record<string, string> = {
  error: 'bg-red-500/5',
  warn: 'bg-amber-500/5',
};

const STAGES = ['fetch', 'scoring', 'apply', 'fallback', 'decision', 'system'];

export function LogConsole({ logs, stageFilter, onFilterChange, onDownload }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  useEffect(() => {
    if (scrollRef.current && autoScrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="panel h-full flex flex-col run-live">
      {/* Header */}
      <div className="panel-header shrink-0">
        <div className="flex items-center gap-1 flex-wrap">
          {[{ label: 'All', value: null }, ...STAGES.map(s => ({ label: s, value: s }))].map(({ label, value }) => {
            const isActive = value === null ? !stageFilter : stageFilter === value;
            return (
              <button
                key={label}
                onClick={() => onFilterChange(value === stageFilter ? null : value)}
                className={`px-3 py-1.5 text-[10px] rounded-full font-semibold capitalize transition-all ${
                  isActive
                    ? 'bg-[rgba(87,230,255,0.14)] text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          onClick={onDownload}
          disabled={logs.length === 0}
          className="btn-ghost text-[11px] font-semibold disabled:opacity-25"
        >
          Export
        </button>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} onScroll={handleScroll}
           className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px] leading-[1.7] scrollbar-soft">
        {logs.map((log, i) => (
          <div key={i} className={`log-row flex gap-2 px-2 py-[2px] rounded-xl ${LEVEL_BG[log.level] || 'hover:bg-white/[0.015]'}`}>
            <span className="text-[var(--text-faint)]/70 shrink-0 tabular-nums select-none">
              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={`shrink-0 w-[3.2rem] uppercase font-bold text-[10px] leading-[1.9] ${LEVEL_COLORS[log.level] || 'text-[var(--text-faint)]'}`}>
              {log.level}
            </span>
            <span className="text-[var(--text-faint)] shrink-0 w-16 capitalize text-[10px] leading-[1.9]">{log.stage}</span>
            <span className="text-[var(--text)]/85 break-words min-w-0">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-faint)]">
            <svg className="w-8 h-8 text-[var(--text-faint)]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Logs will appear here</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 px-3 py-1.5 text-[10px] text-[var(--text-faint)] flex justify-between font-mono shrink-0 bg-black/10">
        <span>{logs.length} entries</span>
        {stageFilter && <span className="text-gray-600">filter: {stageFilter}</span>}
      </div>
    </div>
  );
}
