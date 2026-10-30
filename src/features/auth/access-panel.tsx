'use client';
import { useState } from 'react';
import { Check, Clock3, KeyRound, Monitor, ShieldCheck } from 'lucide-react';
import type { PortalActor } from '@/domain/access';
import { api } from '@/lib/client';
type Session = { id: string; createdAt: number; lastSeen: number; expiresAt: number };
const labels: Record<string, string> = {
  'integrations.read': 'Review CowPay setup without revealing credentials',
  'centers.read': 'View center profiles',
  'centers.write': 'Update center profiles',
  'centers.branding.read': 'View private portal branding in your centers',
  'centers.branding.write': 'Upload and publish private center logos and photos when enabled',
  'centers.create': 'Create and manage your own drafts',
  'dealers.manage': 'Manage dealer accounts and center assignments',
  'users.manage': 'Manage existing users in your authorized centers',
  'transport.manage': 'Review and configure buses in owned centers when enabled',
  'reports.read': 'Read activity in owned or report-granted centers',
  'reports.export': 'Generate aggregate activity workbooks',
  'alerts.read': 'Read alerts in owned or alert-granted centers',
  'alerts.write': 'Publish alerts in owned centers when enabled',
  'alerts.reset': 'Administrator reset of stored center alerts',
  'status.read': 'Read status in owned or status-granted centers',
  'status.manage': 'Change activation status in owned centers when enabled',
};
export function AccessPanel({
  actor,
  initialSessions,
}: {
  actor: PortalActor;
  initialSessions: Session[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function revoke() {
    setPending(true);
    try {
      await api('/api/auth/sessions', 'DELETE');
      const next = await api<{ items: Session[] }>('/api/auth/sessions');
      setSessions(next.items);
      setNotice('Other sessions signed out.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to revoke sessions.');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CLEAR BOUNDARIES. CONFIDENT WORK.</span>
          <h1>Access & sessions</h1>
          <p>Your permissions and sign-ins, in one place.</p>
        </div>
        <span className="badge blue">
          <ShieldCheck size={14} />
          Protected workspace
        </span>
      </div>
      <div className="access-summary">
        <span className="access-avatar">
          {actor.name
            .split(' ')
            .map((s) => s[0])
            .slice(0, 2)
            .join('')}
        </span>
        <div>
          <h2>{actor.name}</h2>
          <p>{actor.username}</p>
        </div>
        <span className="role-badge">
          {actor.isSuperAdmin ? 'Administrator' : 'Center operator'}
        </span>
        <div className="access-summary-note">
          <ShieldCheck size={17} />
          <span>
            {actor.isSuperAdmin
              ? 'Access across this workspace'
              : 'Limited to your assigned centers'}
          </span>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your permissions</h2>
            <p>Access is applied on the server whenever you view or change a center.</p>
          </div>
          <KeyRound size={21} />
        </div>
        <div className="permission-table">
          {actor.grants.map((grant) => (
            <div key={grant.permission} className="permission-row">
              <span className="permission-check">
                <Check size={16} />
              </span>
              <div>
                <strong>{labels[grant.permission] || grant.permission}</strong>
                <small>{grant.permission}</small>
              </div>
              <span className="scope-label">
                {grant.scope.kind === 'global'
                  ? grant.permission === 'centers.create'
                    ? 'Your own drafts'
                    : 'All workspace centers'
                  : `${grant.scope.keys.length} assigned centers`}
              </span>
            </div>
          ))}
        </div>
        <div className="permission-note">
          <ShieldCheck size={16} />
          <p>
            Center assignments and administrator access follow your iCare account. Contact your
            administrator to request a change.
            {actor.mode === 'legacy' &&
              ' Profile saving also depends on this environment’s write settings.'}
          </p>
        </div>
      </section>
      <section className="panel sessions-panel">
        <div className="panel-heading">
          <div>
            <h2>Active sessions</h2>
            <p>Inactive sessions expire after 30 minutes, with an eight-hour maximum.</p>
          </div>
          <button
            className="button secondary"
            disabled={pending || sessions.length <= 1}
            onClick={() => void revoke()}
          >
            Sign out other sessions
          </button>
        </div>
        {notice && (
          <div className="success-notice" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {sessions.map((s) => (
          <div className="session-row" key={s.id}>
            <span className="session-device">
              <Monitor size={23} />
            </span>
            <div>
              <strong>
                {s.id === actor.sessionId ? 'This session' : 'Another browser session'}
              </strong>
              <small>
                Started{' '}
                {new Date(s.createdAt).toLocaleString('en-GB', {
                  timeZone: 'Asia/Beirut',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}{' '}
                · Beirut time
              </small>
            </div>
            <span className={`badge ${s.id === actor.sessionId ? 'blue' : 'neutral'}`}>
              {s.id === actor.sessionId ? 'Current' : 'Active'}
            </span>
          </div>
        ))}
      </section>
      <div className="release-note">
        <Clock3 size={21} />
        <div>
          <strong>More administration tools are on the way</strong>
          <p>
            Dealer account editing, permission assignment and centralized logging are scheduled for
            later phases.
          </p>
        </div>
      </div>
    </>
  );
}
