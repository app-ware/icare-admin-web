import { Suspense } from 'react';
import { requirePageActor } from '@/server/auth/session';
import { CowpayWorkspace } from '@/features/cowpay/cowpay-workspace';
export const metadata = { title: 'CowPay readiness' };
export default async function CowpayPage() {
  await requirePageActor();
  return (
    <Suspense fallback={<p>Loading CowPay readiness…</p>}>
      <CowpayWorkspace />
    </Suspense>
  );
}
