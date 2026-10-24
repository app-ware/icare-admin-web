'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronLeft, Info, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import type { CenterRef } from '@/domain/centers';
import { centerUserUpdateSchema, mappingIssueLabels, type CenterUser } from '@/domain/center-users';
import { api, RequestError } from '@/lib/client';
export function CenterUserEditor({
  user,
  center,
  onClose,
  onSaved,
  onReload,
}: {
  user: CenterUser;
  center: CenterRef & { name: string };
  onClose: () => void;
  onSaved: (user: CenterUser) => void;
  onReload: () => Promise<void>;
}) {
  const [values, setValues] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    active: user.active,
  });
  const [dirty, setDirty] = useState(false),
    [review, setReview] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function close() {
    if (!pending && (!dirty || window.confirm('Discard your unsaved user changes?'))) onClose();
  }
  function change<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((old) => ({ ...old, [key]: value }));
    setDirty(true);
  }
  function check(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setConflict(false);
    const result = centerUserUpdateSchema.safeParse({ ...values, revision: user.revision });
    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
      return;
    }
    setErrors({});
    setReview(true);
  }
  async function save() {
    setPending(true);
    setError('');
    try {
      const saved = await api<CenterUser>(
        `/api/center-users/${center.type}/${center.id}/${user.key}`,
        'PATCH',
        { ...values, revision: user.revision },
      );
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save this user.');
      setConflict(e instanceof RequestError && e.code === 'REVISION_CONFLICT');
    } finally {
      setPending(false);
    }
  }
  async function reload() {
    setPending(true);
    try {
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reload.');
    } finally {
      setPending(false);
    }
  }
  const displayName =
    `${user.firstName} ${user.lastName}`.trim() ||
    user.username ||
    user.localUsername ||
    (user.localId === null ? `Secure account #${user.secureId}` : `Local account #${user.localId}`);
  const status = (active: boolean | null) =>
    active === null ? 'Not available' : active ? 'Enabled' : 'Disabled';
  return (
    <Dialog
      title={
        review ? 'Review user changes' : user.canEdit ? 'Manage center user' : 'Center user details'
      }
      eyebrow={center.name}
      onClose={close}
    >
      <div className="user-identity-summary">
        <span className="user-avatar">
          <ShieldCheck size={23} />
        </span>
        <div>
          <h3>{displayName}</h3>
          <p>{user.username || user.localUsername || 'Username unavailable'}</p>
        </div>
        <span className="badge blue">
          {user.isAdmin || user.isSuperAdmin
            ? 'Secure administrator'
            : user.secureId === null
              ? 'Local account'
              : 'Center user'}
        </span>
      </div>
      {user.issues.length > 0 && (
        <div className="user-mapping-warning">
          <strong>
            <Info size={17} />
            {user.issues.some((issue) => issue !== 'protected_account')
              ? 'Mapping review required'
              : 'Protected account'}
          </strong>
          <ul>
            {user.issues.map((issue) => (
              <li key={issue}>{mappingIssueLabels[issue]}</li>
            ))}
          </ul>
          <p>
            {user.issues.some((issue) => issue !== 'protected_account')
              ? 'This account is read-only until its mapping is reviewed.'
              : 'A portal administrator can manage this protected account.'}
          </p>
        </div>
      )}
      {!user.canEdit && !user.issues.length && (
        <p className="inline-notice">
          Changes are disabled in this environment. You can review this account.
        </p>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
          {conflict && (
            <button
              type="button"
              className="text-link"
              disabled={pending}
              onClick={() => void reload()}
            >
              Reload current user
            </button>
          )}
        </div>
      )}
      {review ? (
        <>
          <dl className="user-review">
            <div>
              <dt>First name</dt>
              <dd>{values.firstName || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Last name</dt>
              <dd>{values.lastName || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{values.email || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Secure sign-in</dt>
              <dd>{status(values.active)}</dd>
            </div>
          </dl>
          {values.active !== user.active && (
            <div className="user-status-note">
              <Info size={18} />
              <p>
                This changes database-backed secure sign-in. Existing sessions and legacy clients
                use separate controls.
              </p>
            </div>
          )}
          <div className="dealer-dialog-actions">
            <button
              className="button secondary"
              type="button"
              disabled={pending}
              onClick={() => setReview(false)}
            >
              <ChevronLeft size={16} />
              Back to edit
            </button>
            <button
              className="button primary"
              type="button"
              disabled={pending}
              onClick={() => void save()}
            >
              {pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save user
              changes
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={check}>
          <fieldset className="dealer-form-fieldset" disabled={!user.canEdit || pending}>
            <div className="dealer-fields user-profile-fields">
              <label>
                First name
                <input
                  name="firstName"
                  value={values.firstName}
                  maxLength={50}
                  autoComplete="off"
                  onChange={(e) => change('firstName', e.target.value)}
                />
                {errors.firstName && (
                  <small className="dealer-field-error">{errors.firstName[0]}</small>
                )}
              </label>
              <label>
                Last name
                <input
                  name="lastName"
                  value={values.lastName}
                  maxLength={50}
                  autoComplete="off"
                  onChange={(e) => change('lastName', e.target.value)}
                />
                {errors.lastName && (
                  <small className="dealer-field-error">{errors.lastName[0]}</small>
                )}
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  value={values.email}
                  maxLength={50}
                  autoComplete="off"
                  onChange={(e) => change('email', e.target.value)}
                />
                {errors.email && <small className="dealer-field-error">{errors.email[0]}</small>}
              </label>
              <label>
                Secure sign-in
                <select
                  name="active"
                  disabled={!user.canChangeSignIn}
                  value={
                    values.active === null ? 'unknown' : values.active ? 'enabled' : 'disabled'
                  }
                  onChange={(e) => change('active', e.target.value === 'enabled')}
                >
                  {values.active === null && (
                    <option value="unknown" disabled>
                      Not available
                    </option>
                  )}
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
                <small>
                  {user.secureId === null
                    ? 'No linked secure account. Profile fields can still be updated.'
                    : 'Controls secure database authentication only.'}
                </small>
              </label>
            </div>
          </fieldset>
          <div className="user-readonly-info">
            <h3>
              <LockKeyhole size={16} />
              Identity & permissions
            </h3>
            <dl>
              <div>
                <dt>Secure username</dt>
                <dd>{user.username || 'No secure mapping'}</dd>
              </div>
              <div>
                <dt>Local username</dt>
                <dd>{user.localUsername || 'No local mapping'}</dd>
              </div>
              <div>
                <dt>Account IDs</dt>
                <dd>
                  Local {user.localId ?? '—'} · Secure {user.secureId ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Local roles</dt>
                <dd>
                  {user.roles.length
                    ? user.roles.map((role) => (
                        <span className="user-role-chip" key={role}>
                          {role}
                        </span>
                      ))
                    : 'No local roles recorded'}
                </dd>
              </div>
            </dl>
            <p>
              Usernames, role assignments and passwords are unchanged by this editor. Creation and
              password resets remain pending.
            </p>
          </div>
          <div className="dealer-dialog-actions">
            <button className="button secondary" type="button" disabled={pending} onClick={close}>
              {user.canEdit ? 'Cancel' : 'Close details'}
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={!user.canEdit || !dirty || pending}
            >
              Review changes
              <ShieldCheck size={16} />
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
