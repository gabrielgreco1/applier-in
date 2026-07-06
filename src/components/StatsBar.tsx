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
    <div className="metric-grid">
      {items.map((item) => (
        <div key={item.label} className="metric-card enter-rise">
          <div className={`absolute bottom-0 left-0 h-[2px] ${item.bar} transition-all duration-500`}
               style={{ width: stats.totalJobs > 0 ? `${(item.value / stats.totalJobs) * 100}%` : '0%' }} />
          <div className={`metric-value ${item.color}`}>{item.value}</div>
          <div className="metric-label">{item.label}</div>
          <div className="metric-track">
            <div className="metric-fill" style={{ width: stats.totalJobs > 0 ? `${(item.value / stats.totalJobs) * 100}%` : '0%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
