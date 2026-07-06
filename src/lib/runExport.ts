export interface LogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface RunStats {
  totalJobs: number;
  appliedJobs: number;
  needsInfoJobs: number;
  manualJobs: number;
  discardedJobs: number;
}

export interface JobRow {
  jobId: string;
  title: string;
  company: string;
  url: string;
  score: number | null;
  status: 'applied' | 'already_applied' | 'needs_info' | 'manual' | 'discarded';
  lastMessage: string;
  updatedAt: string;
}

const STATUS_PRIORITY: Record<JobRow['status'], number> = {
  applied: 4,
  already_applied: 3,
  needs_info: 2,
  manual: 1,
  discarded: 0,
};

function inferStatus(log: LogEvent, current?: JobRow['status']): JobRow['status'] | undefined {
  if (log.stage === 'apply' && /application submitted/i.test(log.message)) return 'applied';
  if (log.stage === 'decision' && /already marked as applied/i.test(log.message)) return 'already_applied';
  if (log.meta?.needsInfo) return 'needs_info';
  if (log.stage === 'fallback' && /manual/i.test(log.message)) return 'manual';
  if (log.stage === 'decision' && /skipping job/i.test(log.message)) return 'discarded';
  return current;
}

export function collectJobsFromLogs(logs: LogEvent[]): JobRow[] {
  const jobs = new Map<string, JobRow>();

  for (const log of logs) {
    const jobId = typeof log.meta?.jobId === 'string' ? log.meta.jobId : undefined;
    if (!jobId) continue;

    const existing = jobs.get(jobId);
    const next: JobRow = existing ? { ...existing } : {
      jobId,
      title: 'Unknown',
      company: 'Unknown',
      url: '',
      score: null,
      status: 'discarded',
      lastMessage: log.message,
      updatedAt: log.timestamp,
    };

    const meta = log.meta ?? {};
    if (typeof meta.jobTitle === 'string' && meta.jobTitle.trim()) next.title = meta.jobTitle;
    if (typeof meta.company === 'string' && meta.company.trim()) next.company = meta.company;
    if (typeof meta.url === 'string') next.url = meta.url;
    if (typeof meta.match_score === 'number') next.score = meta.match_score;
    if (typeof meta.score === 'number') next.score = meta.score;
    next.status = inferStatus(log, next.status) ?? next.status;
    next.lastMessage = log.message;
    next.updatedAt = log.timestamp;

    const current = jobs.get(jobId);
    if (!current || STATUS_PRIORITY[next.status] >= STATUS_PRIORITY[current.status]) {
      jobs.set(jobId, next);
    } else {
      jobs.set(jobId, {
        ...current,
        title: next.title !== 'Unknown' ? next.title : current.title,
        company: next.company !== 'Unknown' ? next.company : current.company,
        url: next.url || current.url,
        score: next.score ?? current.score,
        lastMessage: next.lastMessage,
        updatedAt: next.updatedAt,
      });
    }
  }

  return [...jobs.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

export async function downloadRunXlsx(params: {
  logs: LogEvent[];
  stats: RunStats;
  status: string;
  runId: string | null;
}) {
  const [{ default: XLSX }] = await Promise.all([
    import('xlsx'),
  ]);

  const jobs = collectJobsFromLogs(params.logs);
  const appliedJobs = jobs.filter((job) => job.status === 'applied');
  const alreadyAppliedJobs = jobs.filter((job) => job.status === 'already_applied');

  const summaryRows = [
    { metric: 'Run ID', value: params.runId ?? 'current' },
    { metric: 'Status', value: params.status },
    { metric: 'Processed', value: params.stats.totalJobs },
    { metric: 'Applied', value: params.stats.appliedJobs },
    { metric: 'Already applied', value: alreadyAppliedJobs.length },
    { metric: 'Needs info', value: params.stats.needsInfoJobs },
    { metric: 'Manual', value: params.stats.manualJobs },
    { metric: 'Skipped', value: params.stats.discardedJobs },
    { metric: 'Applied jobs in export', value: appliedJobs.length },
  ];

  const allJobsSheet = XLSX.utils.json_to_sheet(jobs.map((job) => ({
    JobID: job.jobId,
    Title: job.title,
    Company: job.company,
    URL: job.url || '',
    Score: job.score ?? '',
    Status: job.status,
    LastMessage: job.lastMessage,
    UpdatedAt: job.updatedAt,
  })));

  const appliedSheet = XLSX.utils.json_to_sheet(appliedJobs.map((job) => ({
    JobID: job.jobId,
    Title: job.title,
    Company: job.company,
    URL: job.url || '',
    Score: job.score ?? '',
    UpdatedAt: job.updatedAt,
  })));

  const alreadyAppliedSheet = XLSX.utils.json_to_sheet(alreadyAppliedJobs.map((job) => ({
    JobID: job.jobId,
    Title: job.title,
    Company: job.company,
    URL: job.url || '',
    Score: job.score ?? '',
    LastMessage: job.lastMessage,
    UpdatedAt: job.updatedAt,
  })));

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, appliedSheet, 'Applied Jobs');
  XLSX.utils.book_append_sheet(workbook, alreadyAppliedSheet, 'Applied Previously');
  XLSX.utils.book_append_sheet(workbook, allJobsSheet, 'All Jobs');

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `autoapply-${params.runId ?? 'run'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
