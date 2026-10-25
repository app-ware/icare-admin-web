'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bus, Building2, RefreshCw, Route, Save } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { centerKey, centerTypeLabels } from '@/domain/centers';
import {
  busChangeSchema,
  transportQuerySchema,
  type BusChange,
  type BusDetail,
  type BusValues,
  type CenterBuses,
  type TransportDirectory,
  type TransportCenter,
} from '@/domain/transport';
import { api } from '@/lib/client';

const fields = [
  ['radius', 'Geofence radius'],
  ['dwell', 'Dwell duration'],
  ['input', 'Passenger input mode'],
] as const;
const sourceLabel = {
  override: 'Bus override',
  inherited: 'Inherited default',
  missing: 'Not configured',
};
function valueLabel(detail: BusDetail, key: keyof BusValues, values = detail.values) {
  const id = values?.[key];
  return (
    detail.references[key].find((o) => o.id === id)?.label ??
    (id == null ? 'Not configured' : `Unavailable choice #${id}`)
  );
}
function BusEditor({
  detail,
  onSaved,
  onReload,
  onDirty,
  onBusy,
}: {
  detail: BusDetail;
  onSaved: (d: BusDetail, recorded: boolean) => void;
  onReload: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [values, setValues] = useState({
    radius: String(detail.values?.radius ?? ''),
    dwell: String(detail.values?.dwell ?? ''),
    input: String(detail.values?.input ?? ''),
  });
  const [review, setReview] = useState<BusChange | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reloadRequired, setReloadRequired] = useState(false);
  const dirty = fields.some(([key]) => values[key] !== String(detail.values?.[key] ?? ''));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function prepare(action: 'override' | 'inherit') {
    const parsed = busChangeSchema.safeParse(
      action === 'inherit'
        ? { action, revision: detail.revision }
        : {
            action,
            revision: detail.revision,
            ...Object.fromEntries(fields.map(([key]) => [key, Number(values[key])])),
          },
    );
    if (!parsed.success) {
      setError('Choose a value for all three settings.');
      return;
    }
    setError('');
    setReview(parsed.data);
  }
  async function save() {
    if (!review) return;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const result = await api<BusDetail & { receiptRecorded: boolean }>(
        `/api/transport/${detail.center.type}/${detail.center.id}/${detail.bus.id}`,
        'PATCH',
        review,
      );
      onSaved(result, result.receiptRecorded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to confirm the save.');
      setReloadRequired(true);
      setReview(null);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="panel bus-editor" aria-label="Bus settings editor">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            {centerTypeLabels[detail.center.type]} · #{detail.center.id}
          </span>
          <h2>{detail.bus.name}</h2>
          <p>
            {detail.center.name} · Bus #{detail.bus.id}
          </p>
        </div>
        <span className="badge blue">{sourceLabel[detail.source]}</span>
      </div>
      <p className="bus-note">
        {detail.source === 'inherited'
          ? 'This bus uses the catalog default. Saving creates an override for this bus.'
          : detail.source === 'missing'
            ? 'No bus override or catalog default is configured.'
            : 'These settings apply to this bus only.'}{' '}
        Returning to the default removes this bus’s override. Global defaults are managed
        separately.
      </p>
      {detail.issues.map((issue) => (
        <p className="inline-notice" key={issue}>
          {issue}
        </p>
      ))}
      {!detail.canManage && detail.issues.length === 0 && (
        <p className="inline-notice">
          Live bus changes are disabled pending reference review and acceptance.
        </p>
      )}
      {error && (
        <div className="dealer-error" role="alert">
          {error}{' '}
          {reloadRequired && (
            <button className="button secondary" onClick={onReload}>
              Reload current settings
            </button>
          )}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          prepare('override');
        }}
      >
        <div className="bus-fields">
          {fields.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <select
                aria-label={label}
                value={values[key]}
                disabled={!detail.canManage || busy || reloadRequired}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                required
              >
                <option value="">Choose a value</option>
                {detail.references[key].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <small>Current: {valueLabel(detail, key)}</small>
            </label>
          ))}
        </div>
        <p className="bus-note">
          Choose the radius, dwell duration and passenger input mode this bus should use.
        </p>
        <div className="status-actions">
          <button
            className="button primary"
            type="submit"
            disabled={
              !detail.canManage ||
              busy ||
              reloadRequired ||
              (!dirty && detail.source === 'override')
            }
          >
            <Save size={17} />
            Review bus override
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={!detail.canManage || !detail.canInherit || busy || reloadRequired}
            onClick={() => prepare('inherit')}
          >
            Use inherited default
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={onReload}>
            Reload
          </button>
        </div>
      </form>
      {review && (
        <Dialog
          title={
            review.action === 'inherit' ? 'Use inherited settings?' : 'Save this bus override?'
          }
          eyebrow="REVIEW BUS SETTINGS"
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <p>
            {detail.center.name} · {detail.bus.name}
          </p>
          <dl className="bus-review">
            {fields.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {review.action === 'inherit'
                    ? valueLabel(detail, key, detail.defaults)
                    : detail.references[key].find((o) => o.id === review[key])?.label}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            This changes the stored configuration. Connected clients must read the updated settings;
            delivery is not confirmed here.
          </p>
          <div className="status-actions">
            <button className="button primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Confirm settings'}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setReview(null)}>
              Back to edit
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
export function TransportWorkspace() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? ''),
    [type, setType] = useState(params.get('type') ?? 'all'),
    [page, setPage] = useState(Number(params.get('page') ?? 1));
  const [directory, setDirectory] = useState<TransportDirectory | null>(null),
    [center, setCenter] = useState<TransportCenter | null>(null),
    [buses, setBuses] = useState<CenterBuses | null>(null),
    [busId, setBusId] = useState(''),
    [detail, setDetail] = useState<BusDetail | null>(null);
  const [loading, setLoading] = useState(false),
    [busLoading, setBusLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [error, setError] = useState(''),
    [busError, setBusError] = useState(''),
    [notice, setNotice] = useState(''),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const search = params.toString();
  useEffect(() => {
    if (search !== new URLSearchParams(window.location.search).toString()) return;
    if (search === new URLSearchParams({ q, type, page: String(page) }).toString()) return;
    const parsed = transportQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));
    if (parsed.success) {
      setQ(parsed.data.q);
      setType(parsed.data.type);
      setPage(parsed.data.page);
    }
  }, [search]);
  function filter(nextQ: string, nextType: string, nextPage: number) {
    setQ(nextQ);
    setType(nextType);
    setPage(nextPage);
    window.history.replaceState(
      null,
      '',
      `/transport?${new URLSearchParams({ q: nextQ, type: nextType, page: String(nextPage) })}`,
    );
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void api<TransportDirectory>(
        `/api/transport?${new URLSearchParams({ q, type, page: String(page) })}`,
        'GET',
        undefined,
        controller.signal,
      )
        .then((data) => {
          setDirectory(data);
          setError('');
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : 'Unable to load centers.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, type, page, refresh]);
  useEffect(() => {
    if (!center) return;
    const controller = new AbortController();
    setBusLoading(true);
    setBuses(null);
    setDetail(null);
    setBusError('');
    void api<CenterBuses>(
      `/api/transport/${center.type}/${center.id}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setBuses)
      .catch((e) => {
        if (!controller.signal.aborted)
          setBusError(e instanceof Error ? e.message : 'Unable to load buses.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusLoading(false);
      });
    return () => controller.abort();
  }, [center, refresh]);
  useEffect(() => {
    if (!center || !busId) {
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetail(null);
    setBusError('');
    void api<BusDetail>(
      `/api/transport/${center.type}/${center.id}/${busId}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted)
          setBusError(e instanceof Error ? e.message : 'Unable to load settings.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [center, busId, refresh]);
  function choose(c: TransportCenter) {
    if (busy || (dirty && !window.confirm('Discard unsaved bus settings?'))) return;
    setCenter(c);
    setBusId('');
    setDetail(null);
    setBusError('');
    setDetailLoading(false);
    setDirty(false);
    setNotice('');
  }
  function reload() {
    if (busy || (dirty && !window.confirm('Discard unsaved bus settings?'))) return;
    setDirty(false);
    setRefresh((v) => v + 1);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TRANSPORT CONFIGURATION</span>
          <h1>Bus settings</h1>
          <p>
            Review inherited defaults and configure each bus’s arrival and passenger input settings.
          </p>
        </div>
        <span className="badge blue">
          <Route size={15} />
          Center-scoped settings
        </span>
      </div>
      <p className="inline-notice">
        {!directory
          ? 'Checking configuration availability…'
          : directory.writesEnabled
            ? 'Save a bus override or return to a valid inherited default.'
            : 'Live bus changes are disabled. Existing buses and configuration remain available for review.'}{' '}
        Defaults and choices are kept separate for Nursery/Lite and School.
      </p>
      {notice && (
        <div className="dealer-success" role="status">
          {notice}
        </div>
      )}
      <div className="bus-layout">
        <section className="panel bus-centers" aria-label="Select center">
          <h2>
            <Building2 size={20} /> Select a center
          </h2>
          <label>
            <span>Search centers</span>
            <input
              value={q}
              maxLength={120}
              onChange={(e) => {
                filter(e.target.value, type, 1);
              }}
              placeholder="Name, domain or ID"
            />
          </label>
          <label>
            <span>Center type</span>
            <select
              aria-label="Center type"
              value={type}
              onChange={(e) => {
                filter(q, e.target.value, 1);
              }}
            >
              <option value="all">All center types</option>
              <option value="1">Nursery</option>
              <option value="3">Lite</option>
              <option value="4">School</option>
            </select>
          </label>
          {loading ? (
            <p role="status">Loading centers…</p>
          ) : error ? (
            <div className="dealer-error" role="alert">
              {error}
              <button className="button secondary" onClick={reload}>
                Retry centers
              </button>
            </div>
          ) : (
            <>
              <p className="bus-note">{directory?.total ?? 0} centers available</p>
              <div className="bus-center-list">
                {directory?.items.map((c) => (
                  <button
                    className={`bus-center ${center && centerKey(center) === centerKey(c) ? 'selected' : ''}`}
                    key={centerKey(c)}
                    disabled={busy}
                    aria-pressed={Boolean(center && centerKey(center) === centerKey(c))}
                    onClick={() => choose(c)}
                  >
                    <strong>{c.name}</strong>
                    <span>
                      {centerTypeLabels[c.type]} · #{c.id}
                    </span>
                  </button>
                ))}
              </div>
              {directory?.total === 0 && <p>No matching centers. Try another search.</p>}
              {directory && directory.total > directory.pageSize && (
                <div className="status-actions">
                  <button
                    className="button secondary"
                    disabled={page === 1}
                    onClick={() => filter(q, type, page - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {page}</span>
                  <button
                    className="button secondary"
                    disabled={page * directory.pageSize >= directory.total}
                    onClick={() => filter(q, type, page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        <div className="bus-main">
          {!center ? (
            <section className="panel dealer-empty">
              <Bus size={34} />
              <h2>Start with a center</h2>
              <p>Select a center to see its buses and settings.</p>
            </section>
          ) : (
            <>
              <section className="panel bus-selector">
                <h2>{center.name}</h2>
                {busLoading ? (
                  <p role="status">Loading buses…</p>
                ) : (
                  buses && (
                    <>
                      {buses.items.length ? (
                        <label>
                          <span>Bus</span>
                          <select
                            aria-label="Bus"
                            disabled={busy}
                            value={busId}
                            onChange={(e) => {
                              if (dirty && !window.confirm('Discard unsaved bus settings?')) return;
                              setBusId(e.target.value);
                              setDetail(null);
                              setBusError('');
                              setDirty(false);
                              setNotice('');
                            }}
                          >
                            <option value="">Select a bus</option>
                            {buses.items.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} · #{b.id}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p>No buses are registered for this center.</p>
                      )}
                    </>
                  )
                )}
              </section>
              {busError && (
                <div className="dealer-error" role="alert">
                  {busError}
                  <button className="button secondary" onClick={reload}>
                    <RefreshCw size={16} />
                    Retry buses and settings
                  </button>
                </div>
              )}
              {detailLoading && <p role="status">Loading bus settings…</p>}
              {detail && (
                <BusEditor
                  key={detail.revision}
                  detail={detail}
                  onDirty={setDirty}
                  onBusy={setBusy}
                  onReload={reload}
                  onSaved={(d, recorded) => {
                    setDetail(d);
                    setDirty(false);
                    setNotice(
                      recorded
                        ? 'Bus settings saved and confirmed.'
                        : 'Bus settings saved. The local operation receipt could not be finalized.',
                    );
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
