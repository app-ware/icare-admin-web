# Private watermark uploads

Delivered on 30 October 2026 in **Care centers → Center branding** and **New center draft → Branding**. One optional watermark joins the logo and main photo, using the owner-approved private portal storage from chapters [17](17-center-branding.md) and [18](18-draft-branding.md).

## Format and user flow

Watermarks must be still PNG files at **exactly 1024 × 1024 pixels**. Both dimensions are checked independently, correcting the audited legacy AND-condition defect. The extension, MIME, magic bytes, decoder format, page count and full decode must agree. The existing 5 MiB upload limit, timeout and shared upload/decode concurrency limits remain. PNG output preserves alpha, converts to sRGB and strips source metadata. There is no stretching, padding or accepting another format under a PNG filename. A checkerboard makes transparency visible in previews, current images and draft review.

Center uploads create an uploader-private preview; the current watermark remains until Review and Confirm. Replacement and removal use the same revision and SQLite transaction as logo/photo changes, lifecycle transitions and the operation receipt. Remove watermark stages a removal for review; Discard unsaved changes cancels it. A failed or uncertain save requires reloading current images before another reviewed submission. Removing a watermark preserves the logo and photo.

Draft uploads attach with the profile revision on Continue or Save draft. Saved watermarks resume after reload and have no preview expiry; unsaved previews expire after 24 hours. Removing one is saved explicitly as `branding.watermark: null`. Older clients omitting the watermark field preserve an existing watermark, including when their two-image `branding` object is empty. The old logo/photo clearing behavior is unchanged. Demo publication transfers the saved watermark to a fresh center asset UUID atomically with the center and receipt. Failure rolls everything back; retry returns the already created center.

**This stores a private portal watermark only.** It does not overlay photos, generate QR codes, modify existing QR images, read child records or update legacy image columns/folders/URLs. Live center provisioning and initial administrator creation remain pending. The UI states these limits next to the watermark control.

## Security, retention and compatibility

- Center metadata, image reads, staging, publication, removal and discard retain current active owner/admin composite center scope. Page-only grants add no access. An administrator cannot read another uploader's staged image.
- Drafts remain private to their active owner, UUID and mode even for administrators. Watermark IDs cannot cross drafts, modes, centers, center types or image kinds. Session/capability checks and the current-account transaction guards are unchanged.
- `ICARE_BRANDING_WRITES_ENABLED` independently gates live image changes and removal. No other write switch or SQL permission is expanded. Demo storage remains separate from live assets.
- The four-preview actor/mode quota, 64 MiB center/draft bound, shared 512 MiB store bound, upload throttles, seven-day retired retention and current-image-safe cleanup include watermarks. Saved draft watermarks are excluded from expiry cleanup.
- Center removal keeps an internal empty asset reference with an incremented slot generation. Metadata uses a left join and includes that generation in the opaque revision, so add/remove cannot restore an old revision. Empty references never produce image URLs or image responses. There is no SQLite schema migration or public tombstone API.
- Older center PATCH requests omitting `watermark` preserve it. Only `watermark` accepts explicit null for removal; logo/photo replacement contracts remain unchanged. All selected slots validate before any mutation. Receipt failure rolls back removals and replacements together.
- Watermark GETs use fixed `watermark.png` / `draft-watermark.png` filenames and the existing authenticated no-store, Cookie variation, nosniff and restrictive CSP headers. Source filenames and original bytes are not stored.

Private persistent SQLite storage retains the existing single-host and backup/restore requirements. Local receipts do not replace pending central Logging.

## API additions

Existing center and draft upload endpoints accept `kind=watermark`. They return a normalized PNG preview with the existing safe asset DTO. Center and draft metadata add a nullable `watermark` slot.

`PATCH /api/centers/{type}/{id}/branding` accepts optional `watermark: <owned preview UUID>` to publish or `watermark: null` to remove, alongside the current opaque revision. Draft PATCH accepts optional nullable `data.branding.watermark` alongside the current positive integer draft revision. Image reads/discard use existing asset endpoints; saved draft media cannot be discarded as a temporary preview.

## Acceptance

Four new domain/security groups cover exact horizontal/vertical dimensions, PNG-only validation and forged MIME, transparency, metadata stripping, private previews, wrong-kind rejection, old-client preservation, transactional replacement/removal and injected receipt rollback, retained revisions after removal, draft ownership and revisions, and atomic demo transfer/retry across Nursery/Lite/School. Existing shared limits, expiry, active-account, scope and branding tests remain required.

The extended disposable SQL acceptance verifies all three image slots and watermark removal, administrator reads, uploader isolation, stale mutations and independent write gates for all three center types. It uses separate private SQLite storage and marked credentialless fixtures. Existing records and legacy image fields retain matching fingerprints after guarded fixture removal. See [redacted evidence](generated/branding-sql-checks.json).

HTTP acceptance checks the watermark filenames/private headers, PNG/dimension errors, anonymous/other-actor/Origin denial, strict query schemas, stale removal, draft save/resume, old-client preservation and explicit removal. Browser checks use fictional demo PNGs only. Build, privacy/access smoke and desktop/mobile results are recorded in [verification](06-verification.md).
