import { redirect } from 'next/navigation';
import { Heart, ShieldCheck, Building2, ArrowUpRight } from 'lucide-react';
import { getCurrentPrincipal } from '@/server/auth/session';
import { legacyConfigured, previewEnabled } from '@/server/runtime';
import { LoginForm } from '@/features/auth/login-form';
export const metadata = { title: 'Sign in' };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  const actor = await getCurrentPrincipal();
  if (actor && (await searchParams).switch !== '1') redirect('/');
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-symbol">
            <Heart size={23} fill="currentColor" />
          </span>
          <span>
            iCare<span className="brand-caption">ADMIN PORTAL</span>
          </span>
        </div>
        <div className="login-story-content">
          <span className="eyebrow">A FRESH PERSPECTIVE</span>
          <h1>
            A clearer space
            <br />
            to care.
          </h1>
          <p>
            Your centers, your people, your day.
            <br />
            Together in one thoughtful workspace.
          </p>
          <div className="login-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-center">
              <Building2 size={65} strokeWidth={1} />
              <span>Connected care</span>
            </div>
            <div className="art-card card-top">
              <span className="mini-icon">
                <ShieldCheck size={20} />
              </span>
              <span>
                Secure by design<small>Access that stays in scope</small>
              </span>
            </div>
            <div className="art-card card-bottom">
              <span className="art-check">✓</span>
              <span>
                A little more organized<small>Every center. One place.</small>
              </span>
              <ArrowUpRight size={17} />
            </div>
            <span className="art-star">✦</span>
          </div>
        </div>
        <div className="login-story-footer">
          iCare administration <span>Clarity in every detail.</span>
        </div>
      </section>
      <section className="login-form-section">
        <div className="login-form-wrap">
          <span className="auth-icon">
            <ShieldCheck size={25} />
          </span>
          <h2>Welcome back</h2>
          <p className="login-intro">Sign in with your iCare dealer account.</p>
          <LoginForm configured={legacyConfigured()} preview={previewEnabled()} />
          <p className="auth-footnote">
            <ShieldCheck size={14} />
            Your access follows your assigned centers.
          </p>
        </div>
      </section>
    </main>
  );
}
