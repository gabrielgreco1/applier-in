import { NextResponse } from 'next/server';
import { orchestrator } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(orchestrator.listRuns());
}
