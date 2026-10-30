'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { centerTypeLabels } from '@/domain/centers';
import {
  cowpayQuerySchema,
  parseCowpayQuery,
  type CowpayQuery,
  type CowpayDirectory,
} from '@/domain/cowpay';
import { api } from '@/lib/client';

export const setupLabels = {
  complete: 'Stored fields complete',
  incomplete: 'Missing credential fields',
  unconfigured: 'No settings stored',
  review: 'Needs review',
};
export function Enablement({ value }: { value: boolean | null }) {
  return (
    <span className={`status-badge ${value === null ? 'unknown' : value ? 'active' : 'inactive'}`}>
      {value === null ? 'Not recorded' : value ? 'Enabled flag' : 'Disabled flag'}
    </span>
  );
}
export function CowpayWorkspace() {
  const search = useSearchParams().toString();
  let query: CowpayQuery,
    invalid = false;
  try {
    query = parseCowpayQuery(new URLSearchParams(search));
  } catch {
    query = cowpayQuerySchema.parse({});
    invalid = true;
  }
  const queryString = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString();
  const [draft, setDraft] = useState(query),
    [data, setData] = useState<CowpayDirectory | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setDraft(parseCowpayQuery(new URLSearchParams(queryString)));
  }, [queryString]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    if (invalid) {
      setLoading(false);
      return () => abort.abort();
    }
    void api<CowpayDirectory>(
      `/api/integrations/cowpay?${queryString}`,
      'GET',
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load CowPay status.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [queryString, retry, invalid]);
  function navigate(next: CowpayQuery) {
    const value = cowpayQuerySchema.parse(next);
    window.history.pushState(
      null,
      '',
      `/integrations?${new URLSearchParams(Object.entries(value).map(([k, v]) => [k, String(v)]))}`,
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INTEGRATIONS</span>
          <h1>CowPay readiness</h1>
          <p>Review stored gateway setup across your Nursery and Lite centers.</p>
        </div>
        <span className="badge blue">
          <ShieldCheck size={14} />
          Read-only review
        </span>
      </div>
      <div className="inline-notice cowpay-boundary">
        <CreditCard size={20} />
        <p>
          These checks show whether required fields are stored. They do not validate credentials
          with CowPay, select an environment, or confirm that payments work. No provider requests
          are made.
        </p>
      </div>
      <div className="cowpay-summary-grid" aria-label="Readiness totals for current filters">
        {[
          ['Matching centers', data?.total],
          ['Live fields complete', data?.summary.liveComplete],
          ['Staging fields complete', data?.summary.stagingComplete],
          ['Needs review', data?.summary.review],
        ].map(([label, value]) => (
          <div className="panel cowpay-stat" key={label}>
            <small>{label}</small>
            <strong>{loading || !data ? '—' : value}</strong>
          </div>
        ))}
      </div>
      <section className="panel cowpay-directory" aria-label="CowPay center directory">
        <form
          className="cowpay-filters"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ ...draft, page: 1 });
          }}
        >
          <div className="field cowpay-search">
            <label htmlFor="cowpay-search">Search centers</label>
            <div className="cowpay-search-input">
              <Search size={17} />
              <input
                id="cowpay-search"
                value={draft.q}
                maxLength={120}
                placeholder="Center name or reference"
                onChange={(e) => setDraft({ ...draft, q: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="cowpay-type">Center type</label>
            <select
              id="cowpay-type"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as CowpayQuery['type'] })}
            >
              <option value="all">Nursery &amp; Lite</option>
              <option value="1">Nursery</option>
              <option value="3">Lite</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cowpay-setup">Stored setup</label>
            <select
              id="cowpay-setup"
              value={draft.setup}
              onChange={(e) =>
                setDraft({ ...draft, setup: e.target.value as CowpayQuery['setup'] })
              }
            >
              <option value="all">All setup states</option>
              {Object.entries(setupLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cowpay-enabled">Stored enablement</label>
            <select
              id="cowpay-enabled"
              value={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.value as CowpayQuery['enabled'] })
              }
            >
              <option value="all">All flags</option>
              <option value="enabled">Enabled flag</option>
              <option value="disabled">Disabled flag</option>
              <option value="unknown">Not recorded</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cowpay-sort">Sort centers</label>
            <select
              id="cowpay-sort"
              value={draft.sort}
              onChange={(e) => setDraft({ ...draft, sort: e.target.value as CowpayQuery['sort'] })}
            >
              <option value="name">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="type">Center type</option>
            </select>
          </div>
          <button className="button primary" type="submit" disabled={loading}>
            Apply filters
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={loading}
            onClick={() => {
              if (
                queryString ===
                  new URLSearchParams(
                    Object.entries(cowpayQuerySchema.parse({})).map(([k, v]) => [k, String(v)]),
                  ).toString() &&
                !invalid
              ) {
                setDraft(cowpayQuerySchema.parse({}));
                setRetry((n) => n + 1);
              } else navigate(cowpayQuerySchema.parse({}));
            }}
          >
            Reset filters
          </button>
          <button
            className="text-link"
            type="button"
            disabled={loading || invalid}
            onClick={() => setRetry((n) => n + 1)}
          >
            <RefreshCw size={15} />
            Refresh status
          </button>
        </form>
        {invalid && (
          <div className="form-error" role="alert">
            These filters are invalid. Reset filters to review your accessible centers.
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}{' '}
            <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {loading && (
          <p className="cowpay-loading" role="status">
            <LoaderCircle size={18} className="spin" />
            Loading stored setup…
          </p>
        )}
        {data && (
          <>
            {data.mode === 'preview' && (
              <p className="inline-notice">
                Demo workspace: all setup flags are fictional examples. No merchant credentials are
                stored in this demo.
              </p>
            )}
            <p className="field-hint">
              Totals reflect the current filters. School gateway support remains pending. Stored
              enablement is separate from center activation.
            </p>
            {!data.items.length ? (
              <div className="cowpay-empty">
                <CreditCard size={28} />
                <h2>{data.total ? 'No centers on this page' : 'No matching centers'}</h2>
                <p>
                  {data.total
                    ? 'Choose an earlier page or reset your filters.'
                    : 'Change the filters or ask an administrator to review your center assignments.'}
                </p>
              </div>
            ) : (
              <div className="cowpay-center-grid">
                {data.items.map((item) => (
                  <article
                    className="cowpay-center-card"
                    key={`${item.center.id}_${item.center.type}`}
                  >
                    <div className="cowpay-card-heading">
                      <span className="badge blue">{centerTypeLabels[item.center.type]}</span>
                      <Enablement value={item.storedEnabled} />
                    </div>
                    <h2>{item.center.name}</h2>
                    <p className="field-hint">
                      Center #{item.center.id} · {item.center.type}
                    </p>
                    <strong className={`cowpay-setup state-${item.setup}`}>
                      {setupLabels[item.setup]}
                    </strong>
                    <dl className="cowpay-environment-list">
                      <div>
                        <dt>Live credential fields</dt>
                        <dd>
                          {item.setup === 'review'
                            ? 'Needs review'
                            : item.liveComplete
                              ? 'Complete'
                              : 'Incomplete'}
                        </dd>
                      </div>
                      <div>
                        <dt>Staging credential fields</dt>
                        <dd>
                          {item.setup === 'review'
                            ? 'Needs review'
                            : item.stagingComplete
                              ? 'Complete'
                              : 'Incomplete'}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      className="text-link"
                      href={`/integrations/${item.center.type}/${item.center.id}`}
                    >
                      Review setup <ArrowRight size={15} />
                    </Link>
                  </article>
                ))}
              </div>
            )}
            <div className="cowpay-pagination">
              <span role="status">
                {data.total} matching centers · Page {data.page} of{' '}
                {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </span>
              <div>
                <button
                  type="button"
                  className="button secondary"
                  disabled={data.page <= 1 || loading}
                  onClick={() => navigate({ ...query, page: data.page - 1 })}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={data.page * data.pageSize >= data.total || loading}
                  onClick={() => navigate({ ...query, page: data.page + 1 })}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
