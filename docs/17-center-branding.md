# Center logo and main photo uploads

Delivered on 27 October 2026 under **Care centers → center details → Center branding**. The owner explicitly selected **private portal storage** instead of integration with the existing iCare photo folder. This increment provides one logo and one main center photo, matching the audited legacy screen; it is not a photo gallery. Draft branding, watermarks and QR generation remain pending.

## User flow and storage boundary

Selecting a file uploads a normalized, uploader-private preview. Current images remain unchanged until review and confirmation. Logo and photo can publish together in one transaction. Discard removes only unused previews. Reload recovers from a stale revision or an uncertain HTTP response without blindly resubmitting. A published logo also appears in the center-detail heading. Desktop and 390×844 mobile flows were verified with explicitly fictional image fixtures.

The images belong to the **new portal only**. No legacy `center_logo`/`center_photo` column, original photo file, external image URL, template tree or QR asset is changed. Existing legacy images are not imported or fetched. The UI explicitly identifies private portal images. Integrating older clients later requires the actual filesystem/public-URL contract and consumer acceptance.

Normalized bytes and metadata are stored in the existing private, server-local SQLite store, outside the web root. There are no request-selected filesystem paths, arbitrary URLs, original filenames or stored original images. Fixed asset routes serve PNG/JPEG bytes with authentication, `private, no-store`, `Vary: Cookie`, fixed inline filenames, nosniff and a restrictive content policy. The Next image optimizer is not used for these authenticated images. Mode-separated rows prevent demo access to live assets even if numeric references overlap.

## Validation and authorization

- Accept still JPEG, PNG and WebP only. Check magic bytes, declared MIME/extension, decoder metadata and complete decoding; SVG, GIF, animation, malformed/truncated files and mismatched types are rejected.
- Bound streamed bodies to 5 MiB even without Content-Length, with a ten-second body timeout. Allow two in-flight HTTP uploads and two decoder operations per process; enforce actor/global upload limits.
- Source limits are 16 Mi pixels and 8192 pixels per edge. Auto-orient, convert to sRGB and fit within 1024×1024 without enlargement. Preserve logo alpha in PNG; main photos become JPEG with a white alpha background. Sharp 0.35.5 re-encodes without source EXIF/GPS/other metadata. Do not remove decoder safety limits.
- `centers.branding.read/write` use current owner/admin composite center scope. Page 7/8/9 grants add no branding access. Every metadata, preview, publication, discard and image operation rechecks the current active account, center existence and scope. SQL holds read locks on account/ownership/center during the synchronous private-store operation; it performs no branding SQL mutation. Demo checks stored roles/ownership inside SQLite.
- Origin checks protect mutations; strict schemas reject actor/path/extra-field injection. Staged images are owned by the uploader and scoped to mode, center and kind, even when another administrator can view the center. Publishing rechecks all selected previews before changing anything, compares an opaque revision and updates both slots, asset lifecycle and the local operation receipt atomically. Receipt failure rolls back the whole publication.

## Retention and capacity

Unused previews expire after 24 hours. Replaced images are retained privately for seven days for operational recovery; the UI serves only current images and unexpired, owned previews. No replacement deletes the current asset before its successor is committed. Current slot generations preserve revision changes even across replacements.

Limits: four staged images per actor/mode, 64 MiB of normalized images per center/mode and 512 MiB across the store. New uploads purge expired unused assets for the current center and the uploader's expired previews. The maintenance tool below cleans other expired unreferenced images. Current images are always excluded. Expiry is logical; physical database/WAL/backups require normal private-storage retention and compaction procedures. Automatic scheduled maintenance, a restore UI, and central Logging are not supplied by this increment.

```sh
ICARE_STORAGE_PATH=/absolute/private/portal.sqlite node --conditions=react-server --import tsx scripts/prune-branding.ts
# After reviewing the dry-run summary, the server owner can run the same command with --apply.
```

Keep SQLite, WAL/SHM files and backups private and persistent. The existing single-host boundary still applies; multiple hosts require shared media/session storage before deployment. Capacity, backup restore and a restricted verified-TLS SQL identity need production acceptance. Local operation receipts are not the pending central Logging service.

## Enablement and acceptance

`ICARE_BRANDING_WRITES_ENABLED` is independent of profile/status/alert/transport switches and defaults off. The owner-approved private-storage feature is enabled in the local dev configuration after tests and disposable-fixture integration acceptance. This switch does not enable any legacy-client photo publication.

The development acceptance tool creates marked centers of all three types and credentialless ordinary/admin fixture dealers, uses a separate private SQLite file, and removes all SQL fixtures with marker guards. It verifies private previews, owner publication, administrator reads, stale saves, receipt rollback, inactive-account denial and revoked/forged ownership. Original center rows (including legacy image fields), accounts, mappings and timezone history have matching server-side fingerprints afterward. Identity sequences may advance; they are not reseeded. See [redacted SQL evidence](generated/branding-sql-checks.json).

Domain/security tests cover decode/re-encode, metadata removal, alpha conversion, animation rejection, byte/pixel/dimension limits, current/staged access, cross-center/type boundaries, strict schemas, atomic publication, stale revisions, retention, quotas and throttling. HTTP checks additionally verify anonymous/cross-origin denial, private cache headers, extra-field rejection and ownership-protected discard. Browser tests verified desktop publication and mobile replacement review/discard; the tests changed fictional demo images only.

Routes: `GET/PATCH /api/centers/{type}/{id}/branding`, `POST .../branding/uploads?kind=logo|photo` with a bounded binary body and `X-Image-Extension`, and `GET/DELETE .../branding/assets/{uuid}`. DELETE supports only owned unpublished previews. Watermarks, public asset delivery, legacy folder migration and user/account credential operations remain outside scope.
