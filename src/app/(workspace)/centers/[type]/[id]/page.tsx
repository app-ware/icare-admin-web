import { notFound } from 'next/navigation';
import { centerRefSchema } from '@/domain/centers';
import { requirePageActor } from '@/server/auth/session';
import { getCenter } from '@/server/centers/repository';
import { CenterDetail } from '@/features/centers/center-detail';
import { AccessDeniedError } from '@/domain/access';
import { PortalError } from '@/server/http';
export const metadata = { title: 'Center details' };
export default async function CenterPage({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const actor = await requirePageActor();
  const p = await params;
  const parsed = centerRefSchema.safeParse({ id: Number(p.id), type: Number(p.type) });
  if (!parsed.success) notFound();
  try {
    return <CenterDetail initial={await getCenter(actor, parsed.data)} mode={actor.mode} />;
  } catch (e) {
    if (e instanceof AccessDeniedError || (e instanceof PortalError && e.status === 404))
      notFound();
    throw e;
  }
}
