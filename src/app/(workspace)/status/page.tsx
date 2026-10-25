import { requirePageActor } from '@/server/auth/session';
import { StatusWorkspace } from '@/features/status/status-workspace';
export const metadata = { title: 'Center status' };
export default async function StatusPage() {
  await requirePageActor();
  return <StatusWorkspace />;
}
