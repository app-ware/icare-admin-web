'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { centerKey, centerTypeLabels } from '@/domain/centers';
import {
  statusChangeSchema,
  statusQuerySchema,
  type CenterStatus,
  type StatusDetail,
  type StatusDirectory,
  type StatusQuery,
} from '@/domain/status';
import { api, RequestError } from '@/lib/client';

const labels = {
  active: 'Active',
  inactive: 'Inactive',
  unknown: 'No stored status',
  review: 'Needs review',
};
const codeLabel = (code: number | null) =>
  code === null
    ? 'No stored status'
    : code === 1
      ? 'Active'
      : code === 0
        ? 'Inactive'
        : 'Unrecognized status';
function StatusReview({
  detail,
  onClose,
  onReload,
  onSaved,
}: {
  detail: StatusDetail;
  onClose: () => void;
  onReload: () => Promise<void>;
  onSaved: (data: StatusDetail & { historyRecorded: boolean }) => void;
}) {
  const c = detail.center;
  const [target, setTarget] = useState(''),
    [reason, setReason] = useState('');
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false);
  const dirty = Boolean(reason || target);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function close() {
    if (!busy && (!dirty || window.confirm('Discard this unsaved status change?'))) onClose();
  }
  function check(event: React.FormEvent) {
    event.preventDefault();
    if (!target) {
      setError('Choose the new status.');
      return;
    }
    const parsed = statusChangeSchema.safeParse({
      revision: c.revision,
      active: target === '1',
      reason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (c.code === Number(target)) {
      setError('Choose a different status.');
      return;
    }
    setError('');
    setReview(true);
  }
  async function save() {
    setBusy(true);
    setError('');
    setConflict(false);
    try {
      const saved = await api<StatusDetail & { historyRecorded: boolean }>(
        `/api/status/${c.type}/${c.id}`,
        'PATCH',
        { revision: c.revision, active: target === '1', reason },
      );
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update status.');
      setConflict(
        e instanceof RequestError &&
          ['REVISION_CONFLICT', 'STATUS_UNCHANGED', 'STATUS_OUTCOME_UNCONFIRMED'].includes(e.code),
      );
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={review ? 'Review status change' : 'Center activation status'}
      eyebrow="CENTER STATUS"
      onClose={close}
    >
      <p className="dialog-intro">
        <strong>{c.name}</strong> · {centerTypeLabels[c.type]} · #{c.id}
      </p>
      <p>
        Current status: <strong>{labels[c.state]}</strong>
      </p>
      {c.state === 'unknown' && (
        <p className="inline-notice">
          No status record is stored. The legacy portal assumes active; this view keeps that
          assumption separate from a recorded status.
        </p>
      )}
      {c.state === 'review' && (
        <p className="inline-notice">
          Duplicate, empty or unrecognized status records require review. Changes are blocked for
          this center.
        </p>
      )}
      {!c.canManage && (
        <p className="inline-notice">
          This center is view-only. Status changes require ownership or administrator access and
          enabled status writes.
        </p>
      )}
      <p className="session-hint">
        This controls stored center activation. Existing client behavior and external-session
        revocation have not been verified. Gateway settings are separate.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {conflict && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onReload()
              .catch(() => {
                setError('Unable to reload the current status. Try again.');
              })
              .finally(() => setBusy(false));
          }}
        >
          Reload current status
        </button>
      )}
      {c.canManage &&
        (review ? (
          <div className="status-review">
            <dl>
              <dt>Change</dt>
              <dd>
                {labels[c.state]} → {codeLabel(Number(target))}
              </dd>
              <dt>Reason</dt>
              <dd>{reason.trim()}</dd>
            </dl>
            <p>The change applies to this center only and will be recorded in portal history.</p>
            <div className="status-actions">
              <button className="button secondary" disabled={busy} onClick={() => setReview(false)}>
                Back to edit
              </button>
              <button className="button primary" disabled={busy || conflict} onClick={save}>
                {busy ? 'Saving…' : 'Confirm status change'}
              </button>
            </div>
          </div>
        ) : (
          <form className="status-form" onSubmit={check}>
            <label htmlFor="new-center-status">New status</label>
            <select
              id="new-center-status"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              required
              disabled={busy}
            >
              <option value="">Choose status</option>
              <option value="1" disabled={c.code === 1}>
                Active
              </option>
              <option value="0" disabled={c.code === 0}>
                Inactive
              </option>
            </select>
            <label htmlFor="status-reason">Reason for change</label>
            <textarea
              id="status-reason"
              rows={3}
              minLength={5}
              maxLength={500}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              aria-describedby="status-reason-hint"
            />
            <small id="status-reason-hint">
              Brief operational reason. Do not enter credentials or child details.
            </small>
            <button className="button primary" type="submit" disabled={busy}>
              Review change
            </button>
          </form>
        ))}
      {!review && (
        <section className="status-history" aria-label="Portal status history">
          <h3>Portal change history</h3>
          <p>
            Last 20 changes recorded by this portal. Earlier legacy changes are not included. Times
            are shown in your local timezone.
          </p>
          {!detail.historyAvailable ? (
            <p role="alert">History is unavailable. Reload this center to try again.</p>
          ) : !detail.history.length ? (
            <p>No status changes recorded by this portal.</p>
          ) : (
            <ol>
              {detail.history.map((item) => (
                <li key={item.id}>
                  <strong>
                    {codeLabel(item.previousCode)} → {codeLabel(item.nextCode)}
                  </strong>
                  <span>
                    {item.actor} · {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <span className="badge blue">
                    {item.state === 'committed'
                      ? 'Confirmed'
                      : item.state === 'failed'
                        ? 'Failed'
                        : item.state === 'unconfirmed'
                          ? 'Outcome unconfirmed'
                          : 'Preparing / interrupted'}
                  </span>
                  <p>{item.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </Dialog>
  );
}

export function StatusWorkspace() {
  const params = useSearchParams();
  const parsed = statusQuerySchema.safeParse(Object.fromEntries(params));
  const [query, setQuery] = useState<StatusQuery>(
    parsed.success ? parsed.data : statusQuerySchema.parse({}),
  );
  const [result, setResult] = useState<StatusDirectory | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<StatusDetail | null>(null),
    [opening, setOpening] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  const queryString = new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  useEffect(() => {
    // History updates are synchronous; ignore an older router notification while typing.
    if (params.toString() !== new URLSearchParams(window.location.search).toString()) return;
    if (params.toString() === queryString) return;
    const current = statusQuerySchema.safeParse(Object.fromEntries(params));
    if (current.success) setQuery(current.data);
  }, [params, queryString]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(
      () => {
        void api<StatusDirectory>(`/api/status?${queryString}`, 'GET', undefined, controller.signal)
          .then((data) => {
            if (!controller.signal.aborted) setResult(data);
          })
          .catch((e) => {
            if (!controller.signal.aborted)
              setError(e instanceof Error ? e.message : 'Unable to load center status.');
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
  }, [queryString, retry]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  function filter(changes: Partial<StatusQuery>) {
    const next = { ...query, ...changes, page: changes.page ?? 1 };
    setQuery(next);
    const search = new URLSearchParams(
      Object.entries(next)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
    // Filters affect this client directory only; Next integrates native history with search params.
    window.history.replaceState(null, '', `/status?${search}`);
  }
  async function open(c: CenterStatus) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setOpening(true);
    setNotice('');
    setError('');
    try {
      const data = await api<StatusDetail>(
        `/api/status/${c.type}/${c.id}`,
        'GET',
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) setSelected(data);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Unable to load center status.');
        throw e;
      }
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DAILY OPERATIONS</span>
          <h1>Center status</h1>
          <p>Review center activation and make one clear, recorded change at a time.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRetry((n) => n + 1)}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh statuses
        </button>
      </div>
      <div className="inline-notice">
        <ShieldCheck size={17} />{' '}
        {result?.writesEnabled
          ? 'Changes require center ownership or administrator access, a reason and confirmation.'
          : 'Live status changes are disabled. You can review current records and portal history.'}
      </div>
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      <section className="panel status-filters" aria-label="Status filters">
        <label>
          Search centers
          <input
            value={query.q}
            maxLength={120}
            onChange={(e) => filter({ q: e.target.value })}
            placeholder="Name, domain or ID"
          />
        </label>
        <label>
          Center type
          <select
            value={query.type}
            onChange={(e) => filter({ type: e.target.value as StatusQuery['type'] })}
          >
            <option value="all">All types</option>
            <option value="1">Nursery</option>
            <option value="3">Lite</option>
            <option value="4">School</option>
          </select>
        </label>
        <label>
          Activation status
          <select
            value={query.status}
            onChange={(e) => filter({ status: e.target.value as StatusQuery['status'] })}
          >
            <option value="all">All statuses</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {result?.canFilterDealer && (
          <label>
            Assigned dealer
            <select
              value={query.dealerId ?? ''}
              onChange={(e) =>
                filter({ dealerId: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">All dealers</option>
              {result.dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Sort centers
          <select
            value={query.sort}
            onChange={(e) => filter({ sort: e.target.value as StatusQuery['sort'] })}
          >
            <option value="name">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="type">Center type</option>
          </select>
        </label>
      </section>
      {error && (
        <div className="form-error" role="alert">
          {error}{' '}
          <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      <section aria-label="Center status results" aria-busy={loading || opening}>
        {loading ? (
          <p role="status">Loading center statuses…</p>
        ) : (
          !error &&
          result && (
            <>
              <p>
                {result.total} accessible {result.total === 1 ? 'center' : 'centers'}
              </p>
              {!result.items.length ? (
                <div className="panel empty-state">
                  <h2>No matching centers</h2>
                  <p>Change your filters or check your assigned access.</p>
                </div>
              ) : (
                <div className="status-grid">
                  {result.items.map((c) => (
                    <article className="panel status-card" key={centerKey(c)}>
                      <div className="status-card-top">
                        <span className="status-center-icon">
                          <Building2 size={20} />
                        </span>
                        <span
                          className={`badge ${c.state === 'active' ? 'green' : c.state === 'inactive' ? 'red' : 'blue'}`}
                        >
                          {labels[c.state]}
                        </span>
                      </div>
                      <h2>{c.name}</h2>
                      <p>
                        {centerTypeLabels[c.type]} · #{c.id}
                      </p>
                      <p className="status-domain">{c.domain || 'No domain recorded'}</p>
                      {c.state === 'unknown' && (
                        <p>No stored record. The legacy portal assumes active.</p>
                      )}
                      {c.state === 'review' && <p>Stored records need review before changes.</p>}
                      <button
                        className="button secondary"
                        disabled={opening}
                        onClick={() => void open(c).catch(() => undefined)}
                      >
                        Review status for {c.name}
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
                  Previous status page
                </button>
                <span>
                  Page {query.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}
                </span>
                <button
                  className="button secondary"
                  disabled={query.page * result.pageSize >= result.total}
                  onClick={() => filter({ page: query.page + 1 })}
                >
                  Next status page
                </button>
              </div>
            </>
          )
        )}
      </section>
      {selected && (
        <StatusReview
          key={`${centerKey(selected.center)}:${selected.center.revision}`}
          detail={selected}
          onClose={() => setSelected(null)}
          onReload={() => open(selected.center)}
          onSaved={(saved) => {
            setSelected(null);
            setNotice(
              saved.historyRecorded
                ? `${saved.center.name}: status saved as ${labels[saved.center.state]}.`
                : `${saved.center.name}: status changed, but history confirmation is unavailable. Reload before making another change.`,
            );
            setRetry((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
