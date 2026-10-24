import { requirePageActor } from '@/server/auth/session';
import { ActivityWorkspace } from '@/features/activity/activity-workspace';
export const metadata = { title: 'Activity reports' };
export default async function ReportsPage() {
  await requirePageActor();
  return <ActivityWorkspace key="reports" mode="reports" />;
}
