import { logBus } from '@/lib/logger';
import { orchestrator } from '@/lib/orchestrator';
import type { LogEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const { executionId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Replay existing logs from SQLite
      for (const log of orchestrator.getLogs(executionId)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`));
      }

      // Subscribe to live events
      const unsubscribe = logBus.onLog(executionId, (event: LogEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* disconnected */ }
      });

      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try { controller.close(); } catch { /* closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Encoding': 'none',
    },
  });
}
