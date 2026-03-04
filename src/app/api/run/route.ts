import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { orchestrator } from '@/lib/orchestrator';

interface RunRequest {
  searchUrl?: string;
  maxPages?: number;
}

export async function POST(request: Request) {
  if (orchestrator.isRunning()) {
    return NextResponse.json(
      { error: 'An execution is already running', executionId: orchestrator.getActiveExecutionId() },
      { status: 409 }
    );
  }

  let searchUrl = '';
  let maxPages = 3;

  try {
    const body: RunRequest = await request.json();
    searchUrl = body.searchUrl || '';
    maxPages = Math.max(1, Math.min(20, body.maxPages || 3));
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (!searchUrl || !searchUrl.includes('linkedin.com')) {
    return NextResponse.json(
      { error: 'Please provide a valid LinkedIn search URL' },
      { status: 400 }
    );
  }

  const executionId = uuidv4();

  try {
    orchestrator.start(executionId, searchUrl, maxPages);
    return NextResponse.json({ executionId, status: 'running' }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start execution' },
      { status: 500 }
    );
  }
}
