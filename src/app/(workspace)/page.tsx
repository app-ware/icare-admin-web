import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  FilePenLine,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { requirePageActor } from '@/server/auth/session';
import { listCenters } from '@/server/centers/repository';
import { directoryQuerySchema } from '@/domain/management';
import { getStore } from '@/server/store';
import { centerTypeLabels } from '@/domain/centers';
export default async function OverviewPage() {
  const actor = await requirePageActor();
  let result = null;
  try {
    result = await listCenters(actor, directoryQuerySchema.parse({}));
  } catch {}
  const drafts = getStore()
    .drafts(actor.dealerId, actor.mode)
    .filter((d) => !d.published);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, AT A GLANCE</span>
          <h1>
            Good to see you, {actor.name.split(' ')[0]} <span className="wave">✦</span>
          </h1>
          <p>A little more organized. A lot more connected.</p>
        </div>
        <Link className="button secondary" href="/centers">
          View care centers <ArrowUpRight size={16} />
        </Link>
      </div>
      <section className="welcome-panel">
        <div>
          <span className="hero-kicker">
            <span />
            ONE CONNECTED WORKSPACE
          </span>
          <h2>
            Your centers.
            <br />
            One clear view.
          </h2>
          <p>
            Find a center, make an update, and get on with
            <br className="desktop-break" /> the things that matter.
          </p>
          <Link href="/centers?create=1" className="button primary">
            <Plus size={17} />
            New center draft
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-ring" />
          <div className="hero-building">
            <Building2 size={85} strokeWidth={1} />
            <div className="hero-building-caption">A place for every center</div>
          </div>
          <div className="hero-float float-top">
            <ShieldCheck size={19} />
            Connected with care
          </div>
          <div className="hero-float float-bottom">
            <span className="check-dot">
              <Check size={14} />
            </span>
            A clearer day starts here
          </div>
          <span className="hero-spark">✦</span>
        </div>
      </section>
      <div className="stats-grid">
        <section className="stat-card">
          <span className="stat-icon">
            <Building2 size={21} />
          </span>
          <span className="stat-label">Accessible centers</span>
          <strong>{result?.total ?? '—'}</strong>
          <small>Within your assigned scope</small>
        </section>
        <section className="stat-card">
          <span className="stat-icon">
            <FilePenLine size={21} />
          </span>
          <span className="stat-label">Center drafts</span>
          <strong>{drafts.length.toString().padStart(2, '0')}</strong>
          <small>Saved and ready to continue</small>
        </section>
        <section className="stat-card">
          <span className="stat-icon">
            <ShieldCheck size={21} />
          </span>
          <span className="stat-label">Your workspace role</span>
          <strong className="stat-word">{actor.isSuperAdmin ? 'Administrator' : 'Operator'}</strong>
          <small>
            {actor.isSuperAdmin ? 'All centers in this workspace' : 'Only your assigned centers'}
          </small>
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Your care centers</h2>
              <p>A quick way back to the details.</p>
            </div>
            <Link href="/centers" className="text-link">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {result?.items.length ? (
            <div className="center-shortlist">
              {result.items.slice(0, 4).map((c) => (
                <Link
                  href={`/centers/${c.type}/${c.id}`}
                  className="center-shortcut"
                  key={`${c.id}_${c.type}`}
                >
                  <span className={`center-avatar type-${c.type}`}>
                    {c.profile.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{c.profile.name}</strong>
                    <small>
                      {centerTypeLabels[c.type]} · {c.domain || `#${c.id}`}
                    </small>
                  </span>
                  <span
                    className={`status-badge ${c.active === null ? 'unknown' : c.active ? 'active' : 'inactive'}`}
                  >
                    {c.active === null ? 'Unknown' : c.active ? 'Active' : 'Inactive'}
                  </span>
                  <ArrowUpRight size={17} className="shortcut-arrow" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Building2 size={30} />
              <h3>{result ? 'No centers assigned yet' : 'Center data is unavailable'}</h3>
              <p>
                {result
                  ? 'Your administrator can assign centers to your account.'
                  : 'Open the directory to retry the connection.'}
              </p>
              <Link href="/centers" className="text-link">
                Open directory <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </section>
        <section className="panel workspace-guide">
          <span className="guide-icon">
            <Sparkles size={23} />
          </span>
          <h2>Settle into your workspace</h2>
          <p>
            Simple steps. Clear permissions.
            <br />
            Everything in its place.
          </p>
          <Link href="/centers">
            <span className="step-number">1</span>
            <span>
              Find your care centers<small>Search, filter and explore</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <Link href="/centers?tab=drafts">
            <span className="step-number">2</span>
            <span>
              Pick up a saved draft<small>Continue at your own pace</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <Link href="/access">
            <span className="step-number">3</span>
            <span>
              Understand your access<small>Permissions and active sessions</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
      <div className="release-note">
        <span className="mini-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <strong>Growing with your workflow</strong>
          <p>Accounting and logging will join this workspace when their databases are available.</p>
        </div>
        <span className="badge blue">Coming later</span>
      </div>
    </>
  );
}
