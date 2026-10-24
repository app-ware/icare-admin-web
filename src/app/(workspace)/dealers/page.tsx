import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { requirePageActor } from '@/server/auth/session';
import { hasPermission } from '@/domain/access';
import { dealerQuerySchema } from '@/domain/dealers';
import { listDealers } from '@/server/dealers/repository';
import { dealerWritesEnabled } from '@/server/runtime';
import { DealerDirectory } from '@/features/dealers/dealer-directory';
export const metadata = { title: 'Dealers' };
export default async function DealersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePageActor();
  if (!actor.isSuperAdmin || !hasPermission(actor, 'dealers.manage'))
    return (
      <section className="panel dealer-denied">
        <ShieldCheck size={36} />
        <h1>Administrator access required</h1>
        <p>Dealer accounts and center assignments are managed by administrators.</p>
        <Link href="/centers" className="button primary">
          Go to care centers
        </Link>
      </section>
    );
  const parsed = dealerQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : dealerQuerySchema.parse({});
  let initial = null;
  try {
    initial = await listDealers(actor, query);
  } catch {}
  return (
    <DealerDirectory
      initial={initial}
      initialQuery={query}
      actorId={actor.dealerId}
      canWrite={actor.mode === 'preview' || dealerWritesEnabled()}
      mode={actor.mode}
    />
  );
}
