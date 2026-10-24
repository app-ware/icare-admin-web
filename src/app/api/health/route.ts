import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json(
    { status: 'ok', application: 'icare-admin-portal', liveIntegration: 'pending' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
