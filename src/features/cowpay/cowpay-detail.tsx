'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { centerTypeLabels, type CenterRef } from '@/domain/centers';
import type { CowpayDetail } from '@/domain/cowpay';
import { api } from '@/lib/client';
import { Enablement, setupLabels } from './cowpay-workspace';

const presence = (value: boolean | null) =>
  value === null ? 'Needs review' : value ? 'Stored' : 'Missing';
export function CowpayCenterReview({ center }: { center: CenterRef }) {
  const base = `/api/integrations/cowpay/${center.type}/${center.id}`;
  const [data, setData] = useState<CowpayDetail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setLoading(true);
    setError('');
    setCopied(false);
    void api<CowpayDetail>(base, 'GET', undefined, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load CowPay setup.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [base, retry]);
  async function copyCallback() {
    if (!data?.callback.url) return;
    try {
      await navigator.clipboard.writeText(data.callback.url);
      setCopied(true);
    } catch {
      setError('Unable to copy the callback address. Select the address to copy it manually.');
    }
  }
  return (
    <>
      <Link href="/integrations" className="text-link back-link">
        <ArrowLeft size={15} />
        All CowPay centers
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COWPAY SETUP REVIEW</span>
          <h1>{data?.center.name ?? 'Center gateway setup'}</h1>
          <p>
            {centerTypeLabels[center.type]} · Center #{center.id}
          </p>
        </div>
        <span className="badge blue">
          <ShieldCheck size={14} />
          Read-only
        </span>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="text-link" onClick={() => setRetry((n) => n + 1)}>
            Reload setup
          </button>
        </div>
      )}
      {loading && <p role="status">Loading stored configuration…</p>}
      {data && (
        <>
          <p className="inline-notice">
            {data.mode === 'preview' ? 'Fictional demo setup. ' : ''}Credential presence shows
            stored fields only. The portal has not contacted CowPay or verified payment processing.
          </p>
          <div className="cowpay-review-grid">
            <section className="panel cowpay-review-panel" aria-labelledby="cowpay-config-heading">
              <div className="panel-heading">
                <div>
                  <h2 id="cowpay-config-heading">Stored configuration</h2>
                  <p>{setupLabels[data.setup]}</p>
                </div>
                <CreditCard size={22} />
              </div>
              <dl className="cowpay-environment-list">
                <div>
                  <dt>Settings record</dt>
                  <dd>
                    {data.configured === null
                      ? 'Needs review'
                      : data.configured
                        ? 'Present'
                        : 'Not stored'}
                  </dd>
                </div>
                <div>
                  <dt>Stored enablement</dt>
                  <dd>
                    <Enablement value={data.storedEnabled} />
                  </dd>
                </div>
                <div>
                  <dt>Last recorded update (UTC)</dt>
                  <dd>
                    {data.updatedAt
                      ? new Date(data.updatedAt).toLocaleString('en-GB', { timeZone: 'UTC' })
                      : 'Not available'}
                  </dd>
                </div>
              </dl>
              <p className="field-hint">
                The enablement flag is shared by the legacy integration. It does not identify an
                active live or staging environment, and it is separate from center activation.
              </p>
              {data.issues.map((issue) => (
                <p key={issue} className="inline-notice">
                  {issue}
                </p>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={loading}
                onClick={() => setRetry((n) => n + 1)}
              >
                <RefreshCw size={16} />
                Refresh setup
              </button>
            </section>
            <section className="panel cowpay-review-panel" aria-labelledby="cowpay-fields-heading">
              <h2 id="cowpay-fields-heading">Credential presence</h2>
              <p className="field-hint">
                Values, partial masks and tokens are never returned to this page.
              </p>
              <dl className="cowpay-environment-list">
                {[
                  ['Merchant code', data.credentials.merchantCode],
                  ['Merchant hash key', data.credentials.merchantHash],
                  ['Live access token', data.credentials.liveToken],
                  ['Staging access token', data.credentials.stagingToken],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>{presence(value as boolean | null)}</dd>
                  </div>
                ))}
              </dl>
              <div className="cowpay-environment-cards">
                <div>
                  <h3>Live fields</h3>
                  <p>
                    {data.liveComplete ? 'Required fields stored' : 'Incomplete or needs review'}
                  </p>
                </div>
                <div>
                  <h3>Staging fields</h3>
                  <p>
                    {data.stagingComplete ? 'Required fields stored' : 'Incomplete or needs review'}
                  </p>
                </div>
              </div>
              <p className="field-hint">
                Both checks require merchant code and hash key; each checks its own token. Complete
                fields do not establish that a credential is valid.
              </p>
            </section>
          </div>
          <section className="panel cowpay-review-panel" aria-labelledby="cowpay-callback-heading">
            <h2 id="cowpay-callback-heading">Callback address</h2>
            {data.callback.state === 'reviewed' && data.callback.url ? (
              <>
                <p>
                  This address was marked reviewed in the portal configuration. Delivery and
                  provider registration still need external acceptance.
                </p>
                <code className="cowpay-callback-url">{data.callback.url}</code>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void copyCallback()}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied callback address' : 'Copy callback address'}
                </button>
              </>
            ) : (
              <p className="inline-notice">
                {data.callback.state === 'invalid'
                  ? 'The portal callback configuration needs review.'
                  : 'An owner-reviewed callback address has not been configured for this portal.'}{' '}
                The legacy database address is not copied automatically.
              </p>
            )}
            <p className="field-hint">
              Credential replacement, enablement changes and callback registration remain pending.
              This review does not change stored gateway settings.
            </p>
          </section>
        </>
      )}
    </>
  );
}
