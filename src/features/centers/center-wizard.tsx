'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Save } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { brandingKinds, brandingLabels } from '@/domain/branding';
import { centerTypeLabels, type CenterRef } from '@/domain/centers';
import {
  draftSchema,
  emptyProfile,
  type CenterDraftData,
  type SavedDraft,
} from '@/domain/management';
import { api, RequestError } from '@/lib/client';
import { ProfileFields, readProfileForm } from './profile-fields';
import { DraftBrandingFields, type DraftImages } from './draft-branding-fields';
const steps = ['The basics', 'Contact details', 'Location', 'Branding', 'Review'];
export function CenterWizard({
  draft,
  mode,
  onClose,
  onSaved,
}: {
  draft?: SavedDraft;
  mode: 'legacy' | 'preview';
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CenterDraftData>(
    draft?.data ?? { type: 1, domain: '', profile: { ...emptyProfile } },
  );
  const [saved, setSaved] = useState(draft);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false),
    [conflict, setConflict] = useState(false);
  const [images, setImages] = useState<DraftImages>(
    draft?.branding ?? { logo: null, photo: null, watermark: null },
  );
  useEffect(() => {
    formRef.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [step]);
  useEffect(() => {
    if (!dirty && !uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, uploading]);
  function close() {
    if (
      !pending &&
      !uploading &&
      (!dirty || window.confirm('Close without saving your latest changes?'))
    ) {
      void Promise.allSettled(
        brandingKinds
          .filter((k) => images[k] && images[k]?.id !== saved?.branding?.[k]?.id)
          .map((k) => api(images[k]!.url, 'DELETE')),
      );
      onClose();
    }
  }
  async function persist(next: CenterDraftData) {
    const updated = await api<SavedDraft>(
      saved ? `/api/center-drafts/${saved.id}` : '/api/center-drafts',
      saved ? 'PATCH' : 'POST',
      saved ? { revision: saved.revision, data: next } : next,
    );
    setSaved(updated);
    setData(updated.data);
    setImages(updated.branding);
    setDirty(false);
    onSaved();
    return updated;
  }
  async function reload() {
    if (!saved || (dirty && !window.confirm('Discard unsaved changes and reload the saved draft?')))
      return;
    setPending(true);
    try {
      const latest = await api<SavedDraft>(`/api/center-drafts/${saved.id}`);
      if (latest.published) {
        router.push(`/centers/${latest.published.type}/${latest.published.id}`);
        return;
      }
      void Promise.allSettled(
        brandingKinds
          .filter((k) => images[k] && images[k]?.id !== latest.branding[k]?.id)
          .map((k) => api(images[k]!.url, 'DELETE')),
      );
      setSaved(latest);
      setData(latest.data);
      setImages(latest.branding);
      setDirty(false);
      setConflict(false);
      setError('');
      setStep(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reload draft.');
    } finally {
      setPending(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || uploading || conflict) return;
    setError('');
    const intent = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    try {
      const values = new FormData(e.currentTarget);
      const next = draftSchema.parse({
        ...data,
        type: values.has('type') ? Number(values.get('type')) : data.type,
        domain: values.has('domain') ? String(values.get('domain')) : data.domain,
        profile: readProfileForm(values, data.profile),
        branding: {
          logo: images.logo?.id,
          photo: images.photo?.id,
          watermark: images.watermark?.id ?? null,
        },
      });
      setData(next);
      if (intent === 'back') {
        setStep(step - 1);
        return;
      }
      if (intent === 'next') {
        if (step === 2 || step === 3) {
          setPending(true);
          await persist(next);
        }
        setStep(step + 1);
        return;
      }
      setPending(true);
      const updated = await persist(next);
      if (intent === 'publish') {
        const ref = await api<CenterRef>(`/api/center-drafts/${updated.id}/publish`, 'POST', {
          revision: updated.revision,
        });
        router.push(`/centers/${ref.type}/${ref.id}`);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this draft.');
      setConflict(
        err instanceof RequestError && ['DRAFT_CONFLICT', 'DRAFT_PUBLISHED'].includes(err.code),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      title={draft ? 'Continue center draft' : 'A new place for care'}
      onClose={close}
      eyebrow="CENTER CREATION"
    >
      <p className="dialog-intro">Start with the details. Save your progress whenever you need.</p>
      <ol className="wizard-steps">
        {steps.map((label, i) => (
          <li
            className={i === step ? 'current' : i < step ? 'complete' : ''}
            key={label}
            aria-current={i === step ? 'step' : undefined}
          >
            <span>{i < step ? <Check size={14} /> : i + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
      <form
        ref={formRef}
        onSubmit={submit}
        onChange={(e) => {
          if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'file') setDirty(true);
        }}
      >
        <fieldset key={`${step}:${saved?.revision ?? 'new'}`} disabled={pending}>
          <h3 className="step-title">{steps[step]}</h3>
          {step === 0 && (
            <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="new-type">Center type</label>
                  <select id="new-type" name="type" defaultValue={data.type}>
                    <option value="1">Nursery</option>
                    <option value="4">School</option>
                    <option value="3">Lite</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="new-domain">
                    Domain{' '}
                    <span className="required" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id="new-domain"
                    name="domain"
                    defaultValue={data.domain}
                    required
                    minLength={2}
                    maxLength={50}
                    pattern="[A-Za-z0-9]{2,50}"
                    placeholder="e.g. littlecedar"
                  />
                  <small className="field-hint">2–50 letters or numbers.</small>
                </div>
              </div>
              <ProfileFields profile={data.profile} part="basics" />
            </>
          )}
          {step === 1 && <ProfileFields profile={data.profile} part="contact" />}
          {step === 2 && (
            <>
              <ProfileFields
                profile={data.profile}
                part="location"
                onLocationChange={() => setDirty(true)}
                disabled={pending}
              />
            </>
          )}
          {step === 3 &&
            (saved ? (
              <DraftBrandingFields
                draft={saved}
                images={images}
                onBusy={setUploading}
                onChange={(next) => {
                  setImages(next);
                  setDirty(true);
                }}
              />
            ) : (
              <p>Save your details before uploading images.</p>
            ))}
          {step === 4 && (
            <>
              <div className="draft-review">
                <span className="badge blue">{centerTypeLabels[data.type]}</span>
                <h3>{data.profile.name}</h3>
                <p>{data.domain}</p>
                <dl>
                  <div>
                    <dt>Manager</dt>
                    <dd>{data.profile.manager || 'Not added'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{data.profile.email || 'Not added'}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{data.profile.address || 'Not added'}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      {data.profile.location
                        ? `${data.profile.location.latitude}, ${data.profile.location.longitude}`
                        : 'Not added'}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="branding-grid draft-image-review">
                {brandingKinds.map((kind) => (
                  <div className="branding-card" key={kind}>
                    <h4>{brandingLabels[kind]}</h4>
                    {images[kind] ? (
                      <img
                        className={`branding-image branding-${kind}`}
                        src={images[kind]!.url}
                        alt={`Review draft ${brandingLabels[kind].toLowerCase()}`}
                      />
                    ) : (
                      <p>No image selected</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="inline-notice">
                {mode === 'preview'
                  ? 'You can save this draft or add the fictional center to the demo directory.'
                  : 'Your draft and private images are saved together. Live center provisioning and administrator setup remain pending.'}
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            {error}
            {conflict && (
              <button
                type="button"
                className="text-link"
                disabled={pending || uploading}
                onClick={() => void reload()}
              >
                Reload saved draft
              </button>
            )}
          </div>
        )}
        <div className="wizard-actions">
          {step > 0 && (
            <button
              type="submit"
              value="back"
              className="button ghost"
              disabled={pending || uploading || conflict}
            >
              <ArrowLeft size={15} />
              Back
            </button>
          )}
          <button
            type="submit"
            value="save"
            className="button secondary"
            disabled={pending || uploading || conflict}
          >
            <Save size={15} />
            Save draft
          </button>
          <button
            type="submit"
            value={step < 4 ? 'next' : mode === 'preview' ? 'publish' : 'save'}
            className="button primary"
            disabled={pending || uploading || conflict}
          >
            {pending ? (
              <LoaderCircle size={16} className="spin" />
            ) : step < 4 ? (
              'Continue'
            ) : mode === 'preview' ? (
              'Add to demo directory'
            ) : (
              'Save and close'
            )}
            {!pending && <ArrowRight size={15} />}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
