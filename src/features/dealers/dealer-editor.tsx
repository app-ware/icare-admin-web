'use client';
import { useEffect, useState } from 'react';
import { Building2, Check, ChevronLeft, LoaderCircle, Search, ShieldCheck, X } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { centerKey, centerTypeLabels } from '@/domain/centers';
import {
  dealerCreateSchema,
  dealerUpdateSchema,
  type DealerDetail,
  type CenterOption,
} from '@/domain/dealers';
import { api, RequestError } from '@/lib/client';

export function DealerEditor({
  dealer,
  actorId,
  canWrite,
  onClose,
  onSaved,
  onReload,
}: {
  dealer?: DealerDetail;
  actorId: number;
  canWrite: boolean;
  onClose: () => void;
  onSaved: (dealer: DealerDetail) => void;
  onReload: () => Promise<void>;
}) {
  const [values, setValues] = useState({
    name: dealer?.name ?? '',
    username: dealer?.username ?? '',
    email: dealer?.email ?? '',
    password: '',
    active: dealer?.active ?? true,
    isSuperAdmin: dealer?.isSuperAdmin ?? false,
  });
  const [selected, setSelected] = useState<CenterOption[]>(dealer?.centers ?? []);
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1);
  const [options, setOptions] = useState<CenterOption[]>([]),
    [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true),
    [optionError, setOptionError] = useState('');
  const [retry, setRetry] = useState(0),
    [review, setReview] = useState(false),
    [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const self = dealer?.id === actorId;
  const locked = !canWrite || Boolean(dealer?.unsupportedAssignments);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOptionError('');
    api<{ items: CenterOption[]; total: number }>(
      `/api/dealers/centers?${new URLSearchParams({ q: filter, page: String(page) })}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        setOptions((old) =>
          page === 1
            ? data.items
            : [...new Map([...old, ...data.items].map((c) => [centerKey(c), c])).values()],
        );
        setTotal(data.total);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setOptionError(e instanceof Error ? e.message : 'Unable to load centers.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, page, retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function close() {
    if (!pending && (!dirty || window.confirm('Discard your unsaved dealer changes?'))) onClose();
  }
  function change<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((old) => ({ ...old, [key]: value }));
    setDirty(true);
  }
  function toggle(center: CenterOption) {
    setSelected((old) =>
      old.some((c) => centerKey(c) === centerKey(center))
        ? old.filter((c) => centerKey(c) !== centerKey(center))
        : [...old, center],
    );
    setDirty(true);
  }
  function payload() {
    const common = {
      name: values.name,
      email: values.email,
      active: values.active,
      isSuperAdmin: values.isSuperAdmin,
      centers: selected.map(({ id, type }) => ({ id, type })),
    };
    return dealer
      ? { ...common, revision: dealer.revision }
      : { ...common, username: values.username, password: values.password };
  }
  function check(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setConflict(false);
    const parsed = (dealer ? dealerUpdateSchema : dealerCreateSchema).safeParse(payload());
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setReview(true);
  }
  async function save() {
    setPending(true);
    setError('');
    setConflict(false);
    try {
      const saved = await api<DealerDetail>(
        dealer ? `/api/dealers/${dealer.id}` : '/api/dealers',
        dealer ? 'PATCH' : 'POST',
        payload(),
      );
      setDirty(false);
      setValues((old) => ({ ...old, password: '' }));
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save the dealer.');
      setConflict(e instanceof RequestError && e.status === 409 && e.code === 'REVISION_CONFLICT');
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
  const selectedKeys = new Set(selected.map(centerKey));
  return (
    <Dialog
      title={review ? 'Review dealer access' : dealer ? 'Manage dealer' : 'Create a dealer'}
      eyebrow="PEOPLE & ACCESS"
      onClose={close}
    >
      <p className="dealer-dialog-intro">
        {review
          ? 'Confirm the account and access below before saving.'
          : dealer
            ? 'Keep this account’s details and center access up to date.'
            : 'Give an operator their own account and choose the centers they can manage.'}
      </p>
      {locked && (
        <p className="inline-notice">
          {dealer?.unsupportedAssignments
            ? 'This account has unsupported legacy mappings and needs a mapping review before editing.'
            : 'Dealer changes are disabled in this environment. You can review account details.'}
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
              Reload current account
            </button>
          )}
        </div>
      )}
      {review ? (
        <>
          <div className="dealer-review">
            <span className="dealer-review-icon">
              <ShieldCheck size={25} />
            </span>
            <h3>{values.name}</h3>
            <p>@{values.username}</p>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>{values.email || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{values.active ? 'Active' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>
                  {values.isSuperAdmin
                    ? 'Administrator · all centers'
                    : 'Dealer · selected centers'}
                </dd>
              </div>
              <div>
                <dt>Center assignments</dt>
                <dd>
                  {selected.length ? selected.map((c) => c.name).join(', ') : 'No centers assigned'}
                </dd>
              </div>
              {!dealer && (
                <div>
                  <dt>Password</dt>
                  <dd>Initial password provided</dd>
                </div>
              )}
            </dl>
          </div>
          {values.isSuperAdmin && (
            <p className="inline-notice">
              Administrators can manage every center and all dealer accounts.
            </p>
          )}
          {!values.active && (
            <p className="inline-notice">This account cannot sign in while disabled.</p>
          )}
          {dealer && !self && (
            <p className="dealer-form-note">
              Changing the account’s role, status or center assignments signs out its current
              sessions.
            </p>
          )}
          {!values.isSuperAdmin && !selected.length && (
            <p className="inline-notice">
              This dealer will have no center access until an administrator assigns a center.
            </p>
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
              disabled={pending || locked}
              onClick={() => void save()}
            >
              {pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{' '}
              {dealer ? 'Save changes' : 'Create dealer'}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={check}>
          <fieldset className="dealer-form-fieldset" disabled={pending || locked}>
            <div className="dealer-fields">
              <label>
                Display name
                <input
                  name="name"
                  value={values.name}
                  required
                  minLength={2}
                  maxLength={160}
                  autoComplete="off"
                  onChange={(e) => change('name', e.target.value)}
                />
                {fieldErrors.name && (
                  <small className="dealer-field-error">{fieldErrors.name[0]}</small>
                )}
              </label>
              <label>
                Username
                <input
                  name="username"
                  value={values.username}
                  required
                  minLength={3}
                  maxLength={dealer ? 450 : 100}
                  readOnly={Boolean(dealer)}
                  autoComplete="off"
                  onChange={(e) => change('username', e.target.value)}
                />
                <small>
                  {dealer
                    ? 'Username stays the same to preserve existing sign-ins.'
                    : 'Letters, numbers, dots, underscores, @, + and hyphens.'}
                </small>
                {fieldErrors.username && (
                  <small className="dealer-field-error">{fieldErrors.username[0]}</small>
                )}
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  maxLength={200}
                  value={values.email}
                  autoComplete="off"
                  onChange={(e) => change('email', e.target.value)}
                />
                {fieldErrors.email && (
                  <small className="dealer-field-error">{fieldErrors.email[0]}</small>
                )}
              </label>
              {!dealer && (
                <label>
                  Initial password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={values.password}
                    autoComplete="new-password"
                    onChange={(e) => change('password', e.target.value)}
                  />
                  <small>At least 12 characters. It is never shown again or sent by email.</small>
                  {fieldErrors.password && (
                    <small className="dealer-field-error">{fieldErrors.password[0]}</small>
                  )}
                </label>
              )}
              <label>
                Account role
                <select
                  name="role"
                  value={values.isSuperAdmin ? 'admin' : 'dealer'}
                  disabled={self}
                  onChange={(e) => change('isSuperAdmin', e.target.value === 'admin')}
                >
                  <option value="dealer">Dealer · selected centers</option>
                  <option value="admin">Administrator · all centers</option>
                </select>
              </label>
              <label className="dealer-check dealer-active">
                <input
                  name="active"
                  type="checkbox"
                  checked={values.active}
                  disabled={self}
                  onChange={(e) => change('active', e.target.checked)}
                />
                <span>
                  <strong>Account active</strong>
                  <small>Allow this account to sign in.</small>
                </span>
              </label>
            </div>
            {self && (
              <p className="dealer-form-note">
                You can update your details, but cannot disable yourself or remove your
                administrator role.
              </p>
            )}
            <section className="dealer-center-selector" aria-label="Center assignments">
              <div className="dealer-section-title">
                <Building2 size={18} />
                <h3>Center assignments</h3>
                <span className="badge blue">{selected.length} selected</span>
              </div>
              <p>
                {values.isSuperAdmin
                  ? 'This administrator can access all centers. These assignments are retained if the role changes later.'
                  : 'Choose the centers this dealer can view and edit. Center type is included in every assignment.'}
              </p>
              {selected.length > 0 && (
                <div className="dealer-selected-centers">
                  {selected.map((c) => (
                    <button
                      type="button"
                      key={centerKey(c)}
                      onClick={() => toggle(c)}
                      aria-label={`Remove ${c.name}`}
                    >
                      <span>{c.name}</span>
                      <X size={13} />
                    </button>
                  ))}
                </div>
              )}
              <label className="dealer-center-search">
                <Search size={16} />
                <span className="sr-only">Search available centers</span>
                <input
                  value={search}
                  placeholder="Find a center by name or ID"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {optionError ? (
                <div className="form-error" role="alert">
                  {optionError}
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => setRetry((n) => n + 1)}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="dealer-center-options" aria-busy={loading}>
                  {options.map((c) => (
                    <label key={centerKey(c)} className="dealer-check">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(centerKey(c))}
                        disabled={!selectedKeys.has(centerKey(c)) && selected.length >= 500}
                        onChange={() => toggle(c)}
                      />
                      <span>
                        <strong>{c.name}</strong>
                        <small>
                          {centerTypeLabels[c.type]} · #{c.id}
                        </small>
                      </span>
                    </label>
                  ))}
                  {loading && (
                    <p className="dealer-form-note">
                      <LoaderCircle className="spin" size={16} /> Loading centers…
                    </p>
                  )}
                  {!loading && !options.length && (
                    <p className="dealer-form-note">No centers match your search.</p>
                  )}
                </div>
              )}
              {options.length < total && !optionError && (
                <button
                  className="text-link"
                  type="button"
                  disabled={loading}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Load more centers
                </button>
              )}
              {fieldErrors.centers && (
                <p className="dealer-field-error">{fieldErrors.centers[0]}</p>
              )}
            </section>
          </fieldset>
          <div className="dealer-dialog-actions">
            <button className="button secondary" type="button" disabled={pending} onClick={close}>
              Cancel
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={pending || locked || (!dirty && Boolean(dealer))}
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
