# Center input modes and private demo QR jobs

Delivered on 30 October 2026 under **Care centers → Center detail → Input mode & QR codes**. Live settings can be inspected. Mode editing, durable QR preparation, watermarked previews and private PNG downloads are working with fictional demo data. **Live QR generation is unavailable**, and live input-mode writes default off.

## Verified legacy contracts

`CentersData.getCenterInputType` reads `Center_Child_Input_Type` joined to catalog-local `Input_Type`, preferring a center override over center `-1`. Its error fallback of mode 1 is not evidence of an actual setting. `getInputTypes` lists enabled catalog choices. The new adapter reports missing/ambiguous references instead of inventing IDs or labels. Nursery/Lite use `icare`, School uses `icare_school`; the composite center reference remains mandatory.

Legacy `EditSummary.aspx.vb:35–45` updates the profile/input mode and, for mode **3**, enumerates children, calls `spGenerateChildQrCode` and writes an image. The audited procedure computes the existing deterministic MD5-derived value and conditionally inserts `QR_Code`/`Child_Inputs`, without actor checks or an encompassing transaction. It can return a derived value that is different from an existing stored association. This value is not a modern authorization token. `FileUtils.GenerateQrCode` in `App_Code/Utils.vb` uses QRCoder ECC Q, optional watermark, a QR-value-derived filename in the shared QR folder, and skips existing files unless overwrite is requested; errors are swallowed/logged.

The scanner/consumer and shared legacy folder/URL contract remain unverified. The portal therefore does not enumerate live children, invoke either QR procedure/function, read existing QR values, change QR associations or write legacy files. Private demo output is a new portal format, not a claim of scanner or file parity.

## Input-mode workflow

The separate settings panel shows the effective mode, inherited/override source and enabled choices. Users select a change, review before/after and explicitly confirm. Returning to a valid catalog default removes only the center override, never the global row. Missing/disabled/duplicate references or settings block writes. QR mode additionally requires all images in a current owned demo job to be ready. Preparing images never changes the current mode. Changing away from QR does not revoke QR values or external sessions.

Dedicated `centers.settings.read`, `centers.settings.write` and `centers.qr.manage` capabilities follow current owner/administrator composite scope. Page-only report/status/alert grants add none of these capabilities. Stored active account/membership is rechecked. Normal profile saves still do not change input mode. Draft creation and live provisioning remain unchanged.

`ICARE_INPUT_MODE_WRITES_ENABLED=true` is an independent live write gate; it defaults off and was **not enabled on dev**. The SQL adapter uses fixed catalog queries and a serializable transaction, locks current scope/settings/references, checks the revision and actual changed row count, and rereads the result. It never calls the old profile procedure or unavailable logger. QR mode remains hard-blocked live even if this switch is enabled. SQLite generations prevent portal ABA revisions; an unconfirmed receipt is written before SQL commit, confirmed after acknowledgement. A lost commit acknowledgement requires a reload, with no automatic retry. Receipts do not replace pending Logging. External writers that change and restore identical values are outside the local generation scheme.

## Durable demo jobs

Each job prepares exactly three synthetic subjects with private, stable `ICARE-DEMO:<UUID>` values. These values do not work with iCare scanners. DTOs contain progress, fictional labels and opaque image URLs; payloads and watermark bytes stay server-side. Job creation is owner/mode scoped and idempotent by request UUID plus payload fingerprint. Another actor, including an administrator, cannot read, advance, apply or download another actor's job. Current center scope is checked on every operation and image request.

One explicit POST prepares one image. The browser runs at most three sequential steps after **Prepare / resume images**. There is no detached worker: closing the page stops further requests, and reopening resumes saved progress. A durable local lease prevents overlapping preparation; expired leases can resume safely because rendering has no external writes. Failed images require explicit retry (three attempts); ready images remain unchanged. Mode/watermark revision changes require a new reviewed job. Cancellation removes image/snapshot bytes and prevents in-flight publication. Applying QR mode, job state, version and receipt is atomic in SQLite; a receipt failure rolls it all back.

Jobs expire after seven days, with cleanup on subsequent creation. Limits are three active jobs per actor/center, twenty creations per actor/mode per day, a 64 MiB global image bound (creation stops near 60 MiB), two concurrent processors and 256 KiB per output. Watermark snapshots also count toward the creation bound. This is single-host storage; multi-host/background production jobs need a shared durable worker/store and retention acceptance.

The server uses [node-qrcode](https://github.com/soldair/node-qrcode) 1.5.4 at ECC H, a four-module quiet zone and 768×768 PNG. A published watermark is snapshotted, reduced to 128×128 and centered. [jsQR](https://github.com/cozmo/jsQR) 1.4.0 decodes every completed image and verifies the exact expected demo value before publication. Metadata is omitted. Software decoding does not establish real-camera/scanner compatibility. Images require authenticated owned-job/current-center access, no-store/private caching, Cookie variation, nosniff, restrictive CSP and fixed filenames. No public QR URL or payload-derived filename is created.

## Routes and verification

- `GET/PATCH /api/centers/{type}/{id}/input-mode`: scoped state and reviewed revision-protected change.
- `POST …/input-mode/qr`: owned idempotent demo job creation.
- `GET/POST …/input-mode/qr/{job}`: progress and explicit advance/retry/cancel.
- `GET …/input-mode/qr/{job}/images/{image}`: private verified demo PNG.

Strict JSON schemas reject extra fields and caller-selected child/payload data. Reads reject query parameters; mutations require same Origin. No child/parent PII or credential columns are added to DTOs, receipts or workbook exports.

Eight new test groups cover inheritance/reference guards, scoped revisions/gates, independently decoded watermarked output, idempotency/ownership, interruptions/leases, failed-only retries, revocation/expiry/stale watermark, quotas and atomic apply/receipt rollback for all three center types. [Dev SQL acceptance](generated/input-mode-sql-checks.json) verifies override/inheritance, scope, stale and duplicate rejection using credentialless fixtures and temporary references in a transaction that always rolls back. Real input catalogs remain empty; no seeds were repaired. Positive SQL commit and live QR acceptance are still pending. HTTP and desktop/mobile evidence is recorded in [verification](06-verification.md).
