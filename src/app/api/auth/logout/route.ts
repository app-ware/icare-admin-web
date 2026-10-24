import { cookies } from 'next/headers';
import { endpoint, json, assertOrigin } from '@/server/http';
import { getStore } from '@/server/store';
import { sessionCookieName, sessionCookieOptions } from '@/server/auth/session';
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const jar = await cookies();
    const token = jar.get(sessionCookieName())?.value;
    if (token) getStore().revoke(token);
    jar.set(sessionCookieName(), '', { ...sessionCookieOptions(), maxAge: 0 });
    return json({ ok: true });
  });
}
