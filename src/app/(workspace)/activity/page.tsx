import { requirePageActor } from '@/server/auth/session';
import { ActivityWorkspace } from '@/features/activity/activity-workspace';
export const metadata = { title: 'Activity & insights' };
export default async function ActivityPage() {
  await requirePageActor();
  return <ActivityWorkspace key="activity" mode="activity" />;
}
