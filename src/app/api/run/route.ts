import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

interface RunRequest {
  searchUrl?: string;
  maxPages?: number;
  easyApplyOnly?: boolean;
}

const MAX_PAGES_LIMIT = 5;

export async function POST(request: Request) {
  let searchUrl = '';
  let maxPages = 3;
  let easyApplyOnly = false;

  try {
    const body: RunRequest = await request.json();
    searchUrl = body.searchUrl || '';
    maxPages = Math.max(1, Math.min(MAX_PAGES_LIMIT, body.maxPages || 3));
    easyApplyOnly = Boolean(body.easyApplyOnly);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!searchUrl || !searchUrl.includes('linkedin.com')) {
    return NextResponse.json({ error: 'Please provide a valid LinkedIn search URL' }, { status: 400 });
  }

  if (maxPages > MAX_PAGES_LIMIT) {
    return NextResponse.json({ error: `Page cap is limited to ${MAX_PAGES_LIMIT} to reduce account throttling risk` }, { status: 400 });
  }

  const executionId = uuidv4();
  const { orchestrator } = await import('@/lib/orchestrator');

  if (orchestrator.isRunning()) {
    return NextResponse.json(
      { error: 'An execution is already running', executionId: orchestrator.getActiveExecutionId() },
      { status: 409 }
    );
  }

  try {
    orchestrator.start(executionId, searchUrl, maxPages, easyApplyOnly);
    return NextResponse.json({ executionId, status: 'running' }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start execution' },
      { status: 500 }
    );
  }
}
