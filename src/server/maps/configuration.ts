import 'server-only';
import type { MapConfiguration } from '@/domain/location-picker';
import { PortalError } from '@/server/http';

export function mapConfiguration(
  env: Record<string, string | undefined> = process.env,
): MapConfiguration {
  const provider =
    env.ICARE_MAP_PROVIDER ?? (env.NODE_ENV === 'development' ? 'openstreetmap' : 'disabled');
  if (provider === 'disabled') return { enabled: false };
  if (provider === 'openstreetmap')
    return {
      enabled: true,
      providerName: 'OpenStreetMap',
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attributionText: '© OpenStreetMap contributors',
      attributionUrl: 'https://www.openstreetmap.org/copyright',
      maxZoom: 19,
    };
  if (provider === 'custom') {
    const tileUrl = env.ICARE_MAP_TILE_URL ?? '',
      attributionUrl = env.ICARE_MAP_ATTRIBUTION_URL ?? '';
    try {
      const url = new URL(
        tileUrl.replaceAll('{z}', '0').replaceAll('{x}', '0').replaceAll('{y}', '0'),
      );
      const credit = new URL(attributionUrl);
      const maxZoom = Number(env.ICARE_MAP_MAX_ZOOM ?? 19);
      const providerName = (env.ICARE_MAP_PROVIDER_NAME ?? '').trim();
      const attributionText = (env.ICARE_MAP_ATTRIBUTION_TEXT ?? '').trim();
      if (
        !['{z}', '{x}', '{y}'].every((token) => tileUrl.includes(token)) ||
        /\{(?![zxy]\})|[\r\n]/.test(tileUrl) ||
        [url, credit].some(
          (v) => v.protocol !== 'https:' || v.username || v.password || v.hash || v.search,
        ) ||
        !providerName ||
        providerName.length > 80 ||
        !attributionText ||
        attributionText.length > 240 ||
        !Number.isInteger(maxZoom) ||
        maxZoom < 2 ||
        maxZoom > 20
      )
        throw new Error();
      return { enabled: true, providerName, tileUrl, attributionText, attributionUrl, maxZoom };
    } catch {}
  }
  throw new PortalError(
    503,
    'MAP_NOT_CONFIGURED',
    'Interactive maps are not configured. You can still enter coordinates manually.',
  );
}
