import 'server-only';

export const previewEnabled = () =>
  process.env.NODE_ENV === 'development' || process.env.ICARE_PREVIEW_ENABLED === 'true';
export const liveDataEnabled = () => process.env.ICARE_LIVE_DATA_ENABLED === 'true';
export function developmentSqlCompatibilityEnabled(env = process.env): boolean {
  if (env.NODE_ENV !== 'development' || env.ICARE_DEV_SQL_COMPATIBILITY !== 'true') return false;
  try {
    const origin = new URL(env.ICARE_APP_ORIGIN ?? '');
    return (
      ['http:', 'https:'].includes(origin.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
      !origin.username &&
      !origin.password &&
      Boolean(env.ICARE_DEV_SQL_SERVER)
    );
  } catch {
    return false;
  }
}
export const legacyConfigured = () =>
  liveDataEnabled() &&
  Boolean(
    process.env.ICARE_SQL_SECURE ||
    (developmentSqlCompatibilityEnabled() && process.env.ICARE_SQL_SECURE_FILE),
  );
export const centerWritesEnabled = () =>
  legacyConfigured() && process.env.ICARE_CENTER_WRITES_ENABLED === 'true';
export const dealerWritesEnabled = () =>
  legacyConfigured() && process.env.ICARE_DEALER_WRITES_ENABLED === 'true';
export const centerUserWritesEnabled = () =>
  legacyConfigured() && process.env.ICARE_CENTER_USER_WRITES_ENABLED === 'true';
export const statusWritesEnabled = () =>
  legacyConfigured() && process.env.ICARE_STATUS_WRITES_ENABLED === 'true';

export const alertWritesEnabled = () =>
  legacyConfigured() && process.env.ICARE_ALERT_WRITES_ENABLED === 'true';

export const transportWritesEnabled = () =>
  legacyConfigured() && process.env.ICARE_TRANSPORT_WRITES_ENABLED === 'true';

export const brandingWritesEnabled = () =>
  legacyConfigured() && process.env.ICARE_BRANDING_WRITES_ENABLED === 'true';
