'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BellRing, RefreshCw } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { centerKey, centerTypeLabels } from '@/domain/centers';
import {
  alertBatchSchema,
  alertQuerySchema,
  type AlertBatchInput,
  type AlertBatchResult,
  type AlertCenter,
  type AlertDirectory,
  type AlertQuery,
} from '@/domain/alerts';
import { api } from '@/lib/client';

const states = {
  none: 'No stored alert',
  current: 'Current',
  expired: 'Expired',
  review: 'Needs review',
};
const activations = {
  active: 'Active',
  inactive: 'Inactive',
  unknown: 'No stored status',
  review: 'Needs review',
};
function searchString(query: AlertQuery, batch?: string | null) {
  return new URLSearchParams(
    Object.entries({ ...query, ...(batch ? { batch } : {}) })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}
function queryFrom(params: URLSearchParams | ReturnType<typeof useSearchParams>) {
  const obj = Object.fromEntries(params);
  delete obj.batch;
  const result = alertQuerySchema.safeParse(obj);
  return result.success ? result.data : alertQuerySchema.parse({});
}

export function AlertsWorkspace() {
  const params = useSearchParams();
  const [query, setQuery] = useState<AlertQuery>(() => queryFrom(params));
  const [batchId, setBatchId] = useState<string | null>(() => params.get('batch'));
  const [directory, setDirectory] = useState<AlertDirectory | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<Record<string, AlertCenter>>({}),
    [action, setAction] = useState<'publish' | 'reset'>('publish'),
    [message, setMessage] = useState(''),
    [expiryDate, setExpiryDate] = useState('');
  const [review, setReview] = useState<AlertBatchInput | null>(null),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<AlertCenter | null>(null);
  const [batch, setBatch] = useState<AlertBatchResult | null>(null),
    [batchError, setBatchError] = useState(''),
    [batchRefresh, setBatchRefresh] = useState(0);
  const detailRequest = useRef<AbortController | null>(null);
  const rows = Object.values(selected),
    serialized = searchString(query);
  const dirty = Boolean(rows.length || message || expiryDate);
  useEffect(() => {
    if (params.toString() !== new URLSearchParams(window.location.search).toString()) return;
    if (params.toString() === searchString(query, batchId)) return;
    setQuery(queryFrom(params));
    setBatchId(params.get('batch'));
  }, [params, serialized, batchId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    const timer = setTimeout(
      () => {
        void api<AlertDirectory>(`/api/alerts?${serialized}`, 'GET', undefined, controller.signal)
          .then((data) => {
            if (!controller.signal.aborted) setDirectory(data);
          })
          .catch((e) => {
            if (!controller.signal.aborted)
              setLoadError(e instanceof Error ? e.message : 'Unable to load alerts.');
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query.q ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [serialized, refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  useEffect(() => {
    if (!batchId) {
      setBatch(null);
      setBatchError('');
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const result = await api<AlertBatchResult>(
          `/api/alerts/batches/${encodeURIComponent(batchId)}`,
          'GET',
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setBatch(result);
          setBatchError('');
          if (result.running) timer = setTimeout(read, 1500);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setBatchError(e instanceof Error ? e.message : 'Unable to load batch results.');
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [batchId, batchRefresh]);
  function filter(changes: Partial<AlertQuery>) {
    const next = { ...query, ...changes, page: changes.page ?? 1 };
    setQuery(next);
    window.history.replaceState(null, '', `/alerts?${searchString(next, batchId)}`);
  }
  function keepBatch(id: string | null) {
    if (id !== batchId) {
      setBatch(null);
      setBatchError('');
    }
    setBatchId(id);
    window.history.replaceState(null, '', `/alerts?${searchString(query, id)}`);
  }
  function eligible(c: AlertCenter) {
    return action === 'publish' ? c.canPublish : c.canReset;
  }
  function toggle(c: AlertCenter, checked: boolean) {
    setNotice('');
    setError('');
    setSelected((old) => {
      const next = { ...old };
      if (checked) {
        if (Object.keys(next).length >= 10) {
          setNotice('Select up to 10 centers per batch.');
          return old;
        }
        next[centerKey(c)] = c;
      } else delete next[centerKey(c)];
      return next;
    });
  }
  async function inspect(id: number, type: 1 | 3 | 4) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setError('');
    try {
      const c = await api<AlertCenter>(
        `/api/alerts/${type}/${id}`,
        'GET',
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) setDetail(c);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Unable to load the current alert.');
    }
  }
  function prepare(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const input = alertBatchSchema.safeParse({
      id: crypto.randomUUID(),
      action,
      targets: rows.map((c) => ({ id: c.id, type: c.type, revision: c.revision })),
      ...(action === 'publish' ? { message, expiryDate } : {}),
    });
    if (!input.success) {
      setError(input.error.issues[0].message);
      return;
    }
    if (input.data.action === 'publish' && input.data.expiryDate < (directory?.today ?? '')) {
      setError('Choose today or a future date in UTC.');
      return;
    }
    setReview(input.data);
  }
  async function send() {
    if (!review) return;
    const input = review;
    setBusy(true);
    setError('');
    setNotice('');
    keepBatch(input.id);
    try {
      const result = await api<AlertBatchResult>('/api/alerts/batches', 'POST', input);
      setBatch(result);
      setSelected({});
      setMessage('');
      setExpiryDate('');
      setReview(null);
      setRefresh((n) => n + 1);
      setBatchRefresh((n) => n + 1);
    } catch (e) {
      setReview(null);
      setError(
        `${e instanceof Error ? e.message : 'The request was interrupted.'} Check this batch’s results before making another change.`,
      );
      setBatchRefresh((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!batchId) return;
    setBusy(true);
    setBatchError('');
    try {
      setBatch(
        await api<AlertBatchResult>(`/api/alerts/batches/${batchId}`, 'POST', { retry: true }),
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : 'Unable to retry. Check results.');
    } finally {
      setBusy(false);
      setBatchRefresh((n) => n + 1);
    }
  }
  const batchCounts = batch
    ? {
        saved: batch.targets.filter((t) => t.state === 'succeeded').length,
        failed: batch.targets.filter((t) => t.state === 'failed').length,
        uncertain: batch.targets.filter((t) => t.state === 'unconfirmed' || t.state === 'working')
          .length,
      }
    : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CLEAR COMMUNICATION</span>
          <h1>Alert messages</h1>
          <p>Review a message, choose its centers and confirm each result.</p>
        </div>
        <button
          className="button secondary"
          disabled={loading || busy}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={16} />
          Refresh alerts
        </button>
      </div>
      <p className="inline-notice">
        {!directory
          ? 'Checking alert access…'
          : directory.writesEnabled
            ? 'Owners and administrators can publish. Only administrators can reset stored alerts.'
            : 'Live alert changes are disabled. Current stored alerts are available for review.'}
      </p>
      <p className="alert-date-policy">
        Expiry is a calendar date: current through the selected date in UTC. Existing clients may
        handle expiry or caching differently. Publishing updates the stored center message;
        delivery/read confirmation is unavailable.
      </p>
      {notice && (
        <p role="status" className="inline-notice">
          {notice}
        </p>
      )}
      {(error || loadError) && (
        <div className="form-error" role="alert">
          {error || loadError}{' '}
          <button className="text-link" onClick={() => setRefresh((n) => n + 1)}>
            Reload alerts
          </button>
        </div>
      )}
      {batchId && (
        <section className="panel alert-results" aria-label="Batch results">
          <div className="alert-section-heading">
            <h2>{batch?.running ? 'Batch in progress' : 'Batch results'}</h2>
            <div>
              <button className="text-link" onClick={() => setBatchRefresh((n) => n + 1)}>
                Check results
              </button>
              <button
                className="text-link"
                disabled={busy || batch?.running}
                onClick={() => keepBatch(null)}
              >
                Dismiss results
              </button>
            </div>
          </div>
          {batchError && <p role="alert">{batchError}</p>}
          {!batch && !batchError ? (
            <p role="status">Checking the batch…</p>
          ) : (
            batch && (
              <>
                {batch.action === 'publish' && batch.message && (
                  <>
                    <p className="alert-published-preview">{batch.message}</p>
                    <p>Expiry date: {batch.expiryDate} (inclusive UTC date)</p>
                  </>
                )}
                <p role="status">
                  {batchCounts?.saved} saved · {batchCounts?.failed} not saved ·{' '}
                  {batchCounts?.uncertain} need outcome review
                </p>
                <p>
                  Results belong to your account and are available for 24 hours. Confirmed targets
                  are never retried by this batch.
                </p>
                <ul className="alert-result-list">
                  {batch.targets.map((t) => (
                    <li key={centerKey(t)}>
                      <div>
                        <strong>
                          {centerTypeLabels[t.type]} #{t.id}
                        </strong>
                        <span className={`badge ${t.state === 'succeeded' ? 'blue' : 'neutral'}`}>
                          {
                            {
                              pending: 'Not attempted',
                              working: 'Saving',
                              succeeded: batch.action === 'publish' ? 'Saved' : 'Reset',
                              failed: 'Not saved',
                              unconfirmed: 'Outcome unconfirmed',
                            }[t.state]
                          }
                        </span>
                      </div>
                      {t.message && <p>{t.message}</p>}
                      {t.state !== 'succeeded' && (
                        <button className="text-link" onClick={() => void inspect(t.id, t.type)}>
                          Inspect current alert for #{t.id}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {batch.targets.some(
                  (t) =>
                    (t.state === 'failed' && t.retryable && t.attempts < 3) ||
                    t.state === 'pending',
                ) && (
                  <button
                    className="button secondary"
                    disabled={busy || batch.running}
                    onClick={() => void retry()}
                  >
                    Retry failed targets only
                  </button>
                )}
                {batch.targets.some((t) => t.state === 'unconfirmed') && (
                  <p className="inline-notice">
                    Unconfirmed outcomes are not automatically retried. Inspect the stored alert
                    before reviewing another change.
                  </p>
                )}
              </>
            )
          )}
        </section>
      )}
      <section className="panel alert-composer" aria-label="Compose alert">
        <div className="alert-section-heading">
          <div>
            <h2>Prepare an alert change</h2>
            <p>Select up to 10 centers, including across pages.</p>
          </div>
          <span className="badge blue">{rows.length} selected</span>
        </div>
        <form onSubmit={prepare} className="alert-compose-form">
          <label>
            Action
            <select
              value={action}
              disabled={busy}
              onChange={(e) => {
                setAction(e.target.value as 'publish' | 'reset');
                setSelected({});
                setNotice('Selection cleared for the new action.');
              }}
            >
              <option value="publish">Publish / replace message</option>
              <option value="reset" disabled={!directory?.canReset}>
                Reset stored alert
              </option>
            </select>
          </label>
          {action === 'publish' ? (
            <>
              <label className="alert-message-field">
                Alert message
                <textarea
                  rows={3}
                  maxLength={250}
                  required
                  value={message}
                  disabled={busy}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-describedby="alert-message-hint"
                />
              </label>
              <small id="alert-message-hint">
                {message.length}/250 characters. Plain text; no credentials or child details.
              </small>
              <label>
                Expiry date (UTC)
                <input
                  type="date"
                  min={directory?.today}
                  max="9999-12-31"
                  required
                  value={expiryDate}
                  disabled={busy}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </label>
            </>
          ) : (
            <p>
              Reset removes the stored alert from each selected center. Existing client caches are
              not controlled by this portal.
            </p>
          )}
          {rows.length > 0 && (
            <ul className="alert-selection">
              {rows.map((c) => (
                <li key={centerKey(c)}>
                  <span>
                    {c.name} · {centerTypeLabels[c.type]} #{c.id}
                  </span>
                  <button
                    className="text-link"
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(c, false)}
                  >
                    Remove {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="status-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || !rows.length}
              onClick={() => setSelected({})}
            >
              Clear selection
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy || !directory?.writesEnabled || !rows.length}
            >
              Review {action === 'publish' ? 'publication' : 'reset'}
            </button>
          </div>
        </form>
      </section>
      <section className="panel status-filters alert-filters" aria-label="Alert filters">
        <label>
          Search centers
          <input
            maxLength={120}
            value={query.q}
            onChange={(e) => filter({ q: e.target.value })}
            placeholder="Name, domain or ID"
          />
        </label>
        <label>
          Center type
          <select
            value={query.type}
            onChange={(e) => filter({ type: e.target.value as AlertQuery['type'] })}
          >
            <option value="all">All types</option>
            <option value="1">Nursery</option>
            <option value="3">Lite</option>
            <option value="4">School</option>
          </select>
        </label>
        <label>
          Center activation
          <select
            value={query.activation}
            onChange={(e) => filter({ activation: e.target.value as AlertQuery['activation'] })}
          >
            <option value="all">All activation statuses</option>
            {Object.entries(activations).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Alert state
          <select
            value={query.state}
            onChange={(e) => filter({ state: e.target.value as AlertQuery['state'] })}
          >
            <option value="all">All alert states</option>
            {Object.entries(states).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {directory?.canFilterDealer && (
          <label>
            Assigned dealer
            <select
              value={query.dealerId ?? ''}
              onChange={(e) =>
                filter({ dealerId: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">All dealers</option>
              {directory.dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <section aria-label="Alert center results" aria-busy={loading}>
        {loading ? (
          <p role="status">Loading center alerts…</p>
        ) : (
          directory &&
          !loadError && (
            <>
              <div className="alert-section-heading">
                <p>{directory.total} accessible centers · sorted by name</p>
                <button
                  className="button secondary"
                  disabled={busy || !directory.writesEnabled}
                  onClick={() => {
                    const next = { ...selected };
                    for (const c of directory.items)
                      if (eligible(c) && Object.keys(next).length < 10) next[centerKey(c)] = c;
                    setSelected(next);
                  }}
                >
                  Select eligible on this page (up to 10)
                </button>
              </div>
              {!directory.items.length ? (
                <div className="panel empty-state">
                  <h2>No matching centers</h2>
                  <p>Change your filters to find another center.</p>
                </div>
              ) : (
                <div className="status-grid">
                  {directory.items.map((c) => (
                    <article className="panel status-card alert-card" key={centerKey(c)}>
                      <div className="status-card-top">
                        <span className="status-center-icon">
                          <BellRing size={20} />
                        </span>
                        <span className="badge blue">{states[c.state]}</span>
                      </div>
                      <h2>{c.name}</h2>
                      <p>
                        {centerTypeLabels[c.type]} · #{c.id} · {activations[c.activation]}
                      </p>
                      <p>{c.domain || 'No domain recorded'}</p>
                      {c.message ? (
                        <p className="alert-message-preview">{c.message}</p>
                      ) : (
                        <p>No message stored.</p>
                      )}
                      {c.expiryDate && <p>Expiry date: {c.expiryDate} (UTC)</p>}
                      <label className="alert-select">
                        <input
                          type="checkbox"
                          disabled={busy || !eligible(c)}
                          checked={Boolean(selected[centerKey(c)])}
                          onChange={(e) => toggle(c, e.target.checked)}
                        />
                        Select {c.name}
                      </label>
                      {!c.canPublish && (
                        <p>
                          {c.state === 'review'
                            ? 'Stored records need review.'
                            : 'View-only in this environment or account scope.'}
                        </p>
                      )}
                      <button
                        className="button secondary"
                        onClick={() => void inspect(c.id, c.type)}
                      >
                        View alert for {c.name}
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <div className="status-pagination">
                <button
                  className="button secondary"
                  disabled={query.page <= 1}
                  onClick={() => filter({ page: query.page - 1 })}
                >
                  Previous alert page
                </button>
                <span>
                  Page {query.page} of{' '}
                  {Math.max(1, Math.ceil(directory.total / directory.pageSize))}
                </span>
                <button
                  className="button secondary"
                  disabled={query.page * directory.pageSize >= directory.total}
                  onClick={() => filter({ page: query.page + 1 })}
                >
                  Next alert page
                </button>
              </div>
            </>
          )
        )}
      </section>
      {review && (
        <Dialog
          title={review.action === 'publish' ? 'Review alert publication' : 'Review alert reset'}
          eyebrow="ALERT MESSAGES"
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <p>
            {review.targets.length} selected {review.targets.length === 1 ? 'center' : 'centers'}.
            Each center is checked again before saving.
          </p>
          {review.action === 'publish' ? (
            <>
              <p className="alert-published-preview">{review.message}</p>
              <p>
                Current through <strong>{review.expiryDate}</strong> in UTC. This replaces the
                stored message and expiry.
              </p>
            </>
          ) : (
            <p>Remove the stored alert for each selected center.</p>
          )}
          <ul className="alert-review-targets">
            {review.targets.map((t) => (
              <li key={centerKey(t)}>
                <strong>
                  {selected[centerKey(t)]?.name ?? `${centerTypeLabels[t.type]} #${t.id}`}
                </strong>
                <span>
                  {centerTypeLabels[t.type]} #{t.id} · currently{' '}
                  {states[selected[centerKey(t)]?.state ?? 'none']}
                </span>
                {selected[centerKey(t)]?.message && (
                  <p className="alert-message-preview">
                    Current message: {selected[centerKey(t)].message}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p>
            Results can differ by center. Already saved targets will not be replayed by a retry.
          </p>
          <div className="status-actions">
            <button className="button secondary" disabled={busy} onClick={() => setReview(null)}>
              Back to edit
            </button>
            <button className="button primary" disabled={busy} onClick={() => void send()}>
              {busy
                ? 'Saving…'
                : review.action === 'publish'
                  ? 'Confirm publication'
                  : 'Confirm reset'}
            </button>
          </div>
        </Dialog>
      )}
      {detail && (
        <Dialog
          title="Stored center alert"
          eyebrow="ALERT MESSAGES"
          onClose={() => setDetail(null)}
        >
          <h3>{detail.name}</h3>
          <p>
            {centerTypeLabels[detail.type]} #{detail.id} · {states[detail.state]}
          </p>
          <p className="alert-published-preview">{detail.message || 'No stored message.'}</p>
          {detail.expiryDate && (
            <p>Expiry date: {detail.expiryDate} (inclusive UTC date in this portal).</p>
          )}
          {detail.state === 'review' && (
            <p role="alert">
              Duplicate or invalid records require review. Publishing/reset is blocked.
            </p>
          )}
          <p>
            Older clients may handle display, expiry and caching differently. This view confirms the
            stored record.
          </p>
          {(action === 'publish' ? detail.canPublish : detail.canReset) && (
            <button
              className="button primary"
              onClick={() => {
                setSelected({ [centerKey(detail)]: detail });
                setDetail(null);
                setNotice(
                  'Fresh center data selected. Review the next change before publishing or resetting.',
                );
              }}
            >
              Use this center for a new review
            </button>
          )}
        </Dialog>
      )}
    </>
  );
}
