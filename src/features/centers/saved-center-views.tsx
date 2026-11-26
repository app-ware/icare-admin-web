'use client';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, RefreshCw, Save, Undo2 } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { api, RequestError } from '@/lib/client';
import {
  centerViewFilters,
  sameCenterViewFilters,
  createCenterViewSchema,
  type CenterViewFilters,
  type CenterViews,
  type SavedCenterView,
} from '@/domain/center-views';
import type { DirectoryQuery } from '@/domain/management';

const typeLabels = { all: 'All center types', '1': 'Nursery', '3': 'Lite', '4': 'School' };
const sortLabels = { name: 'Name A–Z', 'name-desc': 'Name Z–A', type: 'Center type' };
function FilterSummary({ filters }: { filters: CenterViewFilters }) {
  return (
    <p className="saved-view-summary">
      {typeLabels[filters.type]} · {filters.status === 'all' ? 'All statuses' : filters.status} ·{' '}
      {sortLabels[filters.sort]}
      {filters.q && <> · Search: “{filters.q}”</>}
    </p>
  );
}
export function SavedCenterViews({
  query,
  onApply,
}: {
  query: DirectoryQuery;
  onApply: (filters: CenterViewFilters) => void;
}) {
  const [data, setData] = useState<CenterViews>({ items: [], removed: [] });
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [nonce, setNonce] = useState(0);
  const [editor, setEditor] = useState<{
    id: string;
    revision?: string;
    name: string;
    filters: CenterViewFilters;
  } | null>(null);
  const [editorError, setEditorError] = useState('');
  const [editorConflict, setEditorConflict] = useState(false);
  const pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<CenterViews>('/api/center-views', 'GET', undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setSelected((id) => (result.items.some((view) => view.id === id) ? id : ''));
        setError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load saved views.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [nonce]);
  const current = data.items.find((view) => view.id === selected),
    filters = centerViewFilters(query);
  function refresh() {
    setActionError('');
    setNonce((n) => n + 1);
  }
  function edit(view?: SavedCenterView) {
    setEditor({
      id: view?.id ?? crypto.randomUUID(),
      revision: view?.revision,
      name: view?.name ?? '',
      filters,
    });
    setEditorError('');
    setEditorConflict(false);
    setNotice('');
    setActionError('');
  }
  async function save() {
    if (!editor || pending.current || editorConflict) return;
    const parsed = createCenterViewSchema.safeParse({
      id: editor.id,
      name: editor.name,
      filters: editor.filters,
    });
    if (!parsed.success) {
      setEditorError('Enter a view name of 1–60 characters without control characters.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setEditorError('');
    try {
      const result = await api<SavedCenterView>(
        editor.revision ? `/api/center-views/${editor.id}` : '/api/center-views',
        editor.revision ? 'PATCH' : 'POST',
        editor.revision
          ? { revision: editor.revision, name: parsed.data.name, filters: editor.filters }
          : parsed.data,
      );
      if (!mounted.current) return;
      setData((old) => ({
        ...old,
        items: [result, ...old.items.filter((v) => v.id !== result.id)],
      }));
      setSelected(result.id);
      setNotice(`Saved view “${result.name}”.`);
      setEditor(null);
    } catch (e) {
      if (mounted.current) {
        setEditorError(e instanceof Error ? e.message : 'Unable to save this view.');
        if (e instanceof RequestError && ['VIEW_CONFLICT', 'VIEW_NOT_FOUND'].includes(e.code)) {
          setEditorConflict(true);
          setNonce((n) => n + 1);
        }
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function change(view: SavedCenterView, restore: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await api(
        `/api/center-views/${view.id}${restore ? '/restore' : ''}`,
        restore ? 'POST' : 'DELETE',
        { revision: view.revision },
      );
      if (!mounted.current) return;
      setNotice(
        `${restore ? 'Restored' : 'Removed'} view “${view.name}”.${restore ? '' : ' You can restore it below.'}`,
      );
      if (!restore) setSelected('');
      setNonce((n) => n + 1);
    } catch (e) {
      if (mounted.current) {
        setActionError(e instanceof Error ? e.message : 'Unable to change this view.');
        if (e instanceof RequestError && ['VIEW_CONFLICT', 'VIEW_NOT_FOUND'].includes(e.code))
          setNonce((n) => n + 1);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="saved-center-views" aria-labelledby="saved-views-heading">
      <div className="saved-views-heading">
        <div>
          <h2 id="saved-views-heading">
            <Bookmark size={17} />
            My saved views
          </h2>
          <p>Save filters for next time. Results always follow your current center access.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh saved views"
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="saved-views-controls">
        <label>
          <span className="sr-only">Saved center view</span>
          <select
            aria-label="Saved center view"
            value={current?.id ?? ''}
            disabled={loading || busy}
            onChange={(event) => {
              setSelected(event.target.value);
              setNotice('');
            }}
          >
            <option value="">{loading ? 'Loading saved views…' : 'Choose a saved view'}</option>
            {data.items.map((view) => (
              <option value={view.id} key={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={!current || loading || busy}
          onClick={() => {
            if (current) {
              onApply(current.filters);
              setNotice(`Applied view “${current.name}”.`);
            }
          }}
        >
          Apply view
        </button>
        <button
          className="button secondary"
          disabled={loading || busy || Boolean(error)}
          onClick={() => edit()}
        >
          <Save size={15} />
          Save current filters
        </button>
        {current && (
          <>
            <button className="text-link" disabled={loading || busy} onClick={() => edit(current)}>
              Update view
            </button>
            <button
              className="text-link"
              disabled={loading || busy}
              onClick={() => void change(current, false)}
            >
              Remove view
            </button>
          </>
        )}
      </div>
      {current && (
        <>
          <FilterSummary filters={current.filters} />
          <p className="saved-view-hint">
            {sameCenterViewFilters(filters, current.filters)
              ? 'These filters are applied.'
              : 'Current filters differ from this saved view. Apply it or update it with the current filters.'}
          </p>
        </>
      )}
      {!loading && !error && !data.items.length && (
        <p className="saved-view-hint">
          No saved views yet. Choose your filters, then save them here.
        </p>
      )}
      {notice && (
        <p role="status" className="saved-view-hint">
          {notice}
        </p>
      )}
      {(error || actionError) && (
        <div role="alert" className="form-error">
          {error || actionError}
          <button className="text-link" disabled={busy || loading} onClick={refresh}>
            Refresh views
          </button>
        </div>
      )}
      {data.removed.length > 0 && (
        <details className="saved-views-removed">
          <summary>Recently removed views ({data.removed.length})</summary>
          <p>
            The 20 most recently removed views can be restored for up to 30 days. Restoring does not
            apply filters.
          </p>
          <ul>
            {data.removed.map((view) => (
              <li key={view.id}>
                <span>{view.name}</span>
                <button
                  className="text-link"
                  disabled={busy || loading}
                  onClick={() => void change(view, true)}
                  aria-label={`Restore view ${view.name}`}
                >
                  <Undo2 size={14} />
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {editor && (
        <Dialog
          title={editor.revision ? 'Update saved view' : 'Save center view'}
          eyebrow="YOUR DIRECTORY"
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="field">
              <label htmlFor="saved-view-name">View name</label>
              <input
                id="saved-view-name"
                aria-label="View name"
                value={editor.name}
                maxLength={60}
                required
                disabled={busy}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </div>
            <FilterSummary filters={editor.filters} />
            <p className="saved-view-hint">
              {editor.revision
                ? 'This replaces the name and filters of the selected view.'
                : 'Only the name and filters are saved to your account.'}{' '}
              Page position and center records are not saved.
            </p>
            {editorError && (
              <div role="alert" className="form-error">
                {editorError}
                {editorConflict && (
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => {
                      setEditor(null);
                      refresh();
                    }}
                  >
                    Close and refresh views
                  </button>
                )}
              </div>
            )}
            <div className="form-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={busy || editorConflict}>
                {busy ? 'Saving…' : 'Save view'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
