'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import type { PortalActor } from '@/domain/access';
import { api } from '@/lib/client';

export function Shell({
  children,
  actor,
}: {
  children: React.ReactNode;
  actor: Pick<PortalActor, 'name' | 'mode' | 'isSuperAdmin'>;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sidebar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    sidebar.current?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab') return;
      const items = [
        ...(sidebar.current?.querySelectorAll<HTMLElement>('a,button:not(:disabled)') ?? []),
      ];
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      menu.current?.focus();
    };
  }, [open]);
  async function logout() {
    setBusy(true);
    try {
      await api('/api/auth/logout', 'POST');
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Unable to sign out. Please try again.');
      setBusy(false);
    }
  }
  const navigation = [
    { href: '/', label: 'Overview', Icon: LayoutDashboard },
    { href: '/centers', label: 'Care centers', Icon: Building2 },
    { href: '/users', label: 'Center users', Icon: UsersRound },
    ...(actor.isSuperAdmin ? [{ href: '/dealers', label: 'Dealers', Icon: UsersRound }] : []),
    { href: '/access', label: 'Access & sessions', Icon: ShieldCheck },
  ];
  const title = path.startsWith('/centers')
    ? 'Care centers'
    : path.startsWith('/users')
      ? 'Center users'
      : path.startsWith('/dealers')
        ? 'Dealers'
        : path === '/access'
          ? 'Access & sessions'
          : path === '/'
            ? 'Overview'
            : 'Coming next';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        ref={sidebar}
        className={`sidebar ${open ? 'is-open' : ''}`}
        aria-label="Portal navigation"
      >
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-symbol">
            <Heart size={23} fill="currentColor" />
          </span>
          <span>
            iCare<span className="brand-caption">ADMIN PORTAL</span>
          </span>
        </Link>
        <button
          className="icon-button sidebar-close"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav>
          {navigation.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`nav-item ${(href === '/' ? path === '/' : path.startsWith(href)) ? 'active' : ''}`}
              aria-current={
                (href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined
              }
            >
              <Icon size={19} />
              {label}
              {href === '/centers' && <ChevronRight size={15} className="nav-chevron" />}
            </Link>
          ))}
        </nav>
        <p className="nav-label next-label">COMING NEXT</p>
        <nav aria-label="Upcoming modules">
          {[
            { href: '/activity', label: 'Activity & reports' },
            { href: '/payments', label: 'Accounting' },
          ].map((item) => (
            <Link
              href={item.href}
              className="nav-item muted-nav"
              key={item.href}
              onClick={() => setOpen(false)}
            >
              <span className="small-ring" />
              {item.label}
              <span className="nav-pending">Pending</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="mini-icon">
            <Sparkles size={18} />
          </span>
          <h3>A little more clarity.</h3>
          <p>Everything you need to manage your centers, thoughtfully connected.</p>
          <Link href="/centers">
            Explore your centers <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-account">
          <span className="avatar">
            {actor.name
              .split(' ')
              .map((v) => v[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div>
            <strong>{actor.name}</strong>
            <span>{actor.isSuperAdmin ? 'Administrator' : 'Center operator'}</span>
          </div>
          <button className="icon-button" aria-label="Sign out" onClick={logout} disabled={busy}>
            <LogOut size={18} />
          </button>
        </div>
        {error && (
          <p role="alert" className="sidebar-error">
            {error}
          </p>
        )}
      </aside>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation overlay"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace" inert={open}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={menu}
              className="icon-button menu-button"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className={`environment-pill ${actor.mode === 'preview' ? 'demo' : ''}`}>
              <span />
              {actor.mode === 'preview' ? 'Demo workspace' : 'iCare workspace'}
            </span>
            <Link href="/access" className="help-link">
              <ShieldCheck size={17} />
              <span>Your access</span>
            </Link>
          </div>
        </header>
        {actor.mode === 'preview' && (
          <div className="preview-banner">
            <span className="preview-dot" />
            <span>Demo workspace · Fictional records, separate from live iCare data.</span>
            <Link href="/login?switch=1">
              Use an iCare account <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>iCare Admin Portal</span>
          <span>Made for a clearer day.</span>
        </footer>
      </div>
    </div>
  );
}
