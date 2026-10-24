'use client';
import { useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  LoaderCircle,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { centerTypeLabels } from '@/domain/centers';
import {
  centerUserQuerySchema,
  type CenterUser,
  type CenterUserDirectory,
  type CenterUserQuery,
} from '@/domain/center-users';
import { api } from '@/lib/client';
import { UserCenterPicker, type UserCenterOption } from './center-picker';
import { CenterUserEditor } from './user-editor';
type Selection = { center: UserCenterOption; key: string };
export function CenterUsersDirectory({
  initial,
  initialQuery,
  initialError,
  mappingIssues,
}: {
  initial: CenterUserDirectory | null;
  initialQuery: CenterUserQuery | null;
  initialError: string;
  mappingIssues: number | null;
}) {
  const [query, setQuery] = useState(initialQuery),
    [search, setSearch] = useState(initialQuery?.q ?? ''),
    [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(initialError),
    [nonce, setNonce] = useState(0),
    [notice, setNotice] = useState('');
  const [picker, setPicker] = useState(false),
    [selection, setSelection] = useState<Selection | null>(null),
    [detail, setDetail] = useState<CenterUser | null>(null),
    [detailError, setDetailError] = useState('');
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery((old) => (old && old.q !== search ? { ...old, q: search, page: 1 } : old)),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (query)
      window.history.replaceState(
        null,
        '',
        `/users?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`,
      );
  }, [query]);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<CenterUserDirectory>(
      `/api/center-users?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load center users.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, nonce]);
  useEffect(() => {
    setDetail(null);
    setDetailError('');
    if (!selection) return;
    const controller = new AbortController();
    api<CenterUser>(
      `/api/center-users/${selection.center.type}/${selection.center.id}/${selection.key}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted)
          setDetailError(e instanceof Error ? e.message : 'Unable to load this account.');
      });
    return () => controller.abort();
  }, [selection]);
  async function reload() {
    if (selection)
      setDetail(
        await api<CenterUser>(
          `/api/center-users/${selection.center.type}/${selection.center.id}/${selection.key}`,
        ),
      );
  }
  function choose(center: UserCenterOption) {
    setPicker(false);
    setNotice('');
    setSearch('');
    setQuery(centerUserQuerySchema.parse({ centerId: center.id, centerType: center.type }));
  }
  function saved(user: CenterUser) {
    setSelection(null);
    setNotice(
      `${`${user.firstName} ${user.lastName}`.trim() || user.username || user.localUsername} saved.`,
    );
    setNonce((n) => n + 1);
  }
  function openUser(center: UserCenterOption, key: string) {
    setDetail(null);
    setDetailError('');
    setSelection({ center, key });
  }
  const matches =
    data && data.center.id === query?.centerId && data.center.type === query?.centerType;
  const visible = matches ? data : null;
  const filtered = query && (query.q || query.status !== 'all' || query.role !== 'all');
  function clear() {
    setSearch('');
    setQuery((old) =>
      old
        ? centerUserQuerySchema.parse({ centerId: old.centerId, centerType: old.centerType })
        : null,
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE PEOPLE BEHIND EVERY CENTER</span>
          <h1>Center users</h1>
          <p>Existing accounts, clear profiles and the right center context.</p>
        </div>
        <button className="button secondary" onClick={() => setPicker(true)}>
          <Building2 size={17} />
          {query ? 'Change center' : 'Choose a center'}
          <ChevronDown size={15} />
        </button>
      </div>
      {notice && (
        <div className="dealer-success" role="status">
          <ShieldCheck size={17} />
          {notice}
        </div>
      )}
      <section className="user-center-context">
        <span className="user-center-icon">
          <Building2 size={25} />
        </span>
        <div>
          <span>SELECTED CENTER</span>
          <h2>
            {visible?.center.name ?? (query ? 'Loading center…' : 'Choose a center to get started')}
          </h2>
          {query && (
            <p>
              {centerTypeLabels[query.centerType]} · #{query.centerId}
            </p>
          )}
        </div>
        <span className="badge blue">Center-scoped access</span>
      </section>
      {mappingIssues !== null && mappingIssues > 0 && (
        <div className="user-legacy-note">
          <Info size={18} />
          <p>
            <strong>{mappingIssues} legacy secure accounts need center mapping review.</strong> They
            reference an unsupported center type or an unavailable center and are not assigned
            automatically.
          </p>
        </div>
      )}
      <section className="dealer-stats user-stats" aria-label="Center user summary">
        <div>
          <span className="dealer-stat-icon">
            <UsersRound size={21} />
          </span>
          <span>
            <strong>{visible ? visible.total : '—'}</strong>
            <small>{filtered ? 'Matching accounts' : 'Center accounts'}</small>
          </span>
        </div>
        <div>
          <span className="dealer-stat-icon">
            <ShieldCheck size={21} />
          </span>
          <span>
            <strong>{visible ? visible.enabledCount : '—'}</strong>
            <small>Secure sign-in enabled</small>
          </span>
        </div>
        <div>
          <span className="dealer-stat-icon">
            <Info size={21} />
          </span>
          <span>
            <strong>{visible ? visible.reviewCount : '—'}</strong>
            <small>Mapping review needed</small>
          </span>
        </div>
      </section>
      <section className="panel user-directory-panel">
        <div className="dealer-toolbar">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Search center users</span>
            <input
              value={search}
              disabled={!query}
              maxLength={100}
              placeholder="Search name, username or email"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">Secure sign-in filter</span>
            <select
              disabled={!query}
              value={query?.status ?? 'all'}
              onChange={(e) =>
                setQuery((old) =>
                  old
                    ? { ...old, status: e.target.value as CenterUserQuery['status'], page: 1 }
                    : old,
                )
              }
            >
              <option value="all">All sign-in states</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
              <option value="unknown">Not available</option>
            </select>
          </label>
          <label className="filter-label">
            <span className="sr-only">Center user role filter</span>
            <select
              disabled={!query}
              value={query?.role ?? 'all'}
              onChange={(e) =>
                setQuery((old) =>
                  old ? { ...old, role: e.target.value as CenterUserQuery['role'], page: 1 } : old,
                )
              }
            >
              <option value="all">All account types</option>
              <option value="admin">Administrators</option>
              <option value="staff">Other secure users</option>
              <option value="review">Mapping review</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Refresh center users"
            disabled={!query || loading}
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
        {error ? (
          <div className="dealer-empty" role="alert">
            <h2>Unable to load center users</h2>
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => (query ? setNonce((n) => n + 1) : setPicker(true))}
            >
              Try again
            </button>
          </div>
        ) : !query ? (
          <div className="dealer-empty">
            <Building2 size={33} />
            <h2>Select an accessible center</h2>
            <p>Choose a center to review its existing users.</p>
            <button className="button primary" onClick={() => setPicker(true)}>
              Choose a center
            </button>
          </div>
        ) : !visible ? (
          <div className="dealer-empty" role="status">
            <LoaderCircle className="spin" size={23} />
            <p>Loading center users…</p>
          </div>
        ) : !visible.items.length ? (
          <div className="dealer-empty">
            <UsersRound size={34} />
            <h2>
              {filtered
                ? 'No users match these filters'
                : visible.total
                  ? 'No accounts on this page'
                  : 'No users found for this center'}
            </h2>
            <p>
              {filtered
                ? 'Try a different name or clear the account filters.'
                : 'Existing accounts will appear here once they are linked to this center.'}
            </p>
            {(filtered || visible.total > 0) && (
              <button className="button secondary" onClick={clear}>
                Clear user filters
              </button>
            )}
          </div>
        ) : (
          <div className={`user-grid ${loading ? 'dealer-is-loading' : ''}`} aria-busy={loading}>
            {visible.items.map((user) => {
              const name =
                `${user.firstName} ${user.lastName}`.trim() ||
                user.username ||
                user.localUsername ||
                (user.localId === null
                  ? `Secure account #${user.secureId}`
                  : `Local account #${user.localId}`);
              return (
                <article className="user-card" key={user.key}>
                  <div className="dealer-card-heading">
                    <span className="user-avatar">
                      {name
                        .split(' ')
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join('')}
                    </span>
                    <span
                      className={`status-badge ${user.active === null ? 'unknown' : user.active ? 'active' : 'inactive'}`}
                    >
                      {user.active === null
                        ? 'No secure status'
                        : user.active
                          ? 'Secure sign-in enabled'
                          : 'Secure sign-in disabled'}
                    </span>
                  </div>
                  <h2>{name}</h2>
                  <p className="dealer-username">
                    {user.username || user.localUsername || 'Username unavailable'}
                  </p>
                  <div className="user-card-badges">
                    <span className="dealer-role">
                      {user.isAdmin || user.isSuperAdmin ? (
                        <ShieldCheck size={13} />
                      ) : (
                        <UserRound size={13} />
                      )}{' '}
                      {user.isAdmin || user.isSuperAdmin
                        ? 'Secure administrator'
                        : user.secureId === null
                          ? 'Local account'
                          : 'Center user'}
                    </span>
                    <span
                      className={`user-mapping-badge ${user.mapping === 'review' ? 'needs-review' : ''}`}
                    >
                      {user.mapping === 'linked'
                        ? 'Linked'
                        : user.mapping === 'local'
                          ? 'Local only'
                          : 'Mapping review'}
                    </span>
                  </div>
                  <p className="user-card-email">
                    <Mail size={14} />
                    {user.email || 'No email provided'}
                  </p>
                  <p className="user-card-roles">
                    {user.roles.length ? user.roles.join(' · ') : 'No local roles recorded'}
                  </p>
                  <button
                    className="dealer-manage-link"
                    aria-label={`${user.canEdit ? 'Manage' : 'View'} user ${name}`}
                    onClick={() => openUser(visible.center, user.key)}
                  >
                    {user.canEdit ? 'Manage user' : 'View account'}
                    <ChevronRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
        {visible && !error && (
          <div className="dealer-pagination">
            <span>
              {visible.items.length
                ? `${(visible.page - 1) * visible.pageSize + 1}–${Math.min(visible.page * visible.pageSize, visible.total)} of ${visible.total} accounts`
                : `${visible.total} accounts`}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous user page"
                disabled={loading || visible.page <= 1}
                onClick={() => setQuery((old) => (old ? { ...old, page: old.page - 1 } : old))}
              >
                <ChevronLeft size={18} />
              </button>
              <span>Page {visible.page}</span>
              <button
                className="icon-button"
                aria-label="Next user page"
                disabled={loading || visible.page * visible.pageSize >= visible.total}
                onClick={() => setQuery((old) => (old ? { ...old, page: old.page + 1 } : old))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
      <div className="user-pending-note">
        <Info size={18} />
        <p>
          New center accounts and password resets remain pending. Existing usernames, passwords and
          role assignments are preserved.
        </p>
      </div>
      {picker && <UserCenterPicker onClose={() => setPicker(false)} onSelect={choose} />}
      {selection &&
        (detail ? (
          <CenterUserEditor
            key={detail.revision}
            user={detail}
            center={selection.center}
            onClose={() => setSelection(null)}
            onSaved={saved}
            onReload={reload}
          />
        ) : (
          <Dialog
            title="Center user"
            eyebrow={selection.center.name}
            onClose={() => setSelection(null)}
          >
            {detailError ? (
              <div className="form-error" role="alert">
                {detailError}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => void reload().catch((e) => setDetailError(e.message))}
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="user-help">
                <LoaderCircle className="spin" size={18} />
                Loading account…
              </p>
            )}
          </Dialog>
        ))}
    </>
  );
}
