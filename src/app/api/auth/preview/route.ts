import { cookies } from 'next/headers';
import { z } from 'zod';
import { endpoint, json, readJson, assertOrigin, PortalError } from '@/server/http';
import { previewEnabled } from '@/server/runtime';
import { getStore } from '@/server/store';
import { demoDealer } from '@/server/auth/dealers';
import { sessionCookieName, sessionCookieOptions } from '@/server/auth/session';
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    if (!previewEnabled()) throw new PortalError(404, 'NOT_FOUND', 'Not found.');
    const { role } = z
      .object({ role: z.enum(['admin', 'dealer']) })
      .strict()
      .parse(await readJson(request));
    const identity = demoDealer(role === 'admin' ? 900001 : 900002);
    if (!identity) throw new PortalError(403, 'ACCOUNT_INACTIVE', 'This demo account is inactive.');
    const store = getStore();
    if (!store.consumeLimit('preview-sessions', 60, 60_000))
      throw new PortalError(429, 'TOO_MANY_ATTEMPTS', 'Please try again shortly.');
    const jar = await cookies();
    const previous = jar.get(sessionCookieName())?.value;
    if (previous) store.revoke(previous);
    const session = store.createSession(identity.dealerId, 'preview', identity.credentialStamp);
    jar.set(sessionCookieName(), session.token, sessionCookieOptions());
    return json({ ok: true });
  });
}
