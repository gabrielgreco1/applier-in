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
    <div className="rounded-xl bg-gray-900/80 border border-gray-800/60 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60 shrink-0 bg-gray-900/50">
        <div className="flex items-center gap-1">
          {[{ label: 'All', value: null }, ...STAGES.map(s => ({ label: s, value: s }))].map(({ label, value }) => {
            const isActive = value === null ? !stageFilter : stageFilter === value;
            return (
              <button
                key={label}
                onClick={() => onFilterChange(value === stageFilter ? null : value)}
                className={`px-2.5 py-1 text-[10px] rounded-md font-semibold capitalize transition-all ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/50'
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
          className="text-[10px] font-medium text-gray-600 hover:text-gray-400 disabled:opacity-20 transition-colors"
        >
          Export
        </button>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} onScroll={handleScroll}
           className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px] leading-[1.7]">
        {logs.map((log, i) => (
          <div key={i} className={`flex gap-2 px-2 py-[1px] rounded-md ${LEVEL_BG[log.level] || 'hover:bg-white/[0.015]'}`}>
            <span className="text-gray-700 shrink-0 tabular-nums select-none">
              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={`shrink-0 w-[3.2rem] uppercase font-bold text-[10px] leading-[1.9] ${LEVEL_COLORS[log.level] || 'text-gray-500'}`}>
              {log.level}
            </span>
            <span className="text-gray-600 shrink-0 w-16 capitalize text-[10px] leading-[1.9]">{log.stage}</span>
            <span className="text-gray-400 break-words min-w-0">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-700">
            <svg className="w-8 h-8 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Logs will appear here</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800/60 px-3 py-1.5 text-[10px] text-gray-700 flex justify-between font-mono shrink-0 bg-gray-900/50">
        <span>{logs.length} entries</span>
        {stageFilter && <span className="text-gray-600">filter: {stageFilter}</span>}
      </div>
    </div>
  );
}
