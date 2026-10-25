import { requirePageActor } from '@/server/auth/session';
import { AlertsWorkspace } from '@/features/alerts/alerts-workspace';
export const metadata = { title: 'Alert messages' };
export default async function AlertsPage() {
  await requirePageActor();
  return <AlertsWorkspace />;
}
