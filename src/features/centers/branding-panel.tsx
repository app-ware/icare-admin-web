'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Upload, Save, RefreshCw } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import {
  IMAGE_MAX_BYTES,
  type BrandingAsset,
  type BrandingKind,
  type CenterBranding,
} from '@/domain/branding';
import type { CenterRef } from '@/domain/centers';
import { api, RequestError } from '@/lib/client';

const labels = { logo: 'Logo', photo: 'Center photo' };
type Previews = Partial<Record<BrandingKind, BrandingAsset>>;
export function BrandingPanel({
  center,
  onLogo,
}: {
  center: CenterRef;
  onLogo: (url: string | null) => void;
}) {
  const base = `/api/centers/${center.type}/${center.id}/branding`;
  const [current, setCurrent] = useState<CenterBranding | null>(null),
    [previews, setPreviews] = useState<Previews>({}),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [review, setReview] = useState(false),
    [reloadRequired, setReloadRequired] = useState(false),
    [broken, setBroken] = useState<Record<string, boolean>>({});
  const upload = useRef<AbortController | null>(null),
    inputs = useRef<Partial<Record<BrandingKind, HTMLInputElement>>>({});
  const dirty = Boolean(previews.logo || previews.photo);
  function loaded(data: CenterBranding) {
    setCurrent(data);
    onLogo(data.logo?.url ?? null);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void api<CenterBranding>(base, 'GET', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCurrent(data);
          onLogo(data.logo?.url ?? null);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load branding.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      upload.current?.abort();
    };
  }, [base, onLogo]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  async function reload() {
    setBusy('reload');
    setError('');
    try {
      const data = await api<CenterBranding>(base);
      loaded(data);
      setPreviews((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([kind, p]) => p.id !== data[kind as BrandingKind]?.id),
        ),
      );
      setBroken({});
      setReloadRequired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reload branding.');
    } finally {
      setBusy('');
      setLoading(false);
    }
  }
  async function choose(kind: BrandingKind, file: File) {
    setError('');
    setNotice('');
    if (file.size > IMAGE_MAX_BYTES) {
      setError('Use an image of at most 5 MB.');
      return;
    }
    const controller = new AbortController();
    upload.current = controller;
    setBusy(kind);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const response = await fetch(`${base}/uploads?kind=${kind}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type':
            file.type ||
            ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[
              extension as 'png'
            ] ??
              'application/octet-stream'),
          'X-Image-Extension': extension,
        },
        body: file,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new RequestError(
          data.error?.message ?? 'Unable to upload image.',
          response.status,
          data.error?.code ?? 'UPLOAD_FAILED',
        );
      if (controller.signal.aborted) return;
      const previous = previews[kind];
      setPreviews((old) => ({ ...old, [kind]: data as BrandingAsset }));
      setNotice(`${labels[kind]} preview is ready. Review and save to publish it.`);
      if (previous) await api(previous.url, 'DELETE').catch(() => undefined);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Unable to upload image.');
      else setNotice('Upload canceled. The current images are unchanged.');
    } finally {
      upload.current = null;
      setBusy('');
      if (inputs.current[kind]) inputs.current[kind]!.value = '';
    }
  }
  async function discard(kind?: BrandingKind) {
    setBusy('discard');
    setError('');
    setNotice('');
    try {
      for (const key of (kind ? [kind] : ['logo', 'photo']) as BrandingKind[]) {
        const p = previews[key];
        if (!p) continue;
        try {
          await api(p.url, 'DELETE');
        } catch (e) {
          if (!(e instanceof RequestError && e.status === 404)) throw e;
        }
        setPreviews((old) => {
          const next = { ...old };
          delete next[key];
          return next;
        });
      }
      setNotice('Unused previews discarded. The current images are unchanged.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to discard previews. Try again.');
    } finally {
      setBusy('');
    }
  }
  async function publish() {
    if (!current) return;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const data = await api<CenterBranding>(base, 'PATCH', {
        revision: current.revision,
        ...Object.fromEntries(Object.entries(previews).map(([kind, p]) => [kind, p.id])),
      });
      loaded(data);
      setPreviews({});
      setReview(false);
      setNotice('Portal branding saved.');
      setReloadRequired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to confirm the save.');
      setReloadRequired(true);
      setReview(false);
    } finally {
      setBusy('');
    }
  }
  function image(asset: BrandingAsset | null | undefined, label: string) {
    return !asset ? (
      <div className="branding-placeholder">
        <ImagePlus size={28} />
        <span>No portal image uploaded</span>
      </div>
    ) : broken[asset.id] ? (
      <div className="branding-placeholder" role="status">
        Image unavailable. Reload to check your access and the current images.
      </div>
    ) : (
      <img
        src={asset.url}
        alt={label}
        className={`branding-image branding-${asset.kind}`}
        onError={() => setBroken((v) => ({ ...v, [asset.id]: true }))}
      />
    );
  }
  return (
    <section className="panel branding-panel" aria-label="Center branding">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LOGO & CENTER PHOTO</span>
          <h2>Center branding</h2>
          <p>Add the images your team sees in this portal.</p>
        </div>
        <span className="badge blue">Private portal images</span>
      </div>
      <p className="inline-notice">
        These images are visible to people with access to this center in the new portal. Existing
        iCare apps and their photo URLs are unchanged.
      </p>
      {notice && (
        <div className="success-notice" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p role="status">Loading branding…</p>
      ) : !current ? (
        <button className="button secondary" disabled={Boolean(busy)} onClick={() => void reload()}>
          Retry branding
        </button>
      ) : (
        <>
          {!current.canManage && (
            <p className="inline-notice">Branding changes are disabled for this environment.</p>
          )}
          <div className="branding-grid">
            {(['logo', 'photo'] as const).map((kind) => (
              <article className="branding-card" key={kind} aria-label={`${labels[kind]} upload`}>
                <h3>{labels[kind]}</h3>
                <div className="branding-current">
                  {image(current[kind], `Current ${labels[kind].toLowerCase()}`)}
                </div>
                <small>
                  Current portal image
                  {current[kind] ? ` · ${current[kind]!.width} × ${current[kind]!.height}` : ''}
                </small>
                {previews[kind] && (
                  <div className="branding-preview">
                    <span className="badge blue">Unsaved preview</span>
                    {image(previews[kind], `New ${labels[kind].toLowerCase()} preview`)}
                    <small>
                      {previews[kind]!.width} × {previews[kind]!.height} ·{' '}
                      {Math.ceil(previews[kind]!.bytes / 1024)} KB
                    </small>
                    <button
                      type="button"
                      className="text-link"
                      disabled={Boolean(busy)}
                      onClick={() => void discard(kind)}
                    >
                      Discard {labels[kind].toLowerCase()} preview
                    </button>
                  </div>
                )}
                <label className="branding-file">
                  <span>
                    <Upload size={16} />
                    Choose {labels[kind].toLowerCase()}
                  </span>
                  <input
                    type="file"
                    aria-label={`Choose ${labels[kind].toLowerCase()}`}
                    ref={(el) => {
                      inputs.current[kind] = el ?? undefined;
                    }}
                    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    disabled={!current.canManage || Boolean(busy) || reloadRequired}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void choose(kind, file);
                    }}
                  />
                </label>
              </article>
            ))}
          </div>
          <p className="field-hint">
            JPEG, PNG or WebP · up to 5 MB, 16 megapixels and 8192 pixels per edge. Images are saved
            within 1024 × 1024 pixels, preserving proportions. Animated images are not supported.
            Unused previews expire after 24 hours.
          </p>
          {(busy === 'logo' || busy === 'photo') && (
            <p role="status">
              Validating {labels[busy].toLowerCase()}…{' '}
              <button className="text-link" onClick={() => upload.current?.abort()}>
                Cancel upload
              </button>
            </p>
          )}
          <div className="status-actions">
            <button
              className="button primary"
              disabled={!dirty || !current.canManage || Boolean(busy) || reloadRequired}
              onClick={() => setReview(true)}
            >
              <Save size={16} />
              Review branding changes
            </button>
            <button
              className="button secondary"
              disabled={!dirty || Boolean(busy)}
              onClick={() => void discard()}
            >
              Discard previews
            </button>
            <button
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
              Reload current images
            </button>
          </div>
        </>
      )}
      {review && (
        <Dialog
          title="Publish these images?"
          eyebrow="REVIEW CENTER BRANDING"
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <p>
            Only the selected logo and center photo will change. The current images stay in place
            until you confirm.
          </p>
          <div className="branding-grid">
            {(['logo', 'photo'] as const)
              .filter((k) => previews[k])
              .map((kind) => (
                <div className="branding-card" key={kind}>
                  <h3>{labels[kind]}</h3>
                  {image(previews[kind], `${labels[kind]} to publish`)}
                </div>
              ))}
          </div>
          <div className="status-actions">
            <button
              className="button primary"
              disabled={Boolean(busy)}
              onClick={() => void publish()}
            >
              {busy === 'save' ? 'Saving…' : 'Confirm branding changes'}
            </button>
            <button
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={() => setReview(false)}
            >
              Back to previews
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
