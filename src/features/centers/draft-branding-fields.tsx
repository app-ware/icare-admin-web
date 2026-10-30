'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import {
  IMAGE_MAX_BYTES,
  brandingKinds,
  brandingLabels,
  type BrandingAsset,
  type BrandingKind,
} from '@/domain/branding';
import type { SavedDraft } from '@/domain/management';
import { api, RequestError } from '@/lib/client';
export type DraftImages = SavedDraft['branding'];
export function DraftBrandingFields({
  draft,
  images,
  onChange,
  onBusy,
}: {
  draft: SavedDraft;
  images: DraftImages;
  onChange: (images: DraftImages) => void;
  onBusy: (busy: boolean) => void;
}) {
  const base = `/api/center-drafts/${draft.id}/branding`;
  const [allowed, setAllowed] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<BrandingKind | null>(null),
    [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void api<{ canManage: boolean }>(base, 'GET', undefined, abort.signal)
      .then((r) => {
        if (!abort.signal.aborted) setAllowed(r.canManage);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to check upload availability.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setChecking(false);
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, [base]);
  async function choose(kind: BrandingKind, file: File, input: HTMLInputElement) {
    setError('');
    setNotice('');
    if (file.size > IMAGE_MAX_BYTES) {
      setError('Use an image of at most 5 MB.');
      input.value = '';
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(kind);
    onBusy(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const types: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      };
      const response = await fetch(`${base}/uploads?kind=${kind}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': file.type || types[extension] || 'application/octet-stream',
          'X-Image-Extension': extension,
        },
        body: file,
        signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new RequestError(
          result.error?.message ?? 'Unable to upload image.',
          response.status,
          result.error?.code ?? 'UPLOAD_FAILED',
        );
      if (abort.signal.aborted) return;
      const old = images[kind];
      onChange({ ...images, [kind]: result as BrandingAsset });
      setNotice('Preview ready. Continue or Save draft to keep this image with the draft.');
      if (old && old.id !== draft.branding[kind]?.id)
        await api(old.url, 'DELETE').catch(() => undefined);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : 'Unable to upload image.');
      else setNotice('Upload canceled. Saved draft images are unchanged.');
    } finally {
      input.value = '';
      controller.current = null;
      setBusy(null);
      onBusy(false);
    }
  }
  function remove(kind: BrandingKind) {
    const old = images[kind];
    onChange({ ...images, [kind]: null });
    if (old && old.id !== draft.branding[kind]?.id)
      void api(old.url, 'DELETE').catch(() => undefined);
    setNotice('The image will be removed from the draft when you Continue or Save draft.');
  }
  return (
    <div className="draft-branding-fields">
      <p className="inline-notice">
        Your details are saved. These images are private to your draft. Continue or Save draft to
        keep your selections; unsaved previews expire after 24 hours.
      </p>
      {checking && <p role="status">Checking upload availability…</p>}
      {!checking && !allowed && (
        <p className="inline-notice">
          Image changes are disabled in this environment. Saved images remain available to view.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      )}
      <div className="branding-grid">
        {brandingKinds.map((kind) => (
          <div className="branding-card" key={kind}>
            <h4>{brandingLabels[kind]}</h4>
            {kind === 'watermark' && (
              <small>
                PNG only · exactly 1024 × 1024 pixels. Transparency is preserved. Stored for future
                use; QR generation is not enabled.
              </small>
            )}
            {images[kind] ? (
              <>
                <img
                  className={`branding-image branding-${kind}`}
                  src={images[kind]!.url}
                  alt={`Draft ${brandingLabels[kind].toLowerCase()}`}
                />
                <small>
                  {images[kind]!.id === draft.branding[kind]?.id
                    ? 'Saved with draft'
                    : 'Unsaved preview'}{' '}
                  · {images[kind]!.width} × {images[kind]!.height}
                </small>
                <button
                  type="button"
                  className="text-link"
                  disabled={!allowed || Boolean(busy)}
                  onClick={() => remove(kind)}
                >
                  Remove {brandingLabels[kind].toLowerCase()}
                </button>
              </>
            ) : (
              <div className="branding-placeholder">
                <ImagePlus size={26} />
                <span>No {brandingLabels[kind].toLowerCase()} selected</span>
              </div>
            )}
            <label className="branding-file">
              <span>
                <Upload size={15} />
                Choose draft {brandingLabels[kind].toLowerCase()}
              </span>
              <input
                aria-label={`Choose draft ${brandingLabels[kind].toLowerCase()}`}
                type="file"
                accept={
                  kind === 'watermark'
                    ? 'image/png,.png'
                    : 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
                }
                disabled={!allowed || Boolean(busy)}
                onChange={(e) => {
                  const input = e.currentTarget,
                    file = input.files?.[0];
                  if (file) void choose(kind, file, input);
                }}
              />
            </label>
          </div>
        ))}
      </div>
      <p className="field-hint">
        Logo/photo: JPEG, PNG or WebP · up to 5 MB, 16 megapixels and 8192 pixels per edge. Saved
        images fit within 1024 × 1024. Animated images are not supported. Existing iCare client
        files and URLs are unchanged.
      </p>
      {busy && (
        <p role="status">
          Validating {brandingLabels[busy].toLowerCase()}…{' '}
          <button className="text-link" type="button" onClick={() => controller.current?.abort()}>
            Cancel upload
          </button>
        </p>
      )}
    </div>
  );
}
