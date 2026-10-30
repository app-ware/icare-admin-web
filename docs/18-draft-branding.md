# Logo and photo uploads in center creation

Delivered on 27 October 2026 under **Care centers → New center draft → Branding**. The five-step wizard now saves a private logo and main photo with an owned draft, resumes them after reload and displays them in the final review. It uses the private portal storage chosen for [center branding](17-center-branding.md). [Chapter 19](19-watermark-uploads.md) adds watermark uploads. QR generation, initial administrator creation and live provisioning remain pending.

## Workflow

Continue from Location saves the profile and allocates the owned draft before any upload. Choosing an image creates a normalized temporary preview. Continue from Branding or Save draft attaches the selected image IDs and profile in one revision-checked transaction. The UI distinguishes unsaved previews from saved attachments. Removing an image affects the saved draft only after saving; closing without saving keeps the prior attachments. Unsaved previews expire after 24 hours; saved draft images do not expire. Replaced images retain the existing seven-day private recovery period.

Uploads are optional. Old clients omitting the optional `branding` object preserve saved attachments; an explicit empty object clears them. Stale changes offer Reload saved draft. A reload also recovers from a lost save response. Upload cancellation leaves saved images unchanged; busy uploads block navigation and unsaved changes warn on closing or leaving. Each step starts at the top of the dialog on desktop and mobile.

Demo creation transfers saved image bytes into the created center's logo/photo slots with fresh asset UUIDs and a local receipt, together with the center, owner mapping and published draft marker. Any failure rolls back the whole operation. Retrying an already published draft returns the same center reference. Source draft media is removed only inside that successful transaction. Center image delivery then uses the existing composite center scope.

**Live creation still saves drafts only.** Publication returns `PROVISIONING_PENDING`; this feature does not repair reference seeds, create SQL centers/accounts or alter legacy images/folders/URLs. The existing independent `ICARE_BRANDING_WRITES_ENABLED` switch gates live draft image changes as well as center branding, including deletion of a draft that contains images. Disabling it leaves saved image reads and profile-only draft changes available.

## Authorization and storage

Every operation requires a verified session, `centers.create`, a currently active account and the draft's exact owner, mode and UUID. An administrator cannot inspect another dealer's private draft or preview. Existing-center assignments do not grant draft access. Live operations hold a read lock on the active SQL dealer while the private SQLite action runs; preview operations recheck the stored demo dealer within the transaction. No credential columns or logger-dependent procedures are used.

The private `draft_images` table contains normalized bytes, metadata and lifecycle state. Requests cannot supply storage paths, original filenames, URLs, actor IDs or database names. Reads serve only currently attached saved images or unexpired owned previews. Published drafts reject draft-media operations. Draft deletion requires its current revision and deletes its own image rows atomically. A stale deletion cannot remove a newer attachment.

Image validation and serving use chapter 17's limits: bounded 5 MiB binary bodies, MIME/extension/magic/complete decoding checks, still JPEG/PNG/WebP, 16 Mi pixels, 8192-pixel edges, normalization within 1024×1024 and metadata removal. Quotas and actor/global throttles are shared across center and draft uploads: four staged images per actor/mode and 512 MiB across both tables; each draft also has a 64 MiB bound. Authenticated asset responses use no-store, `Vary: Cookie`, fixed filenames, nosniff and restrictive CSP. Images never use the public Next image optimizer.

`scripts/prune-branding.ts` now includes expired unreferenced draft previews and retired images. Dry-run remains the default; saved/current attachments are excluded. SQLite, WAL and backups must remain private and persistent. Multi-host deployment still requires shared storage and production backup/restore acceptance.

## API

- `POST /api/center-drafts`, `GET/PATCH /api/center-drafts/{uuid}`: strict profile/image-ID payloads; saved draft DTOs include safe metadata and authenticated image URLs.
- `DELETE /api/center-drafts/{uuid}`: Origin-protected JSON `{ "revision": <current positive integer> }`.
- `GET /api/center-drafts/{uuid}/branding`: current image metadata, revision and upload availability.
- `POST .../branding/uploads?kind=logo|photo`: bounded binary body, declared MIME and `X-Image-Extension`; returns an unattached private preview.
- `GET/DELETE .../branding/assets/{assetUuid}`: owned image bytes or deletion of an owned unsaved preview. Saved images can only be removed through a revision-checked draft save or deletion.
- `POST /api/center-drafts/{uuid}/publish`: demo-only atomic creation with attachments; live provisioning remains unavailable.

## Acceptance

Six new domain/security groups cover transactional profile/image saves, omission compatibility, replacement/removal, stale-save/delete denial, injected rollback, owner/admin/mode/draft/kind isolation, preview expiry, saved retention, deletion, inactive accounts, all three demo center types, publication rollback, idempotency and shared center/draft quotas. Existing branding decoding, limits and scope tests remain in the suite.

The disposable SQL acceptance script now verifies private draft uploads/save/resume for Nursery, Lite and School, administrator isolation, the separate write gate, inactive-account denial and live provisioning denial. It uses a separate private SQLite file and marker-guarded credentialless SQL fixtures. Existing centers, legacy image fields, accounts, mappings and timezone history retained matching fingerprints; fixtures were removed. See [redacted acceptance evidence](generated/branding-sql-checks.json).

HTTP acceptance verifies anonymous/cross-origin denial, strict payload/query schemas, other-actor and cross-draft denial, save/resume, authenticated image headers, stale saves/deletions and saved-image discard protection. Desktop/mobile browser checks use fictional demo fixtures only and verify both uploads, save/reload/resume, image review, no mobile horizontal overflow and transfer into the created demo center.
