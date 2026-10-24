import { Shell } from '@/components/shell';
import { requirePageActor } from '@/server/auth/session';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    <Shell actor={{ name: actor.name, mode: actor.mode, isSuperAdmin: actor.isSuperAdmin }}>
      {children}
    </Shell>
  );
}
