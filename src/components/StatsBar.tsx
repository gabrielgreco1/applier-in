'use client';

interface Props {
  stats: {
    totalJobs: number;
    appliedJobs: number;
    needsInfoJobs: number;
    manualJobs: number;
    discardedJobs: number;
  };
}

export function StatsBar({ stats }: Props) {
  const items = [
    { label: 'Processed', value: stats.totalJobs,      color: 'text-white',       bar: 'bg-gray-500' },
    { label: 'Applied',   value: stats.appliedJobs,    color: 'text-emerald-400', bar: 'bg-emerald-500' },
    { label: 'Needs Info', value: stats.needsInfoJobs, color: 'text-orange-400',  bar: 'bg-orange-500' },
    { label: 'Manual',    value: stats.manualJobs,     color: 'text-amber-400',   bar: 'bg-amber-500' },
    { label: 'Skipped',   value: stats.discardedJobs,  color: 'text-red-400',     bar: 'bg-red-500' },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {items.map((item) => (
        <div key={item.label} className="relative overflow-hidden rounded-xl bg-gray-900/80 border border-gray-800/60 px-4 py-3.5">
          <div className={`absolute bottom-0 left-0 h-[2px] ${item.bar} transition-all duration-500`}
               style={{ width: stats.totalJobs > 0 ? `${(item.value / stats.totalJobs) * 100}%` : '0%' }} />
          <div className={`text-2xl font-bold tabular-nums tracking-tight ${item.color}`}>{item.value}</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
