export interface LogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: 'fetch' | 'scoring' | 'apply' | 'fallback' | 'decision' | 'system';
  message: string;
  meta?: Record<string, unknown>;
}

export interface ExecutionStats {
  totalJobs: number;
  appliedJobs: number;
  needsInfoJobs: number;
  manualJobs: number;
  discardedJobs: number;
}

export type ParentMessage = { type: 'stop' };

export type WorkerMessage =
  | { type: 'log'; payload: LogEvent }
  | { type: 'stats'; payload: ExecutionStats }
  | { type: 'done'; payload: { status: 'finished' | 'error'; stats: ExecutionStats } };