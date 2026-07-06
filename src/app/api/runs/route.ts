import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { orchestrator } = await import('@/lib/orchestrator');
  return NextResponse.json(orchestrator.listRuns());
}
