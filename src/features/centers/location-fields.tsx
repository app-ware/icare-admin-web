'use client';
import { useEffect, useId, useState } from 'react';
import type { Coordinates } from '@/domain/centers';
import {
  canShowOnMap,
  parseCoordinateFields,
  type CoordinateFields,
  type MapConfiguration,
} from '@/domain/location-picker';
import { api } from '@/lib/client';
import { LocationMap } from './location-map';

export function LocationFields({
  initial,
  onChange,
  disabled = false,
}: {
  initial: Coordinates | null;
  onChange?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [fields, setFields] = useState<CoordinateFields>({
    latitude: initial ? String(initial.latitude) : '',
    longitude: initial ? String(initial.longitude) : '',
  });
  const [config, setConfig] = useState<MapConfiguration | null>(null),
    [error, setError] = useState(''),
    [checking, setChecking] = useState(true),
    [retry, setRetry] = useState(0),
    [open, setOpen] = useState(false);
  const value = parseCoordinateFields(fields);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setError('');
    void api<MapConfiguration>('/api/maps/config', 'GET', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setConfig(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load map settings.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [retry]);
  function update(next: CoordinateFields) {
    setFields(next);
    onChange?.();
  }
  function choose(point: Coordinates) {
    update({ latitude: String(point.latitude), longitude: String(point.longitude) });
  }
  return (
    <div className="location-fields full-width">
      <div className="form-grid">
        {(['latitude', 'longitude'] as const).map((key) => (
          <div className="field" key={key}>
            <label htmlFor={`${id}-${key}`}>{key === 'latitude' ? 'Latitude' : 'Longitude'}</label>
            <input
              id={`${id}-${key}`}
              name={key}
              type="number"
              step="any"
              min={key === 'latitude' ? -90 : -180}
              max={key === 'latitude' ? 90 : 180}
              value={fields[key]}
              disabled={disabled}
              onChange={(e) => update({ ...fields, [key]: e.currentTarget.value })}
            />
          </div>
        ))}
      </div>
      <p className="field-hint">
        Use decimal coordinates. Leave both blank if a location is not available. Loading or moving
        the map does not save your changes.
      </p>
      <button
        type="button"
        className="text-link"
        disabled={disabled || (!fields.latitude && !fields.longitude)}
        onClick={() => update({ latitude: '', longitude: '' })}
      >
        Clear coordinates
      </button>
      {value && !canShowOnMap(value) && (
        <p className="inline-notice">
          This latitude is outside the map's polar coverage. Your coordinates are valid and will be
          kept; edit them manually.
        </p>
      )}
      {checking && (
        <p className="field-hint" role="status">
          Checking map availability…
        </p>
      )}
      {error && (
        <p className="inline-notice" role="status">
          {error} You can still enter coordinates.{' '}
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry map settings
          </button>
        </p>
      )}
      {config?.enabled === false && (
        <p className="field-hint">
          Interactive maps are disabled in this environment. Coordinate entry remains available.
        </p>
      )}
      {config?.enabled && (
        <div className="location-map-panel">
          <p className="field-hint">
            Loading the map shares the viewed area and your IP address with {config.providerName}.
            Center names, contacts and account details are not sent.{' '}
            <a href={config.attributionUrl} target="_blank" rel="noopener noreferrer">
              Map provider information ↗
            </a>
          </p>
          {open ? (
            <>
              <LocationMap value={value} config={config} onChoose={choose} disabled={disabled} />
              <button
                type="button"
                className="text-link"
                disabled={disabled}
                onClick={() => setOpen(false)}
              >
                Close map
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button secondary"
              disabled={disabled}
              onClick={() => setOpen(true)}
            >
              Load map
            </button>
          )}
        </div>
      )}
    </div>
  );
}
