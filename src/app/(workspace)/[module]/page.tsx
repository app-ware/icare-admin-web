import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock3, Layers3 } from 'lucide-react';
import { findModule } from '@/features/registry';
import { requirePageActor } from '@/server/auth/session';
export default async function PendingModule({ params }: { params: Promise<{ module: string }> }) {
  await requirePageActor();
  const entry = findModule((await params).module);
  if (!entry) notFound();
  return (
    <>
      <Link className="text-link back-link" href="/">
        <ArrowLeft size={15} />
        Back to overview
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMING NEXT</span>
          <h1>{entry.label}</h1>
          <p>{entry.description}</p>
        </div>
        <span className="badge blue">
          <Clock3 size={13} />
          Pending
        </span>
      </div>
      <section className="panel pending-panel">
        <span className="pending-icon">
          <Layers3 size={34} />
        </span>
        <h2>A place for what’s next</h2>
        <p>
          {entry.id === 'payments'
            ? 'Accounting is waiting for its database to become available.'
            : 'This workflow is scheduled for a later phase of the rebuild.'}
        </p>
        <p>Authentication, scoped access and care center management are available now.</p>
        <Link href="/centers" className="button primary">
          Go to care centers
        </Link>
      </section>
    </>
  );
}
