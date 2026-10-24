'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  FilePenLine,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { centerTypeLabels } from '@/domain/centers';
import {
  directoryQuerySchema,
  type DirectoryQuery,
  type DirectoryResult,
  type SavedDraft,
} from '@/domain/management';
import { api } from '@/lib/client';
import { CenterWizard } from './center-wizard';
export function CenterDirectory({
  initial,
  initialQuery,
  mode,
  initialCreate,
  initialTab,
}: {
  initial: DirectoryResult | null;
  initialQuery: DirectoryQuery;
  mode: 'legacy' | 'preview';
  initialCreate: boolean;
  initialTab: 'directory' | 'drafts';
}) {
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery.q);
  const [data, setData] = useState(initial);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [wizard, setWizard] = useState<SavedDraft | 'new' | null>(initialCreate ? 'new' : null);
  const [nonce, setNonce] = useState(0);
  const [draftLoading, setDraftLoading] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    params.set('tab', tab);
    window.history.replaceState(null, '', `/centers?${params}`);
  }, [query, tab]);
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery((q) => (q.q === search ? q : { ...q, q: search, page: 1 })),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    params.set('tab', tab);
    api<DirectoryResult>(`/api/centers?${params}`, 'GET', undefined, controller.signal)
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load centers.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, nonce, tab]);
  useEffect(() => {
    const controller = new AbortController();
    setDraftLoading(true);
    api<{ items: SavedDraft[] }>('/api/center-drafts', 'GET', undefined, controller.signal)
      .then((result) => {
        setDrafts(result.items);
        setDraftError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setDraftError(e instanceof Error ? e.message : 'Unable to load drafts.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDraftLoading(false);
      });
    return () => controller.abort();
  }, [nonce]);
  async function removeDraft(draft: SavedDraft) {
    if (!window.confirm(`Delete the draft for ${draft.data.profile.name}?`)) return;
    try {
      await api(`/api/center-drafts/${draft.id}`, 'DELETE');
      setNonce((n) => n + 1);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Unable to delete draft.');
    }
  }
  const openDrafts = drafts.filter((d) => !d.published);
  const filtered = query.q || query.type !== 'all' || query.status !== 'all';
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONNECTED CARE</span>
          <h1>Care centers</h1>
          <p>Every center in your scope. Every detail in its place.</p>
        </div>
        <button className="button primary" onClick={() => setWizard('new')}>
          <Plus size={17} />
          New center draft
        </button>
      </div>
      <div className="directory-context">
        <span className="mini-icon">
          <ShieldCheck size={19} />
        </span>
        <div>
          <strong>Just the centers you need</strong>
          <p>Your assigned access is checked whenever you view or update a center.</p>
        </div>
        <span className="badge blue">{mode === 'preview' ? 'Demo data' : 'Scoped access'}</span>
      </div>
      <div className="tab-bar">
        <button
          className={tab === 'directory' ? 'selected' : ''}
          onClick={() => setTab('directory')}
        >
          <Building2 size={17} />
          Center directory
        </button>
        <button className={tab === 'drafts' ? 'selected' : ''} onClick={() => setTab('drafts')}>
          <FilePenLine size={17} />
          My drafts<span className="count-pill">{openDrafts.length}</span>
        </button>
      </div>
      {tab === 'directory' ? (
        <section className="panel directory-panel">
          <div className="directory-toolbar">
            <div className="search-field">
              <Search size={18} />
              <label htmlFor="center-search" className="sr-only">
                Search centers
              </label>
              <input
                id="center-search"
                value={search}
                maxLength={120}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, domain or ID…"
              />
              {search && (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <label className="filter-label">
              <span className="sr-only">Center type</span>
              <select
                aria-label="Center type"
                value={query.type}
                onChange={(e) =>
                  setQuery({ ...query, type: e.target.value as DirectoryQuery['type'], page: 1 })
                }
              >
                <option value="all">All center types</option>
                <option value="1">Nursery</option>
                <option value="3">Lite</option>
                <option value="4">School</option>
              </select>
            </label>
            <label className="filter-label">
              <span className="sr-only">Activation status</span>
              <select
                aria-label="Activation status"
                value={query.status}
                onChange={(e) =>
                  setQuery({
                    ...query,
                    status: e.target.value as DirectoryQuery['status'],
                    page: 1,
                  })
                }
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <button
              className="icon-button refresh-button"
              aria-label="Refresh centers"
              onClick={() => setNonce((n) => n + 1)}
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
            </button>
          </div>
          <div className="directory-subbar">
            <span role="status">
              {loading
                ? 'Updating centers…'
                : `${data?.total ?? 0} ${data?.total === 1 ? 'center' : 'centers'} found`}
            </span>
            <div>
              {filtered && (
                <button
                  className="text-link"
                  onClick={() => {
                    setSearch('');
                    setQuery(directoryQuerySchema.parse({}));
                  }}
                >
                  Clear filters
                </button>
              )}
              <label>
                <span className="sr-only">Sort centers</span>
                <select
                  aria-label="Sort centers"
                  className="sort-select"
                  value={query.sort}
                  onChange={(e) =>
                    setQuery({ ...query, sort: e.target.value as DirectoryQuery['sort'], page: 1 })
                  }
                >
                  <option value="name">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                  <option value="type">Center type</option>
                </select>
              </label>
            </div>
          </div>
          {error ? (
            <div className="empty-state" role="alert">
              <ShieldCheck size={30} />
              <h2>We couldn’t load your centers</h2>
              <p>{error}</p>
              <button className="button secondary" onClick={() => setNonce((n) => n + 1)}>
                Try again
              </button>
              <Link className="text-link" href="/login?switch=1">
                Sign in again
              </Link>
            </div>
          ) : !data?.items.length && !loading ? (
            <div className="empty-state">
              <Search size={32} />
              <h2>{filtered ? 'No centers match these filters' : 'No centers assigned yet'}</h2>
              <p>
                {filtered
                  ? 'Try a different name or clear your filters.'
                  : 'Your administrator can assign centers to your account.'}
              </p>
              {filtered && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearch('');
                    setQuery(directoryQuerySchema.parse({}));
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className={`table-scroll ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
              <table className="centers-table">
                <thead>
                  <tr>
                    <th>Care center</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Open center</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((c) => (
                    <tr key={`${c.id}_${c.type}`}>
                      <td>
                        <Link href={`/centers/${c.type}/${c.id}`} className="table-center">
                          <span className={`center-avatar type-${c.type}`}>
                            {c.profile.name.slice(0, 1)}
                          </span>
                          <span>
                            <strong>{c.profile.name}</strong>
                            <small>{c.domain || `Center #${c.id}`}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="type-label">{centerTypeLabels[c.type]}</span>
                      </td>
                      <td>
                        <div className="table-contact">
                          <span>{c.profile.manager || 'Not added'}</span>
                          <small>{c.profile.email || 'No contact email'}</small>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${c.active === null ? 'unknown' : c.active ? 'active' : 'inactive'}`}
                        >
                          {c.active === null ? 'Unknown' : c.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/centers/${c.type}/${c.id}`}
                          className="open-center"
                          aria-label={`View ${c.profile.name}`}
                        >
                          <ArrowRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <span>
              {data?.total
                ? `Showing ${(query.page - 1) * data.pageSize + 1}–${Math.min(query.page * data.pageSize, data.total)} of ${data.total}`
                : 'No results to display'}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={loading || query.page === 1}
                onClick={() => setQuery({ ...query, page: query.page - 1 })}
              >
                <ChevronLeft size={17} />
              </button>
              <span>Page {query.page}</span>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={loading || !data || query.page * data.pageSize >= data.total}
                onClick={() => setQuery({ ...query, page: query.page + 1 })}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel drafts-panel">
          <div className="panel-heading">
            <div>
              <h2>Your saved drafts</h2>
              <p>Only you can view and continue these drafts.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh drafts"
              onClick={() => setNonce((n) => n + 1)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          {draftError && (
            <div className="form-error" role="alert">
              {draftError}
            </div>
          )}
          {draftLoading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={25} />
              <p>Loading your drafts…</p>
            </div>
          ) : openDrafts.length ? (
            <div className="draft-list">
              {openDrafts.map((d) => (
                <div className="draft-row" key={d.id}>
                  <span className="draft-icon">
                    <FilePenLine size={21} />
                  </span>
                  <div>
                    <strong>{d.data.profile.name}</strong>
                    <small>
                      {centerTypeLabels[d.data.type]} · {d.data.domain}
                    </small>
                  </div>
                  <span className="badge blue">Draft</span>
                  <button className="button secondary" onClick={() => setWizard(d)}>
                    Continue
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete draft ${d.data.profile.name}`}
                    onClick={() => void removeDraft(d)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <FilePenLine size={31} />
              <h2>A fresh start, when you’re ready</h2>
              <p>Your center drafts will be saved here.</p>
              <button className="button primary" onClick={() => setWizard('new')}>
                <Plus size={16} />
                New center draft
              </button>
            </div>
          )}
        </section>
      )}
      <p className="directory-footnote">
        <ShieldCheck size={14} />
        Center IDs are always paired with their type to keep each center’s data in scope.
      </p>
      {wizard && (
        <CenterWizard
          draft={wizard === 'new' ? undefined : wizard}
          mode={mode}
          onClose={() => {
            setWizard(null);
            setNonce((n) => n + 1);
          }}
          onSaved={() => setNonce((n) => n + 1)}
        />
      )}
    </>
  );
}
