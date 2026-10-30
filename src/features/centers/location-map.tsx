'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates } from '@/domain/centers';
import {
  MAP_LATITUDE_LIMIT,
  canShowOnMap,
  coordinateFromMap,
  type MapConfiguration,
} from '@/domain/location-picker';

type Runtime = { map: Leaflet.Map; library: typeof Leaflet; marker: Leaflet.Marker | null };
export function LocationMap({
  value,
  config,
  onChoose,
  disabled,
}: {
  value: Coordinates | null;
  config: Extract<MapConfiguration, { enabled: true }>;
  onChoose: (point: Coordinates) => void;
  disabled: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null);
  const current = useRef({ value, disabled, onChoose });
  current.current = { value, disabled, onChoose };
  const [attempt, setAttempt] = useState(0),
    [phase, setPhase] = useState<'loading' | 'ready' | 'tiles-error' | 'failed'>('loading');
  function updateMarker(r: Runtime, point: Coordinates | null, blocked: boolean) {
    if (!canShowOnMap(point)) {
      r.marker?.remove();
      r.marker = null;
      return;
    }
    if (r.marker) r.marker.setLatLng([point.latitude, point.longitude]);
    else {
      const marker = r.library
        .marker([point.latitude, point.longitude], {
          icon: r.library.divIcon({
            className: 'location-pin',
            html: '<span></span>',
            iconSize: [26, 34],
            iconAnchor: [13, 30],
          }),
          draggable: !blocked,
          keyboard: true,
          title: 'Selected center location',
          autoPan: false,
        })
        .addTo(r.map);
      r.marker = marker;
      marker.on('dragend', () => {
        const position = marker.getLatLng(),
          next = coordinateFromMap(position.lat, position.lng);
        if (!current.current.disabled && next) current.current.onChoose(next);
        else updateMarker(r, current.current.value, current.current.disabled);
      });
      r.marker.getElement()?.setAttribute('aria-label', 'Selected center location');
    }
    if (blocked) r.marker.dragging?.disable();
    else r.marker.dragging?.enable();
  }
  useEffect(() => {
    let cancelled = false,
      resize: ResizeObserver | undefined;
    setPhase('loading');
    const timer = setTimeout(() => {
      if (!cancelled) setPhase(runtime.current ? 'tiles-error' : 'failed');
    }, 10000);
    void import('leaflet')
      .then((library) => {
        if (cancelled || !container.current) return;
        const point = current.current.value;
        const map = library.map(container.current, {
          scrollWheelZoom: false,
          attributionControl: false,
          minZoom: 2,
          maxZoom: config.maxZoom,
          worldCopyJump: true,
          maxBounds: [
            [-MAP_LATITUDE_LIMIT, -180],
            [MAP_LATITUDE_LIMIT, 180],
          ],
          maxBoundsViscosity: 1,
        });
        const r: Runtime = { map, library, marker: null };
        runtime.current = r;
        map.setView(
          canShowOnMap(point) ? [point.latitude, point.longitude] : [0, 0],
          canShowOnMap(point) ? 15 : 2,
          { animate: false },
        );
        const tiles = library.tileLayer(config.tileUrl, {
          maxZoom: config.maxZoom,
          keepBuffer: 0,
          updateWhenIdle: true,
          noWrap: true,
        });
        tiles.on('tileerror', () => {
          if (!cancelled) setPhase('tiles-error');
        });
        tiles.on('load', () => {
          clearTimeout(timer);
          if (!cancelled) setPhase((old) => (old === 'tiles-error' ? old : 'ready'));
        });
        tiles.addTo(map);
        map.on('click', (event: Leaflet.LeafletMouseEvent) => {
          const next = coordinateFromMap(event.latlng.lat, event.latlng.lng);
          if (!current.current.disabled && next) current.current.onChoose(next);
        });
        updateMarker(r, point, current.current.disabled);
        resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
        resize.observe(container.current);
        map.invalidateSize({ pan: false });
        if (current.current.disabled) {
          map.dragging.disable();
          map.keyboard.disable();
          map.touchZoom.disable();
          map.doubleClickZoom.disable();
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('failed');
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      resize?.disconnect();
      runtime.current?.map.remove();
      runtime.current = null;
    };
  }, [config, attempt]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    updateMarker(r, value, disabled);
    if (canShowOnMap(value)) r.map.panTo([value.latitude, value.longitude], { animate: false });
    for (const handler of [
      r.map.dragging,
      r.map.keyboard,
      r.map.touchZoom,
      r.map.doubleClickZoom,
    ]) {
      if (disabled) handler.disable();
      else handler.enable();
    }
  }, [value?.latitude, value?.longitude, disabled]);
  function useCenter() {
    const point = runtime.current?.map.getCenter();
    const next = point ? coordinateFromMap(point.lat, point.lng) : null;
    if (next && !disabled) onChoose(next);
  }
  return (
    <div className="location-map-view">
      <p className="field-hint">
        Click the map or drag the pin to choose a location. Keyboard: focus the map, use arrow keys
        to move and +/− to zoom, then choose Use map center.
      </p>
      {phase === 'loading' && (
        <p role="status" className="field-hint">
          Loading map…
        </p>
      )}
      {(phase === 'tiles-error' || phase === 'failed') && (
        <p className="inline-notice" role="status">
          The map could not fully load. Your coordinates are unchanged. You can enter them manually
          or{' '}
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry map
          </button>
          .
        </p>
      )}
      <div
        ref={container}
        className="location-map"
        role="region"
        aria-label="Center location map"
        aria-disabled={disabled}
        data-disabled={disabled}
        inert={disabled}
      />
      <div className="location-map-footer">
        <a href={config.attributionUrl} target="_blank" rel="noopener noreferrer">
          {config.attributionText}
        </a>
        <span>Map display: Leaflet</span>
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={disabled || phase === 'loading' || phase === 'failed'}
        onClick={useCenter}
      >
        Use map center
      </button>
    </div>
  );
}
