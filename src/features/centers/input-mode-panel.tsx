'use client';
import { useEffect, useId, useState } from 'react';
import { Check, LoaderCircle, QrCode, RefreshCw } from 'lucide-react';
import type { CenterRef } from '@/domain/centers';
import type { CenterInputMode, InputModeChange, QrJob, QrStart } from '@/domain/input-mode';
import { api } from '@/lib/client';

export function InputModePanel({ center }: { center: CenterRef }) {
  const base = `/api/centers/${center.type}/${center.id}/input-mode`,
    id = useId();
  const [data, setData] = useState<CenterInputMode | null>(null),
    [selected, setSelected] = useState(''),
    [review, setReview] = useState(false),
    [watermark, setWatermark] = useState(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [startRequest, setStartRequest] = useState<QrStart | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void api<CenterInputMode>(base, 'GET', undefined, abort.signal)
      .then(setData)
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load input-mode settings.');
      });
    return () => abort.abort();
  }, [base]);
  async function run(action: () => Promise<void>) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The operation could not be confirmed. Refresh the current settings before continuing.',
      );
    } finally {
      setPending(false);
    }
  }
  async function reload() {
    await run(async () => {
      setData(await api<CenterInputMode>(base));
      setReview(false);
      setSelected('');
      setStartRequest(null);
    });
  }
  function updateJob(job: QrJob) {
    setData((current) => (current ? { ...current, job } : current));
  }
  const target = selected === 'inherit' ? data?.defaultType : Number(selected),
    job = data?.job;
  async function save() {
    if (!data || !selected) return;
    const change: InputModeChange =
      selected === 'inherit'
        ? { action: 'inherit', revision: data.revision }
        : { action: 'override', revision: data.revision, inputType: Number(selected) };
    if (target === 3 && job?.state === 'ready') change.jobId = job.id;
    await run(async () => {
      const saved = await api<CenterInputMode & { receiptRecorded: boolean }>(
        base,
        'PATCH',
        change,
      );
      setData(saved);
      setSelected('');
      setReview(false);
      setStartRequest(null);
      setNotice(
        saved.receiptRecorded
          ? 'Input mode saved. Existing QR codes have not been revoked.'
          : 'Input mode saved; the local receipt needs review.',
      );
    });
  }
  async function start() {
    if (!data) return;
    const request = startRequest ?? {
      revision: data.revision,
      requestId: crypto.randomUUID(),
      useWatermark: watermark,
    };
    setStartRequest(request);
    await run(async () => {
      updateJob(await api<QrJob>(`${base}/qr`, 'POST', request));
      setStartRequest(null);
    });
  }
  async function process() {
    if (!job) return;
    await run(async () => {
      let current = await api<QrJob>(`${base}/qr/${job.id}`);
      updateJob(current);
      // Each POST prepares one bounded image. A failed request stops the loop;
      // refresh/resume reads durable progress before another explicit attempt.
      for (let i = 0; i < 3 && ['pending', 'running'].includes(current.state); i++) {
        current = await api<QrJob>(`${base}/qr/${job.id}`, 'POST', { action: 'advance' });
        updateJob(current);
      }
      if (current.state === 'ready')
        setNotice('All demo QR images are verified. Review and apply QR mode when ready.');
    });
  }
  return (
    <section className="panel input-mode-panel" aria-labelledby={`${id}-heading`}>
      <div className="panel-heading">
        <div>
          <h2 id={`${id}-heading`}>Input mode &amp; QR codes</h2>
          <p>Choose how this center records child entry.</p>
        </div>
        <QrCode size={22} />
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="text-link"
            disabled={pending}
            onClick={() => void reload()}
          >
            Refresh current settings
          </button>
        </div>
      )}
      {notice && (
        <div className="success-notice" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {!data && !error && <p role="status">Loading input-mode settings…</p>}
      {data && (
        <>
          <div className="input-mode-summary">
            <div>
              <small>Current input mode</small>
              <strong>{data.label}</strong>
              <span className="badge blue">
                {data.source === 'inherited' ? 'Inherited default' : 'Center override'}
              </span>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          {data.mode === 'preview' ? (
            <p className="inline-notice">
              Demo only: QR jobs use three fictional children and codes marked ICARE-DEMO. Images
              are private to your job and do not work in iCare scanners.
            </p>
          ) : (
            <p className="inline-notice">
              Live QR generation awaits scanner compatibility and shared-storage acceptance. No
              child records are loaded here. Live input-mode changes have a separate environment
              switch.
            </p>
          )}
          {data.issues.map((issue) => (
            <p className="inline-notice" key={issue}>
              {issue}
            </p>
          ))}
          {!data.canChange && !data.issues.length && (
            <p className="field-hint">
              Input-mode changes are disabled for this account or environment.
            </p>
          )}
          {data.canChange && (
            <div className="input-mode-editor">
              <div className="field">
                <label htmlFor={`${id}-choice`}>New input mode</label>
                <select
                  id={`${id}-choice`}
                  value={selected}
                  disabled={pending || review || Boolean(startRequest)}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setNotice('');
                  }}
                >
                  <option value="">Choose a change</option>
                  {data.choices.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.id === 3 && !data.canGenerate}>
                      {c.label}
                    </option>
                  ))}
                  {data.source === 'override' && data.defaultType != null && (
                    <option value="inherit" disabled={data.defaultType === 3 && !data.canGenerate}>
                      Use catalog default (
                      {data.choices.find((c) => c.id === data.defaultType)?.label})
                    </option>
                  )}
                </select>
              </div>
              {!review ? (
                <button
                  type="button"
                  className="button primary"
                  disabled={!selected || pending}
                  onClick={() => {
                    setReview(true);
                    setError('');
                  }}
                >
                  Review change
                </button>
              ) : (
                <div
                  className="input-mode-review"
                  role="region"
                  aria-label="Review input-mode change"
                >
                  <h3>Review input-mode change</h3>
                  <p>
                    {data.label} →{' '}
                    <strong>{data.choices.find((c) => c.id === target)?.label}</strong>
                    {selected === 'inherit' ? ' · inherited default' : ' · center override'}
                  </p>
                  <p className="field-hint">
                    This changes the input-mode setting only. Existing QR codes and external
                    sessions are not revoked.
                  </p>
                  {target === 3 && (
                    <p>
                      Prepare all three demo QR images before applying this mode. The current mode
                      stays in place until you confirm.
                    </p>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={pending || Boolean(startRequest)}
                      onClick={() => {
                        setReview(false);
                        setSelected('');
                      }}
                    >
                      Cancel review
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={pending || (target === 3 && job?.state !== 'ready')}
                      onClick={() => void save()}
                    >
                      Confirm input mode
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {data.canGenerate && (
            <div className="qr-workspace">
              <h3>Private demo QR images</h3>
              <p className="field-hint">
                Jobs expire after seven days. Keep this page open while preparing images; you can
                refresh and resume an interrupted job. Ready images are kept when failed images are
                retried. A newly published watermark requires a new job.
              </p>
              <label className="qr-watermark-choice">
                <input
                  type="checkbox"
                  checked={watermark}
                  disabled={
                    pending ||
                    !data.watermarkAvailable ||
                    Boolean(startRequest) ||
                    Boolean(job && !['applied', 'cancelled'].includes(job.state))
                  }
                  onChange={(e) => setWatermark(e.target.checked)}
                />
                Apply the current center watermark
              </label>
              {!data.watermarkAvailable && (
                <p className="field-hint">Publish a center watermark to enable this option.</p>
              )}
              {(!job || ['applied', 'cancelled'].includes(job.state)) && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending}
                  onClick={() => void start()}
                >
                  {startRequest ? 'Recover QR job request' : 'Start demo QR job'}
                </button>
              )}
              {job && (
                <div className="qr-job" aria-label="QR job progress">
                  <div role="status">
                    <strong>
                      {job.state === 'applied'
                        ? 'Applied'
                        : job.state === 'ready'
                          ? 'Ready for review'
                          : job.state === 'cancelled'
                            ? 'Cancelled'
                            : job.state === 'failed'
                              ? 'Needs retry'
                              : 'Preparation pending'}
                    </strong>
                    <p>
                      {job.ready} of {job.total} images ready · {job.failed} failed
                    </p>
                    {pending && <LoaderCircle className="spin" size={18} />}
                  </div>
                  <progress value={job.ready} max={job.total} aria-label="Verified QR images" />
                  <p className="field-hint">
                    {job.useWatermark
                      ? 'This job uses a snapshot of the published watermark.'
                      : 'This job uses no watermark.'}
                  </p>
                  {job.failed > 0 && (
                    <p className="inline-notice">
                      Some QR images could not be prepared or verified. Retry failed images, or
                      cancel this job and prepare a new one without a watermark.
                    </p>
                  )}
                  <div className="qr-job-actions">
                    {['pending', 'running'].includes(job.state) && (
                      <button
                        type="button"
                        className="button primary"
                        disabled={pending}
                        onClick={() => void process()}
                      >
                        Prepare / resume images
                      </button>
                    )}
                    {job.state === 'failed' && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={pending}
                        onClick={() =>
                          void run(async () =>
                            updateJob(
                              await api<QrJob>(`${base}/qr/${job.id}`, 'POST', { action: 'retry' }),
                            ),
                          )
                        }
                      >
                        Retry failed images
                      </button>
                    )}
                    {!['applied', 'cancelled'].includes(job.state) && (
                      <button
                        type="button"
                        className="text-link"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            updateJob(
                              await api<QrJob>(`${base}/qr/${job.id}`, 'POST', {
                                action: 'cancel',
                              }),
                            );
                            setStartRequest(null);
                          })
                        }
                      >
                        Cancel QR job
                      </button>
                    )}
                  </div>
                  <div className="qr-image-grid">
                    {job.items.map((item) => (
                      <div className="qr-image-card" key={item.id}>
                        <strong>{item.label}</strong>
                        <span>{item.state}</span>
                        {item.imageUrl && (
                          <>
                            <img
                              src={item.imageUrl}
                              alt={`Demo QR code for ${item.label.toLowerCase()}`}
                              loading="lazy"
                              width={180}
                              height={180}
                            />
                            <a href={item.imageUrl} download="demo-qr.png" className="text-link">
                              Download demo PNG
                            </a>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
