import { EventEmitter } from 'events';
import type { LogEvent } from './types';

class LogBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitLog(executionId: string, event: LogEvent) {
    this.emit(`log:${executionId}`, event);
  }

  onLog(executionId: string, handler: (event: LogEvent) => void) {
    this.on(`log:${executionId}`, handler);
    return () => {
      this.removeListener(`log:${executionId}`, handler);
    };
  }
}

const globalForLogger = globalThis as unknown as { logBus: LogBus };
export const logBus = globalForLogger.logBus ?? new LogBus();
globalForLogger.logBus = logBus;
