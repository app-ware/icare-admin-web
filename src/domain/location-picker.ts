import { coordinatesSchema, type Coordinates } from './centers';

export const MAP_LATITUDE_LIMIT = 85.0511287798;
export type CoordinateFields = { latitude: string; longitude: string };
export function parseCoordinateFields(fields: CoordinateFields): Coordinates | null {
  const latitude = fields.latitude.trim(),
    longitude = fields.longitude.trim();
  if (!latitude || !longitude) return null;
  const parsed = coordinatesSchema.safeParse({
    latitude: Number(latitude),
    longitude: Number(longitude),
  });
  return parsed.success ? parsed.data : null;
}
export function canShowOnMap(value: Coordinates | null): value is Coordinates {
  return Boolean(
    value &&
    coordinatesSchema.safeParse(value).success &&
    Math.abs(value.latitude) <= MAP_LATITUDE_LIMIT,
  );
}
export function coordinateFromMap(latitude: number, longitude: number): Coordinates | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > MAP_LATITUDE_LIMIT
  )
    return null;
  // Leaflet can report a neighbouring world copy when a marker crosses the date line.
  const wrapped =
    longitude >= -180 && longitude <= 180
      ? longitude
      : ((((longitude + 180) % 360) + 360) % 360) - 180;
  return coordinatesSchema.parse({
    latitude: Math.max(
      -MAP_LATITUDE_LIMIT,
      Math.min(MAP_LATITUDE_LIMIT, Number(latitude.toFixed(7))),
    ),
    longitude: Number(wrapped.toFixed(7)),
  });
}

export type MapConfiguration =
  | { enabled: false }
  | {
      enabled: true;
      providerName: string;
      tileUrl: string;
      attributionText: string;
      attributionUrl: string;
      maxZoom: number;
    };
