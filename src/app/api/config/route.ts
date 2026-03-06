import { NextResponse } from 'next/server';
import { loadConfig, saveConfig, maskApiKey } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = loadConfig();
  return NextResponse.json({
    ...config,
    openaiApiKey: maskApiKey(config.openaiApiKey),
    linkedinPassword: maskApiKey(config.linkedinPassword),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // If the masked key was sent back unchanged, don't overwrite the real key
    if (body.openaiApiKey && (body.openaiApiKey.includes('...') || body.openaiApiKey === '****')) {
      delete body.openaiApiKey;
    }
    if (body.linkedinPassword && (body.linkedinPassword.includes('...') || body.linkedinPassword === '****')) {
      delete body.linkedinPassword;
    }

    const saved = saveConfig(body);
    return NextResponse.json({
      ...saved,
      openaiApiKey: maskApiKey(saved.openaiApiKey),
      linkedinPassword: maskApiKey(saved.linkedinPassword),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save config' },
      { status: 400 }
    );
  }
}
