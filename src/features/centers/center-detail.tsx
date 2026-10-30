'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  LoaderCircle,
} from 'lucide-react';
import { centerTypeLabels } from '@/domain/centers';
import type { ManagedCenter } from '@/domain/management';
import { api, RequestError } from '@/lib/client';
import { ProfileFields, readProfileForm } from './profile-fields';
import { BrandingPanel } from './branding-panel';
export function CenterDetail({
  initial,
  mode,
}: {
  initial: ManagedCenter;
  mode: 'legacy' | 'preview';
}) {
  const [center, setCenter] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function reload() {
    if (dirty && !window.confirm('Discard your unsaved changes and reload the latest profile?'))
      return;
    setPending(true);
    try {
      setCenter(await api<ManagedCenter>(`/api/centers/${center.type}/${center.id}`));
      setDirty(false);
      setEditing(false);
      setConflict(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reload.');
    } finally {
      setPending(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const profile = readProfileForm(new FormData(event.currentTarget), center.profile);
      setPending(true);
      const saved = await api<ManagedCenter>(`/api/centers/${center.type}/${center.id}`, 'PATCH', {
        revision: center.revision,
        profile,
      });
      setCenter(saved);
      setDirty(false);
      setEditing(false);
      setNotice('Center profile saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
      setConflict(e instanceof RequestError && e.status === 409);
    } finally {
      setPending(false);
    }
  }
  const profile = center.profile;
  return (
    <>
      <Link href="/centers" className="text-link back-link">
        <ArrowLeft size={15} />
        All care centers
      </Link>
      <Link
        className="text-link user-center-shortcut"
        href={`/users?centerId=${center.id}&centerType=${center.type}`}
      >
        Manage this center’s users <ArrowRight size={15} />
      </Link>
      <div className="center-detail-heading">
        <span className={`center-avatar large type-${center.type}`}>
          {logo ? <img src={logo} alt={`${profile.name} logo`} /> : profile.name.slice(0, 1)}
        </span>
        <div>
          <div className="detail-kicker">
            <span className="badge blue">{centerTypeLabels[center.type]}</span>
            <span
              className={`status-badge ${center.active === null ? 'unknown' : center.active ? 'active' : 'inactive'}`}
            >
              {center.active === null ? 'Status unknown' : center.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <h1>{profile.name}</h1>
          <p>
            {center.domain ? `${center.domain} · ` : ''}Center #{center.id}
          </p>
        </div>
        {!editing && center.canEdit && (
          <button
            className="button primary"
            onClick={() => {
              setEditing(true);
              setNotice('');
            }}
          >
            <Pencil size={16} />
            Edit profile
          </button>
        )}
      </div>
      {notice && (
        <div className="success-notice" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {!center.canEdit && (
        <div className="inline-notice">
          <ShieldCheck size={17} />
          This center is available to view. Profile changes are not enabled for this account or
          environment.
        </div>
      )}
      <div className="detail-grid">
        <section className="panel profile-panel">
          <div className="panel-heading">
            <div>
              <h2>{editing ? 'Edit center profile' : 'Center profile'}</h2>
              <p>
                {editing
                  ? 'Keep the details your team relies on up to date.'
                  : 'A few important details, all in one place.'}
              </p>
            </div>
            <Building2 size={21} />
          </div>
          {editing ? (
            <form onSubmit={save} onChange={() => setDirty(true)}>
              <fieldset disabled={pending}>
                <ProfileFields key={center.revision} profile={profile} />
                {center.invalidLocation && (
                  <p className="inline-notice">
                    Existing coordinates need review. Enter valid coordinates to replace them; blank
                    fields preserve the legacy value.
                  </p>
                )}
              </fieldset>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                  {conflict && (
                    <button type="button" className="text-link" onClick={() => void reload()}>
                      Reload latest details
                    </button>
                  )}
                </div>
              )}
              <div className="form-actions">
                <span>{dirty ? 'Unsaved changes' : 'No changes yet'}</span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending}
                  onClick={() => {
                    if (!dirty || window.confirm('Discard your unsaved changes?')) {
                      setEditing(false);
                      setDirty(false);
                      setError('');
                    }
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={pending || !dirty}>
                  {pending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}Save
                  changes
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="profile-summary">
                <Info icon={<Building2 size={18} />} label="Manager" value={profile.manager} />
                <Info icon={<Mail size={18} />} label="Contact email" value={profile.email} />
                <Info icon={<Phone size={18} />} label="Mobile number" value={profile.mobile} />
                <Info icon={<Phone size={18} />} label="Landline" value={profile.landline} />
                <Info icon={<Globe size={18} />} label="Website" value={profile.website} />
                <Info icon={<MapPin size={18} />} label="Address" value={profile.address} />
              </div>
              <div className="profile-description">
                <h3>About this center</h3>
                <p>{profile.description || 'No description has been added yet.'}</p>
              </div>
              <div className="location-panel">
                <MapPin size={21} />
                <div>
                  <strong>Center location</strong>
                  <p>
                    {profile.location
                      ? `${profile.location.latitude}, ${profile.location.longitude}`
                      : center.invalidLocation
                        ? 'Existing coordinates need review.'
                        : 'No coordinates added yet.'}
                  </p>
                </div>
                {profile.location && (
                  <a
                    className="text-link"
                    href={`https://www.openstreetmap.org/?mlat=${profile.location.latitude}&mlon=${profile.location.longitude}#map=16/${profile.location.latitude}/${profile.location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View map ↗
                  </a>
                )}
              </div>
            </>
          )}
        </section>
        <aside className="detail-sidebar">
          <section className="panel identity-panel">
            <span className="mini-icon">
              <ShieldCheck size={20} />
            </span>
            <h2>Center identity</h2>
            <dl>
              <div>
                <dt>Center reference</dt>
                <dd>
                  {center.id}_{center.type}
                </dd>
              </div>
              <div>
                <dt>Center type</dt>
                <dd>{centerTypeLabels[center.type]}</dd>
              </div>
              <div>
                <dt>Domain</dt>
                <dd>{center.domain || 'Not set'}</dd>
              </div>
              <div>
                <dt>Time zone</dt>
                <dd>{center.timeZone || 'Not configured'}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>{mode === 'preview' ? 'Demo · fictional data' : 'iCare'}</dd>
              </div>
            </dl>
            <p className="field-hint">
              Center type and domain are managed separately from the profile.
            </p>
          </section>
          <section className="detail-note">
            <span className="eyebrow">COMING NEXT</span>
            <h3>More of your center, connected.</h3>
            <p>QR generation and administrator account creation remain planned for later phases.</p>
          </section>
        </aside>
      </div>
      <BrandingPanel center={{ id: center.id, type: center.type }} onLogo={setLogo} />
    </>
  );
}
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="profile-info">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value || 'Not added'}</strong>
      </div>
    </div>
  );
}
