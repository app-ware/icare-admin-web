'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  History,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { centerTypeLabels } from '@/domain/centers';
import {
  reportRules,
  type ActivityCenter,
  type ActivityReport,
  type ExportRequest,
} from '@/domain/activity';
import { api } from '@/lib/client';
type Catalog = { items: ActivityCenter[]; total: number; page: number; pageSize: number };
type Context = {
  asOf: string;
  center: ActivityCenter | null;
  academicYears: { id: number; title: string }[];
  dealers: { id: number; name: string }[];
};
type Receipt = {
  id: string;
  state: string;
  createdAt: number;
  filename: string | null;
  request: ExportRequest;
};
export function ActivityWorkspace({ mode }: { mode: 'activity' | 'reports' }) {
  const [context, setContext] = useState<Context | null>(null),
    [catalog, setCatalog] = useState<Catalog | null>(null);
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState({ q: '', type: 'all', status: 'all', dealerId: '', page: 1 });
  const [selected, setSelected] = useState<ActivityCenter | null>(null),
    [picked, setPicked] = useState<ActivityCenter[]>([]);
  const [period, setPeriod] = useState(''),
    [deleted, setDeleted] = useState(true),
    [year, setYear] = useState(''),
    [years, setYears] = useState<Context['academicYears']>([]);
  const [report, setReport] = useState<ActivityReport | null>(null),
    [group, setGroup] = useState<'all' | 'demo' | 'nonDemo'>('all');
  const [loading, setLoading] = useState(false),
    [catalogLoading, setCatalogLoading] = useState(false),
    [exporting, setExporting] = useState(false);
  const [error, setError] = useState(''),
    [contextError, setContextError] = useState(''),
    [catalogError, setCatalogError] = useState(''),
    [notice, setNotice] = useState('');
  const [nonce, setNonce] = useState(0),
    [history, setHistory] = useState<Receipt[]>([]),
    [historyError, setHistoryError] = useState('');
  const initialized = useRef(false),
    selectionVersion = useRef(0);
  useEffect(
    () => () => {
      selectionVersion.current++;
    },
    [],
  );
  useEffect(() => {
    const timer = setTimeout(
      () => setFilter((old) => (old.q === search ? old : { ...old, q: search, page: 1 })),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setContextError('');
    api<Context>('/api/activity/context', 'GET', undefined, controller.signal)
      .then((data) => {
        setContext(data);
        setPeriod((old) => old || data.asOf.slice(0, 7));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setContextError(e.message);
      });
    return () => controller.abort();
  }, [nonce]);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError('');
    const params = new URLSearchParams({
      q: filter.q,
      type: filter.type,
      status: filter.status,
      page: String(filter.page),
    });
    if (filter.dealerId) params.set('dealerId', filter.dealerId);
    api<Catalog>(`/api/activity/centers?${params}`, 'GET', undefined, controller.signal)
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted) setCatalogError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [filter, nonce]);
  useEffect(() => {
    const controller = new AbortController();
    setHistoryError('');
    api<{ items: Receipt[] }>('/api/reports/exports', 'GET', undefined, controller.signal)
      .then((data) => setHistory(data.items))
      .catch((e) => {
        if (!controller.signal.aborted) setHistoryError(e.message);
      });
    return () => controller.abort();
  }, [nonce]);
  useEffect(() => {
    if (mode !== 'activity' || !context || !catalog || initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search),
      id = Number(params.get('centerId')),
      type = Number(params.get('centerType'));
    const requested =
      id > 0 && [1, 3, 4].includes(type)
        ? { id, type: type as 1 | 3 | 4, name: '', domain: '', active: null }
        : catalog.items[0];
    if (requested)
      void choose(
        requested,
        params.get('period') || context.asOf.slice(0, 7),
        params.get('academicYearId') || undefined,
        params.get('includeDeleted') !== 'false',
      );
  }, [context, catalog, mode]);
  async function choose(
    center: ActivityCenter,
    month = period,
    requestedYear?: string,
    includeDeleted = true,
  ) {
    const version = ++selectionVersion.current;
    setSelected(center);
    setReport(null);
    setError('');
    setLoading(true);
    try {
      const metadata = await api<Context>(
        `/api/activity/context?centerId=${center.id}&centerType=${center.type}`,
      );
      if (version !== selectionVersion.current) return;
      const chosenYear =
        center.type === 4
          ? (metadata.academicYears.find((y) => String(y.id) === requestedYear)?.id ??
            metadata.academicYears[0]?.id)
          : undefined;
      const date = month || metadata.asOf.slice(0, 7);
      setSelected(metadata.center ?? center);
      setYears(metadata.academicYears);
      setYear(chosenYear ? String(chosenYear) : '');
      setPeriod(date);
      setDeleted(center.type !== 4 && includeDeleted);
      if (center.type === 4 && !chosenYear) {
        setError('No academic year is available for this School center.');
        return;
      }
      const data = await fetchReport(center, date, center.type !== 4 && includeDeleted, chosenYear);
      if (version === selectionVersion.current) {
        setReport(data);
        updateUrl(data);
      }
    } catch (e) {
      if (version === selectionVersion.current)
        setError(e instanceof Error ? e.message : 'Unable to load activity.');
    } finally {
      if (version === selectionVersion.current) setLoading(false);
    }
  }
  async function fetchReport(
    center: ActivityCenter,
    month: string,
    includeDeleted: boolean,
    academicYear?: number,
  ) {
    const params = new URLSearchParams({
      centerId: String(center.id),
      centerType: String(center.type),
      period: month,
      includeDeleted: String(includeDeleted),
    });
    if (academicYear) params.set('academicYearId', String(academicYear));
    const data = await api<ActivityReport>(`/api/activity?${params}`);
    return data;
  }
  function updateUrl(data: ActivityReport) {
    const params = new URLSearchParams({
      centerId: String(data.center.id),
      centerType: String(data.center.type),
      period: data.period,
      includeDeleted: String(data.includeDeleted),
    });
    if (data.academicYear) params.set('academicYearId', String(data.academicYear.id));
    window.history.replaceState(null, '', `/activity?${params}`);
  }
  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const version = ++selectionVersion.current;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const data = await fetchReport(
        selected,
        period,
        deleted,
        selected.type === 4 ? Number(year) : undefined,
      );
      if (version === selectionVersion.current) {
        setReport(data);
        updateUrl(data);
      }
    } catch (e) {
      if (version === selectionVersion.current)
        setError(e instanceof Error ? e.message : 'Unable to load activity.');
    } finally {
      if (version === selectionVersion.current) setLoading(false);
    }
  }
  function pick(center: ActivityCenter) {
    setPicked((old) => {
      const found = old.some((c) => c.id === center.id && c.type === center.type);
      if (found) return old.filter((c) => c.id !== center.id || c.type !== center.type);
      if (old.length >= 20) {
        setError('Select at most 20 centers for one workbook.');
        return old;
      }
      return [...old, center];
    });
  }
  async function download(request: ExportRequest) {
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/reports/exports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message || 'Unable to generate the report.');
      }
      if (!response.headers.get('content-type')?.includes('spreadsheetml'))
        throw new Error('The server did not return an Excel workbook.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('The workbook is empty.');
      const filename =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        'icare-activity.xlsx';
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Workbook generated. Your download has started.');
      setNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate the report.');
      setNonce((n) => n + 1);
    } finally {
      setExporting(false);
    }
  }
  const selectedKeys = new Set(picked.map((c) => `${c.id}_${c.type}`));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A CLEARER VIEW OF ACTIVITY</span>
          <h1>{mode === 'activity' ? 'Activity & insights' : 'Activity reports'}</h1>
          <p>
            {mode === 'activity'
              ? 'Explore class activity, demo records and the calendar behind the counts.'
              : 'Choose centers and generate a clear, aggregate Excel workbook.'}
          </p>
        </div>
        <span className="badge blue">
          <ShieldCheck size={14} />
          No child details
        </span>
      </div>
      <nav className="activity-tabs" aria-label="Activity workspace">
        <Link href="/activity" aria-current={mode === 'activity' ? 'page' : undefined}>
          <BarChart3 size={16} />
          Class activity
        </Link>
        <Link href="/reports" aria-current={mode === 'reports' ? 'page' : undefined}>
          <FileSpreadsheet size={16} />
          Report workbooks
        </Link>
      </nav>
      {notice && (
        <div className="dealer-success" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {(error || contextError) && (
        <div className="form-error activity-error" role="alert">
          {error || contextError}
        </div>
      )}
      <section className="panel activity-catalog">
        <div className="panel-heading">
          <div>
            <h2>{mode === 'activity' ? 'Choose a center' : 'Select report centers'}</h2>
            <p>
              {mode === 'reports'
                ? 'Up to 20 Nursery/Lite centers per workbook. School uses its separate academic-year view.'
                : 'Your ownership and report grants are checked on every request.'}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh activity centers"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="dealer-toolbar activity-toolbar">
          <label className="search-field">
            <Search size={17} />
            <span className="sr-only">Search activity centers</span>
            <input
              value={search}
              maxLength={100}
              placeholder="Search centers by name, domain or ID"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Activity center type</span>
            <select
              value={filter.type}
              onChange={(e) => setFilter((old) => ({ ...old, type: e.target.value, page: 1 }))}
            >
              <option value="all">All types</option>
              <option value="1">Nursery</option>
              <option value="3">Lite</option>
              <option value="4">School</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Activity center status</span>
            <select
              value={filter.status}
              onChange={(e) => setFilter((old) => ({ ...old, status: e.target.value, page: 1 }))}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          {!!context?.dealers.length && (
            <label>
              <span className="sr-only">Assigned dealer filter</span>
              <select
                value={filter.dealerId}
                onChange={(e) =>
                  setFilter((old) => ({ ...old, dealerId: e.target.value, page: 1 }))
                }
              >
                <option value="">All assigned dealers</option>
                {context.dealers.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {catalogError ? (
          <div className="dealer-empty" role="alert">
            <p>{catalogError}</p>
            <button className="button secondary" onClick={() => setNonce((n) => n + 1)}>
              Retry centers
            </button>
          </div>
        ) : !catalog ? (
          <div className="dealer-empty" role="status">
            <LoaderCircle className="spin" size={23} />
            Loading centers…
          </div>
        ) : !catalog.items.length ? (
          <div className="dealer-empty">
            <Building2 size={29} />
            <h3>No centers match these filters</h3>
            <button
              className="button secondary"
              onClick={() => {
                setSearch('');
                setFilter({ q: '', type: 'all', status: 'all', dealerId: '', page: 1 });
              }}
            >
              Clear center filters
            </button>
          </div>
        ) : (
          <div
            className={`activity-center-grid ${catalogLoading ? 'dealer-is-loading' : ''}`}
            aria-busy={catalogLoading}
          >
            {catalog.items.map((center) => (
              <article
                className={`activity-center-card ${selected?.id === center.id && selected.type === center.type && mode === 'activity' ? 'is-selected' : ''}`}
                key={`${center.id}_${center.type}`}
              >
                <div>
                  <span className="activity-center-icon">
                    <Building2 size={20} />
                  </span>
                  <span className="badge blue">{centerTypeLabels[center.type]}</span>
                </div>
                <h3>{center.name}</h3>
                <p>
                  {center.domain || `Center #${center.id}`}
                  <span>
                    {' '}
                    ·{' '}
                    {center.active === null
                      ? 'Status unknown'
                      : center.active
                        ? 'Active'
                        : 'Inactive'}
                  </span>
                </p>
                {mode === 'activity' ? (
                  <button
                    type="button"
                    aria-label={`View activity for ${center.name}`}
                    onClick={() => void choose(center)}
                  >
                    View activity
                    <ChevronRight size={15} />
                  </button>
                ) : center.type === 4 ? (
                  <Link href={`/activity?centerId=${center.id}&centerType=4`}>
                    Open School activity
                    <ChevronRight size={15} />
                  </Link>
                ) : (
                  <label className="dealer-check">
                    <input
                      type="checkbox"
                      aria-label={`Select ${center.name}`}
                      checked={selectedKeys.has(`${center.id}_${center.type}`)}
                      disabled={
                        !selectedKeys.has(`${center.id}_${center.type}`) && picked.length >= 20
                      }
                      onChange={() => pick(center)}
                    />
                    <span>Include in workbook</span>
                  </label>
                )}
              </article>
            ))}
          </div>
        )}
        {catalog && (
          <div className="dealer-pagination">
            <span>{catalog.total} accessible centers</span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous activity center page"
                disabled={filter.page <= 1 || catalogLoading}
                onClick={() => setFilter((old) => ({ ...old, page: old.page - 1 }))}
              >
                <ChevronLeft size={18} />
              </button>
              <span>Page {filter.page}</span>
              <button
                className="icon-button"
                aria-label="Next activity center page"
                disabled={filter.page * catalog.pageSize >= catalog.total || catalogLoading}
                onClick={() => setFilter((old) => ({ ...old, page: old.page + 1 }))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
      {mode === 'reports' ? (
        <section className="panel activity-export-panel">
          <div className="panel-heading">
            <div>
              <h2>Build a workbook</h2>
              <p>
                Center summary, class breakdown and counting rules. No invoices or child-level
                records.
              </p>
            </div>
            <FileSpreadsheet size={25} />
          </div>
          <div className="activity-export-body">
            <div className="activity-selection-heading">
              <strong>{picked.length} centers selected</strong>
              <button
                type="button"
                className="text-link"
                onClick={() => setPicked([])}
                disabled={!picked.length}
              >
                Clear selection
              </button>
            </div>
            <div className="dealer-selected-centers">
              {picked.map((c) => (
                <button
                  key={`${c.id}_${c.type}`}
                  onClick={() => pick(c)}
                  aria-label={`Remove report center ${c.name}`}
                >
                  {c.name}
                  <X size={12} />
                </button>
              ))}
            </div>
            <div className="activity-period-controls">
              <label>
                Report month
                <input
                  type="month"
                  value={period}
                  min="2000-01"
                  max={context?.asOf.slice(0, 7)}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </label>
              <label className="dealer-check">
                <input
                  type="checkbox"
                  checked={deleted}
                  onChange={(e) => setDeleted(e.target.checked)}
                />
                <span>
                  Include deleted records<small>Legacy Nursery/Lite export scope.</small>
                </span>
              </label>
              <button
                className="button primary"
                disabled={exporting || !picked.length || !period}
                onClick={() =>
                  void download({
                    period,
                    includeDeleted: deleted,
                    centers: picked.map(({ id, type }) => ({ id, type })),
                  })
                }
              >
                {exporting ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{' '}
                {exporting ? 'Preparing workbook…' : 'Generate Excel workbook'}
              </button>
            </div>
          </div>
        </section>
      ) : selected ? (
        <section className="activity-detail">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  {centerTypeLabels[selected.type]} · #{selected.id}
                </span>
                <h2>{selected.name}</h2>
              </div>
              <CalendarDays size={24} />
            </div>
            <form className="activity-period-controls" onSubmit={run}>
              <label>
                Activity month
                <input
                  type="month"
                  value={period}
                  required
                  min="2000-01"
                  max={context?.asOf.slice(0, 7)}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    selectionVersion.current++;
                    setLoading(false);
                    setReport(null);
                  }}
                />
              </label>
              {selected.type === 4 ? (
                <label htmlFor="activity-academic-year">
                  Academic year
                  <select
                    id="activity-academic-year"
                    value={year}
                    required
                    onChange={(e) => {
                      setYear(e.target.value);
                      selectionVersion.current++;
                      setLoading(false);
                      setReport(null);
                    }}
                  >
                    {!years.length && <option value="">No academic years</option>}
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="dealer-check">
                  <input
                    type="checkbox"
                    checked={deleted}
                    onChange={(e) => {
                      setDeleted(e.target.checked);
                      selectionVersion.current++;
                      setLoading(false);
                      setReport(null);
                    }}
                  />
                  <span>
                    Include deleted records
                    <small>Current membership, including marked-deleted rows.</small>
                  </span>
                </label>
              )}
              <button
                className="button primary"
                disabled={loading || !period || (selected.type === 4 && !year)}
              >
                {loading ? <LoaderCircle className="spin" size={16} /> : <BarChart3 size={16} />}
                View activity
              </button>
            </form>
          </section>
          {loading && (
            <div className="panel dealer-empty" role="status">
              <LoaderCircle size={25} className="spin" />
              <p>Calculating activity…</p>
            </div>
          )}
          {report && !loading && (
            <>
              <div className="activity-window">
                <Info size={17} />
                <p>
                  Showing <strong>{report.period}</strong>, as of {report.asOf}. Interval{' '}
                  {report.start} → {report.endExclusive} <strong>(end excluded)</strong>; maximum{' '}
                  {report.maxDays} days.
                </p>
              </div>
              <section className="activity-metrics" aria-label="Activity totals">
                {[
                  [report.totals.all.registered, 'Unique records'],
                  [report.totals.nonDemo.long, 'Non-demo · 14+ days'],
                  [report.totals.demo.registered, 'Demo records'],
                  [report.totals.all.unresolved, 'Unresolved records'],
                ].map(([value, label]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </section>
              <section className="panel activity-class-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Class breakdown</h2>
                    <p>Class counts can overlap; center totals count each record once.</p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={exporting}
                    onClick={() =>
                      void download({
                        period: report.period,
                        includeDeleted: report.includeDeleted,
                        centers: [{ id: report.center.id, type: report.center.type }],
                        academicYearId: report.academicYear?.id,
                      })
                    }
                  >
                    {exporting ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    Class workbook
                  </button>
                </div>
                <div className="activity-group-tabs" aria-label="Activity record group">
                  {[
                    ['all', 'All records'],
                    ['nonDemo', 'Non-demo'],
                    ['demo', 'Demo'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={group === value}
                      onClick={() => setGroup(value as typeof group)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!report.classes.length ? (
                  <div className="dealer-empty">
                    <h3>No classes for this selection</h3>
                    <p>
                      The report contains no eligible class membership for this center and period.
                    </p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="activity-table">
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th>Registered</th>
                          <th>Zero days</th>
                          <th>1–5 days</th>
                          <th>6–13 days</th>
                          <th>14+ days</th>
                          <th>Unresolved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.classes.map((row) => (
                          <tr key={row.id}>
                            <th scope="row">
                              {row.name}
                              <div
                                className="activity-bars"
                                role="img"
                                aria-label={`Distribution for ${row.name}: ${row[group].short} short, ${row[group].medium} medium, ${row[group].long} long, ${row[group].unresolved} unresolved`}
                              >
                                {(['zero', 'short', 'medium', 'long', 'unresolved'] as const).map(
                                  (key) => (
                                    <span
                                      className={`bucket-${key}`}
                                      key={key}
                                      style={{
                                        width: `${row[group].registered ? (100 * row[group][key]) / row[group].registered : 0}%`,
                                      }}
                                    />
                                  ),
                                )}
                              </div>
                            </th>
                            {(
                              [
                                'registered',
                                'zero',
                                'short',
                                'medium',
                                'long',
                                'unresolved',
                              ] as const
                            ).map((key) => (
                              <td key={key}>{row[group][key]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <section className="panel activity-quality">
                <div className="panel-heading">
                  <div>
                    <h2>Data quality & assumptions</h2>
                    <p>Unresolved records are kept separate from zero activity.</p>
                  </div>
                  <ShieldCheck size={23} />
                </div>
                <dl>
                  {Object.entries(report.quality).map(([key, value]) => (
                    <div key={key}>
                      <dt>
                        {
                          {
                            assumedFull: 'No history · full interval assumed',
                            futureEvents: 'Future events ignored',
                            conflictingHistory: 'Conflicting activity history',
                            outsideHistory: 'History in another center',
                            invalidHistory: 'Undated activation history',
                            centerlessEvents: 'Legacy events without a center',
                            duplicateEnrollments: 'Duplicate memberships collapsed',
                            overlappingStudents: 'Records in multiple classes',
                          }[key]
                        }
                      </dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          )}
        </section>
      ) : (
        <div className="panel dealer-empty">
          <BarChart3 size={30} />
          <h3>Select a center to explore activity</h3>
        </div>
      )}
      <details className="panel activity-rules">
        <summary>
          <Info size={17} />
          How these reports are counted
        </summary>
        <ul>
          {reportRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </details>
      <section className="panel activity-history">
        <div className="panel-heading">
          <div>
            <h2>
              <History size={18} />
              Recent report generations
            </h2>
            <p>
              Your own requests. Generated means the workbook was prepared, not that a browser save
              was confirmed.
            </p>
          </div>
        </div>
        {historyError ? (
          <p className="form-error" role="alert">
            {historyError}
          </p>
        ) : !history.length ? (
          <p className="activity-no-history">Your generated workbooks will appear here.</p>
        ) : (
          history.map((item) => (
            <div className="activity-history-row" key={item.id}>
              <FileSpreadsheet size={21} />
              <div>
                <strong>
                  {item.request.period} · {item.request.centers.length}{' '}
                  {item.request.centers.length === 1 ? 'center' : 'centers'}
                </strong>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </div>
              <span
                className={`status-badge ${item.state === 'generated' ? 'active' : item.state === 'failed' ? 'inactive' : 'unknown'}`}
              >
                {item.state === 'generated'
                  ? 'Generated'
                  : item.state === 'failed'
                    ? 'Failed'
                    : 'Preparing'}
              </span>
              <button
                className="text-link"
                disabled={exporting}
                onClick={() => void download(item.request)}
              >
                Generate again
              </button>
            </div>
          ))
        )}
      </section>
    </>
  );
}
