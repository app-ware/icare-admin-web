'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LoaderCircle, FlaskConical } from 'lucide-react';
import { api } from '@/lib/client';
export function LoginForm({ configured, preview }: { configured: boolean; preview: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [role, setRole] = useState('admin');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function submit(demo = false) {
    setPending(demo ? 'demo' : 'login');
    setError('');
    try {
      await api(
        demo ? '/api/auth/preview' : '/api/auth/login',
        'POST',
        demo ? { role } : { username, password },
      );
      setPassword('');
      router.replace('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
      setPassword('');
      setPending('');
    }
  }
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="auth-form"
      >
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          required
          maxLength={450}
          placeholder="Your iCare username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={!ready || !!pending}
        />
        <label htmlFor="password">Password</label>
        <div className="password-input">
          <input
            id="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            required
            maxLength={450}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!ready || !!pending}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {!configured && (
          <p className="inline-notice">
            iCare sign-in needs a secure database connection configured by your administrator.
          </p>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button primary auth-submit"
          disabled={!ready || !!pending || !configured}
          type="submit"
        >
          {pending === 'login' ? <LoaderCircle className="spin" size={18} /> : 'Sign in'}
          <ArrowRight size={17} />
        </button>
        <p className="session-hint">Automatic sign-out after 30 minutes of inactivity.</p>
      </form>
      {preview && (
        <div className="demo-entry">
          <div className="demo-entry-title">
            <FlaskConical size={17} />
            <strong>Take a look around</strong>
            <span className="badge blue">Demo</span>
          </div>
          <p>Explore the new experience with fictional centers.</p>
          <label className="sr-only" htmlFor="demo-role">
            Demo role
          </label>
          <select
            id="demo-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={!!pending}
          >
            <option value="admin">Administrator · all demo centers</option>
            <option value="dealer">Center operator · assigned centers</option>
          </select>
          <button
            type="button"
            className="button secondary"
            disabled={!ready || !!pending}
            onClick={() => void submit(true)}
          >
            {pending === 'demo' ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              'Explore demo workspace'
            )}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}
