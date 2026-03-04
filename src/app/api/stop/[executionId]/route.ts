import { NextResponse } from 'next/server';
import { orchestrator } from '@/lib/orchestrator';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const { executionId } = await params;

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
