import { requirePageActor } from '@/server/auth/session';
import { getStore } from '@/server/store';
import { AccessPanel } from '@/features/auth/access-panel';
export const metadata = { title: 'Access & sessions' };
export default async function AccessPage() {
  const actor = await requirePageActor();
  return (
    <AccessPanel actor={actor} initialSessions={getStore().sessions(actor.dealerId, actor.mode)} />
  );
}
