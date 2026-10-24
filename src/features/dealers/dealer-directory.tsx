'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Dialog } from '@/components/dialog';
import {
  dealerQuerySchema,
  type DealerDirectory as Directory,
  type DealerQuery,
  type DealerDetail,
} from '@/domain/dealers';
import { api } from '@/lib/client';
import { DealerEditor } from './dealer-editor';

export function DealerDirectory({
  initial,
  initialQuery,
  actorId,
  canWrite,
  mode,
}: {
  initial: Directory | null;
  initialQuery: DealerQuery;
  actorId: number;
  canWrite: boolean;
  mode: 'legacy' | 'preview';
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery),
    [search, setSearch] = useState(initialQuery.q);
  const [data, setData] = useState(initial),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [nonce, setNonce] = useState(0),
    [notice, setNotice] = useState('');
  const [opened, setOpened] = useState<number | 'new' | null>(null),
    [detail, setDetail] = useState<DealerDetail | null>(null),
    [detailError, setDetailError] = useState('');
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery((old) => (old.q === search ? old : { ...old, q: search, page: 1 })),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    window.history.replaceState(
      null,
      '',
      `/dealers?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`,
    );
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<Directory>(
      `/api/dealers?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load dealers.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, nonce]);
  useEffect(() => {
    setDetail(null);
    setDetailError('');
    if (typeof opened !== 'number') return;
    const controller = new AbortController();
    api<DealerDetail>(`/api/dealers/${opened}`, 'GET', undefined, controller.signal)
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted)
          setDetailError(e instanceof Error ? e.message : 'Unable to load this dealer.');
      });
    return () => controller.abort();
  }, [opened]);
  async function reloadDetail() {
    if (typeof opened === 'number') setDetail(await api<DealerDetail>(`/api/dealers/${opened}`));
  }
  function saved(dealer: DealerDetail) {
    const created = opened === 'new';
    setOpened(null);
    setNotice(`${dealer.name} ${created ? 'created' : 'saved'}.`);
    setNonce((n) => n + 1);
    router.refresh();
  }
  function clear() {
    setSearch('');
    setQuery(dealerQuerySchema.parse({}));
  }
  const filtered = query.q || query.status !== 'all' || query.role !== 'all';
  const total = data?.total ?? 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PEOPLE & ACCESS</span>
          <h1>Dealers</h1>
          <p>The right people. The right centers. Clear control.</p>
        </div>
        <button className="button primary" disabled={!canWrite} onClick={() => setOpened('new')}>
          <Plus size={17} />
          New dealer
        </button>
      </div>
      {notice && (
        <div className="dealer-success" role="status">
          <ShieldCheck size={18} />
          {notice}
        </div>
      )}
      {!canWrite && (
        <p className="inline-notice">
          Dealer management is in view-only mode. Account changes need to be enabled by your
          administrator.
        </p>
      )}
      {mode === 'preview' && (
        <p className="dealer-form-note">
          Demo accounts and assignments stay separate from real iCare accounts. Demo passwords are
          not saved or used for sign-in.
        </p>
      )}
      <section className="dealer-stats" aria-label="Dealer account summary">
        <div>
          <span className="dealer-stat-icon">
            <UsersRound size={21} />
          </span>
          <span>
            <strong>{data ? total : '—'}</strong>
            <small>{filtered ? 'Matching accounts' : 'Dealer accounts'}</small>
          </span>
        </div>
        <div>
          <span className="dealer-stat-icon">
            <UserRound size={21} />
          </span>
          <span>
            <strong>{data ? data.activeCount : '—'}</strong>
            <small>Active accounts{filtered ? ' in results' : ''}</small>
          </span>
        </div>
        <div>
          <span className="dealer-stat-icon">
            <ShieldCheck size={21} />
          </span>
          <span>
            <strong>{data ? data.adminCount : '—'}</strong>
            <small>Active administrators{filtered ? ' in results' : ''}</small>
          </span>
        </div>
      </section>
      <section className="panel dealer-directory-panel">
        <div className="dealer-toolbar">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Search dealers</span>
            <input
              value={search}
              maxLength={100}
              placeholder="Search name, username or email"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">Account status</span>
            <select
              value={query.status}
              onChange={(e) =>
                setQuery((old) => ({
                  ...old,
                  status: e.target.value as DealerQuery['status'],
                  page: 1,
                }))
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Disabled</option>
            </select>
          </label>
          <label className="filter-label">
            <span className="sr-only">Account role filter</span>
            <select
              value={query.role}
              onChange={(e) =>
                setQuery((old) => ({
                  ...old,
                  role: e.target.value as DealerQuery['role'],
                  page: 1,
                }))
              }
            >
              <option value="all">All roles</option>
              <option value="admin">Administrators</option>
              <option value="dealer">Dealers</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Refresh dealers"
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
        {error ? (
          <div className="dealer-empty" role="alert">
            <h2>Unable to load dealers</h2>
            <p>{error}</p>
            <button className="button secondary" onClick={() => setNonce((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : !data ? (
          <div className="dealer-empty" role="status">
            <LoaderCircle className="spin" size={24} />
            <p>Loading dealer accounts…</p>
          </div>
        ) : !data.items.length ? (
          <div className="dealer-empty">
            <UsersRound size={34} />
            <h2>{total ? 'No accounts on this page' : 'No dealers match your filters'}</h2>
            <p>
              {total
                ? 'Return to the first page to see the current results.'
                : 'Try a different name or update the account filters.'}
            </p>
            <button className="button secondary" onClick={clear}>
              {total ? 'Return to first page' : 'Clear filters'}
            </button>
          </div>
        ) : (
          <div className={`dealer-grid ${loading ? 'dealer-is-loading' : ''}`} aria-busy={loading}>
            {data.items.map((dealer) => (
              <article className="dealer-card" key={dealer.id}>
                <div className="dealer-card-heading">
                  <span
                    className={`dealer-avatar ${dealer.isSuperAdmin ? 'dealer-admin-avatar' : ''}`}
                  >
                    {dealer.name
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((v) => v[0])
                      .join('') || 'D'}
                  </span>
                  <span className={`status-badge ${dealer.active ? 'active' : 'inactive'}`}>
                    {dealer.active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <h2>
                  {dealer.name || 'Unnamed account'}
                  {dealer.id === actorId && <span className="dealer-you">You</span>}
                </h2>
                <p className="dealer-username">@{dealer.username || 'No username'}</p>
                <span className={`dealer-role ${dealer.isSuperAdmin ? 'is-admin' : ''}`}>
                  {dealer.isSuperAdmin ? <ShieldCheck size={14} /> : <UserRound size={14} />}{' '}
                  {dealer.isSuperAdmin ? 'Administrator' : 'Dealer'}
                </span>
                <div className="dealer-card-meta">
                  <span>
                    <Mail size={15} />
                    <span>{dealer.email || 'No email provided'}</span>
                  </span>
                  <span>
                    <Building2 size={15} />
                    {dealer.isSuperAdmin
                      ? 'All centers'
                      : `${dealer.centerCount} ${dealer.centerCount === 1 ? 'center' : 'centers'} assigned`}
                  </span>
                </div>
                <button
                  className="dealer-manage-link"
                  aria-label={`Manage ${dealer.name || dealer.username}`}
                  onClick={() => setOpened(dealer.id)}
                >
                  Manage dealer
                  <ArrowUpRight size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
        {data && !error && (
          <div className="dealer-pagination">
            <span>
              {total && data.items.length
                ? `${(query.page - 1) * data.pageSize + 1}–${Math.min(query.page * data.pageSize, total)} of ${total} accounts`
                : total
                  ? `${total} accounts · no results on this page`
                  : '0 accounts'}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous dealer page"
                disabled={loading || query.page <= 1}
                onClick={() => setQuery((old) => ({ ...old, page: old.page - 1 }))}
              >
                <ChevronLeft size={18} />
              </button>
              <span>Page {query.page}</span>
              <button
                className="icon-button"
                aria-label="Next dealer page"
                disabled={loading || query.page * data.pageSize >= total}
                onClick={() => setQuery((old) => ({ ...old, page: old.page + 1 }))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
      <div className="dealer-security-note">
        <ShieldCheck size={19} />
        <p>
          Only administrators can manage dealers. Status, role and center changes take effect on the
          next request and sign out affected sessions.
        </p>
      </div>
      {opened !== null && (opened === 'new' || detail?.id === opened) ? (
        <DealerEditor
          key={opened === 'new' ? 'new' : detail!.revision}
          dealer={opened === 'new' ? undefined : detail!}
          actorId={actorId}
          canWrite={canWrite}
          onClose={() => setOpened(null)}
          onSaved={saved}
          onReload={reloadDetail}
        />
      ) : (
        opened !== null && (
          <Dialog title="Dealer account" eyebrow="PEOPLE & ACCESS" onClose={() => setOpened(null)}>
            {detailError ? (
              <div className="form-error" role="alert">
                {detailError}
                <button
                  className="text-link"
                  onClick={() => void reloadDetail().catch((e) => setDetailError(e.message))}
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="dealer-form-note">
                <LoaderCircle className="spin" size={18} />
                Loading account…
              </p>
            )}
          </Dialog>
        )
      )}
    </>
  );
}
