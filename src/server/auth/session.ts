import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PortalActor } from '@/domain/access';
import { getStore, ABSOLUTE_MS } from '@/server/store';
import { previewEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';
import { loadDealer, demoDealer, centerGrants } from './dealers';

export const sessionCookieName = () =>
  process.env.NODE_ENV === 'production' ? '__Host-icare_session' : 'icare_session';
export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: ABSOLUTE_MS / 1000,
});
export const getCurrentPrincipal = cache(async (): Promise<PortalActor | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  const store = getStore();
  const session = store.session(token);
  if (!session) return null;
  const identity =
    session.mode === 'preview'
      ? previewEnabled()
        ? demoDealer(session.dealerId)
        : null
      : await loadDealer(session.dealerId);
  if (!identity || session.credentialStamp !== identity.credentialStamp) {
    if (token) store.revoke(token);
    return null;
  }
  const ownedKeys = identity.ownedKeys;
  return {
    subject: `${session.mode}:${identity.dealerId}`,
    dealerId: identity.dealerId,
    active: true,
    expiresAt: session.expiresAt,
    grants: centerGrants(
      identity.isSuperAdmin,
      ownedKeys,
      identity.reportKeys,
      identity.statusKeys,
      identity.alertKeys,
    ),
    mode: session.mode,
    name: identity.name,
    username: identity.username,
    isSuperAdmin: identity.isSuperAdmin,
    sessionId: session.id,
  };
});
export async function requireActor() {
  const actor = await getCurrentPrincipal();
  if (!actor) throw new PortalError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  return actor;
}
export async function requirePageActor() {
  const actor = await getCurrentPrincipal();
  if (!actor) redirect('/login');
  return actor;
}
