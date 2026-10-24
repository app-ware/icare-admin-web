'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Save } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { centerTypeLabels, type CenterRef } from '@/domain/centers';
import {
  draftSchema,
  emptyProfile,
  type CenterDraftData,
  type SavedDraft,
} from '@/domain/management';
import { api } from '@/lib/client';
import { ProfileFields, readProfileForm } from './profile-fields';
const steps = ['The basics', 'Contact details', 'Location', 'Review'];
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
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CenterDraftData>(
    draft?.data ?? { type: 1, domain: '', profile: { ...emptyProfile } },
  );
  const [saved, setSaved] = useState(draft);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function close() {
    if (!pending && (!dirty || window.confirm('Close without saving your latest changes?')))
      onClose();
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const intent = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    try {
      const values = new FormData(e.currentTarget);
      const next = draftSchema.parse({
        ...data,
        type: values.has('type') ? Number(values.get('type')) : data.type,
        domain: values.has('domain') ? String(values.get('domain')) : data.domain,
        profile: readProfileForm(values, data.profile),
      });
      setData(next);
      if (intent === 'back') {
        setStep(step - 1);
        return;
      }
      if (intent === 'next') {
        setStep(step + 1);
        return;
      }
      setPending(true);
      const updated = await api<SavedDraft>(
        saved ? `/api/center-drafts/${saved.id}` : '/api/center-drafts',
        saved ? 'PATCH' : 'POST',
        saved ? { revision: saved.revision, data: next } : next,
      );
      setSaved(updated);
      setDirty(false);
      if (intent === 'publish') {
        const ref = await api<CenterRef>(`/api/center-drafts/${updated.id}/publish`, 'POST', {
          revision: updated.revision,
        });
        router.push(`/centers/${ref.type}/${ref.id}`);
      } else {
        onSaved();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this draft.');
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
      <form onSubmit={submit} onChange={() => setDirty(true)}>
        <fieldset key={step} disabled={pending}>
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
              <div className="location-illustration" aria-hidden="true">
                <span>+</span>
                <i />
                <b>Center location</b>
              </div>
              <ProfileFields profile={data.profile} part="location" />
            </>
          )}
          {step === 3 && (
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
              <p className="inline-notice">
                {mode === 'preview'
                  ? 'You can save this draft or add the fictional center to the demo directory.'
                  : 'This saves a draft. Live provisioning, branding and administrator setup will be enabled in a later phase.'}
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="wizard-actions">
          {step > 0 && (
            <button type="submit" value="back" className="button ghost" disabled={pending}>
              <ArrowLeft size={15} />
              Back
            </button>
          )}
          <button type="submit" value="save" className="button secondary" disabled={pending}>
            <Save size={15} />
            Save draft
          </button>
          <button
            type="submit"
            value={step < 3 ? 'next' : mode === 'preview' ? 'publish' : 'save'}
            className="button primary"
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle size={16} className="spin" />
            ) : step < 3 ? (
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
