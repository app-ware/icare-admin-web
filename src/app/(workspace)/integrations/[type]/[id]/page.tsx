import { notFound } from 'next/navigation';
import { cowpayRefSchema } from '@/domain/cowpay';
import { requirePageActor } from '@/server/auth/session';
import { CowpayCenterReview } from '@/features/cowpay/cowpay-detail';
export const metadata = { title: 'CowPay setup review' };
export default async function CowpayCenterPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  await requirePageActor();
  const p = await params,
    ref = cowpayRefSchema.safeParse({ id: Number(p.id), type: Number(p.type) });
  if (!ref.success) notFound();
  return <CowpayCenterReview center={ref.data} />;
}
