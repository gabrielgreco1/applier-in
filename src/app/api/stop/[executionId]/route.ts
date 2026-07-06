import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const { executionId } = await params;
  const { orchestrator } = await import('@/lib/orchestrator');

  try {
    orchestrator.stop(executionId);
    return NextResponse.json({ status: 'stopped' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to stop execution' },
      { status: 400 }
    );
  }
}
