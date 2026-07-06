import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  const { orchestrator } = await import('@/lib/orchestrator');
  const run = orchestrator.getRun(runId);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json(run);
}
