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
    <div className="button-row">
      <div className="flex items-center gap-2 mr-1">
        <span className={`status-dot ${status === 'running' ? 'is-running' : ''} ${s.dot}`} />
        <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
      </div>
      <button
        onClick={onStop}
        disabled={status !== 'running'}
        className="btn-ghost text-xs font-medium disabled:opacity-25 disabled:cursor-not-allowed"
      >
        Stop
      </button>
      <button
        onClick={onStart}
        disabled={status === 'running'}
        className="btn-primary text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === 'running' ? 'Running...' : 'Start Run'}
      </button>
    </div>
  );
}
