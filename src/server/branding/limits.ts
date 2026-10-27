import 'server-only';
import type { PortalActor } from '@/domain/access';
import { getStore } from '@/server/store';
import { PortalError } from '@/server/http';
export function consumeBrandingUploadLimit(actor: PortalActor) {
  const store = getStore();
  if (
    !store.consumeLimit(`branding:${actor.mode}:${actor.dealerId}`, 20, 60 * 60_000) ||
    !store.consumeLimit('branding:global', 60, 60_000)
  )
    throw new PortalError(429, 'UPLOAD_RATE_LIMIT', 'Too many image uploads. Try again later.');
}
export function purgeExpiredBrandingPreviews(actor: PortalActor) {
  const store = getStore(),
    now = Date.now();
  store.db
    .prepare(
      "DELETE FROM branding_assets WHERE mode=? AND actor_id=? AND state='staged' AND expires_at<=? AND NOT EXISTS(SELECT 1 FROM branding_slots s WHERE s.asset_id=branding_assets.id)",
    )
    .run(actor.mode, actor.dealerId, now);
  store.db
    .prepare(
      "DELETE FROM draft_images WHERE mode=? AND dealer_id=? AND state='staged' AND expires_at<=? AND NOT EXISTS(SELECT 1 FROM drafts d WHERE d.id=draft_images.draft_id AND d.mode=draft_images.mode AND d.dealer_id=draft_images.dealer_id AND (json_extract(d.data,'$.branding.logo')=draft_images.id OR json_extract(d.data,'$.branding.photo')=draft_images.id))",
    )
    .run(actor.mode, actor.dealerId, now);
}
