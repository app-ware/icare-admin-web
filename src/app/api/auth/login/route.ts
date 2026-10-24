import { cookies } from 'next/headers';
import { z } from 'zod';
import { endpoint, json, readJson, assertOrigin, PortalError } from '@/server/http';
import { authenticateDealer, loadDealer } from '@/server/auth/dealers';
import { getStore, digest } from '@/server/store';
import { sessionCookieName, sessionCookieOptions } from '@/server/auth/session';
import { legacyConfigured } from '@/server/runtime';
const schema = z
  .object({ username: z.string().trim().min(1).max(450), password: z.string().min(1).max(450) })
  .strict();
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    if (!legacyConfigured())
      throw new PortalError(
        503,
        'IDENTITY_NOT_CONFIGURED',
        'iCare sign-in is not configured yet. Ask your administrator to finish the secure connection setup.',
      );
    const credentials = schema.parse(await readJson(request));
    const store = getStore();
    const accountKey = digest(credentials.username.normalize('NFKC').toLowerCase());
    if (
      !store.consumeLimit('login:global', 100, 60_000) ||
      !store.consumeLimit(`login:${accountKey}`, 6, 15 * 60_000)
    )
      throw new PortalError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Too many sign-in attempts. Please try again in 15 minutes.',
      );
    const id = await authenticateDealer(credentials.username, credentials.password);
    const identity = id ? await loadDealer(id) : null;
    if (!identity)
      throw new PortalError(
        401,
        'INVALID_CREDENTIALS',
        'The username or password is incorrect, or the account is inactive.',
      );
    const jar = await cookies();
    const previous = jar.get(sessionCookieName())?.value;
    if (previous) store.revoke(previous);
    const session = store.createSession(identity.dealerId, 'legacy', identity.credentialStamp);
    jar.set(sessionCookieName(), session.token, sessionCookieOptions());
    return json({ ok: true });
  });
}
