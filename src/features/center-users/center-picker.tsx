'use client';
import { useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, LoaderCircle, Search } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { centerTypeLabels, type CenterRef } from '@/domain/centers';
import { api } from '@/lib/client';
export type UserCenterOption = CenterRef & { name: string; domain?: string };
export function UserCenterPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (center: UserCenterOption) => void;
}) {
  const [search, setSearch] = useState(''),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{
      items: UserCenterOption[];
      total: number;
      pageSize: number;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<{ items: UserCenterOption[]; total: number; pageSize: number }>(
      `/api/center-users/centers?${new URLSearchParams({ q, page: String(page) })}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load centers.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, page, nonce]);
  return (
    <Dialog title="Choose a center" eyebrow="CENTER USERS" onClose={onClose}>
      <p className="user-help">Only centers you can manage are shown.</p>
      <label className="search-field user-picker-search">
        <Search size={17} />
        <span className="sr-only">Search centers for users</span>
        <input
          maxLength={100}
          value={search}
          placeholder="Search by center name, domain or ID"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {error ? (
        <div className="form-error" role="alert">
          {error}
          <button className="text-link" onClick={() => setNonce((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <p className="user-help" role="status">
          <LoaderCircle className="spin" size={18} />
          Loading centers…
        </p>
      ) : (
        <div className="user-picker-options">
          {data?.items.map((center) => (
            <button
              key={`${center.id}_${center.type}`}
              type="button"
              onClick={() => onSelect(center)}
              aria-label={`Choose ${center.name}`}
            >
              <span className="user-picker-icon">
                <Building2 size={20} />
              </span>
              <span>
                <strong>{center.name}</strong>
                <small>
                  {centerTypeLabels[center.type]} · #{center.id}
                  {center.domain ? ` · ${center.domain}` : ''}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
          {!data?.items.length && (
            <p className="user-help">No accessible centers match your search.</p>
          )}
        </div>
      )}
      {data && data.total > data.pageSize && (
        <div className="user-picker-pagination">
          <button
            className="icon-button"
            aria-label="Previous center results"
            disabled={loading || page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>Page {page}</span>
          <button
            className="icon-button"
            aria-label="Next center results"
            disabled={loading || page * data.pageSize >= data.total}
            onClick={() => setPage((n) => n + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </Dialog>
  );
}
