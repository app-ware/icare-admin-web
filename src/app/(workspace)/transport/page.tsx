import { requirePageActor } from '@/server/auth/session';
import { TransportWorkspace } from '@/features/transport/transport-workspace';
export const metadata = { title: 'Bus settings' };
export default async function TransportPage() {
  await requirePageActor();
  return <TransportWorkspace />;
}
