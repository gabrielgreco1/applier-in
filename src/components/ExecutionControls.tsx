'use client';

interface Props {
  status: 'idle' | 'running' | 'stopped' | 'finished' | 'error';
  onStart: () => void;
  onStop: () => void;
}

const STATUS: Record<string, { dot: string; label: string; color: string }> = {
  idle:     { dot: 'bg-gray-500',                  label: 'Ready',   color: 'text-gray-400' },
  running:  { dot: 'bg-emerald-400 animate-pulse',  label: 'Running', color: 'text-emerald-400' },
  stopped:  { dot: 'bg-amber-400',                 label: 'Stopped', color: 'text-amber-400' },
  finished: { dot: 'bg-blue-400',                  label: 'Done',    color: 'text-blue-400' },
  error:    { dot: 'bg-red-400',                   label: 'Error',   color: 'text-red-400' },
};

export function ExecutionControls({ status, onStart, onStop }: Props) {
  const s = STATUS[status];
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1.5 mr-1">
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
      </div>
      <button
        onClick={onStop}
        disabled={status !== 'running'}
        className="h-8 px-4 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-xs
                   font-medium transition-all disabled:opacity-20 disabled:cursor-not-allowed
                   border border-gray-700/50"
      >
        Stop
      </button>
      <button
        onClick={onStart}
        disabled={status === 'running'}
        className="h-8 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs
                   font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed
                   shadow-md shadow-blue-600/25"
      >
        {status === 'running' ? 'Running...' : 'Start Run'}
      </button>
    </div>
  );
}
