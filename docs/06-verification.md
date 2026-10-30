# Verification record

## Interactive location picker — 30 October 2026

[Chapter 20](20-location-picker.md) adds optional maps to center profile editing and creation drafts while preserving the existing server location contract.

- **58 domain/security tests pass**, including four new groups for blank/partial/invalid coordinates, zero and negative hemispheres, precision, polar coverage, world-copy longitude wrapping, legacy longitude-first order, disabled production defaults, safe custom configuration, scoped profile saves/revisions and owned draft persistence/publication.
- HTTP acceptance passes for anonymous map-configuration denial, no-store public provider metadata, rejected query injection, existing Origin/scope/revision/range guards, profile persistence, and temporary draft save/resume/clear. Separate API sessions were signed out, the fictional profile was restored and temporary API drafts were deleted. No live SQL mutation was required.
- Desktop browser checks verify zero external tile images before Load map, successful OpenStreetMap tile loading and visible attribution, map click/pin drag updating both fields, manual field synchronization, polar coordinates retaining their value, and save/reload persistence. Keyboard panning kept Save disabled; Use map center selected a point and enabled Save. The existing native Cancel warning required the owner's dismissal when the browser API timed out; a fresh read confirmed the unconfirmed point was not saved.
- At 390×844, the wizard map width was 290 px within a 356 px dialog and the page width remained 390 px. Selecting/clearing a pin worked. An explicit `0,0` selection survived Save draft, reload and resume; the resumed location step had no external tiles before another Load map choice. Browser edits used fictional demo centers/drafts only.
- Optimized production compilation and TypeScript pass. Build privacy passes for **55 traces** and standalone output, with no private store/env/legacy configuration inclusion. Production anonymous-access smoke includes `/api/maps/config` and passes; demo entry remains disabled. npm installation reported zero known vulnerabilities for the resulting 310-package tree at implementation time.

OpenStreetMap availability, production provider/privacy/capacity acceptance, real-device Safari and full accessibility conformance remain outside these local browser checks. Map failure notices/retry preserve manual entry; external maps default off in production.

## Private watermark uploads — 30 October 2026

[Chapter 19](19-watermark-uploads.md) adds optional PNG watermarks to center branding and creation drafts.

- **54 domain/security tests pass**, including four new watermark groups covering exact independent dimensions, PNG/forged-format rejection, alpha preservation, metadata stripping, private ownership, image-kind isolation, old-client preservation, stale mutations, atomic replacement/removal rollback, retained revisions after removal and demo transfer/retry for all three center types.
- Disposable dev SQL acceptance passes for all three image slots, watermark publication/removal, current owner/admin checks, private previews, write gates, inactive/revoked access and draft isolation across Nursery/Lite/School. Profile-only drafts remain writable with an empty watermark while image writes are disabled. Fixture identities have a bounded five-minute lifetime for the expanded checks. Marked SQL fixtures were removed; original records and legacy image fields retained matching fingerprints. [Redacted evidence](generated/branding-sql-checks.json).
- HTTP checks pass for watermark filenames/private cache headers, dimension errors, anonymous/other-actor/cross-origin denial, strict query payloads, stale removal, draft save/resume, omitted-field compatibility, saved-image discard denial and explicit-null removal. Temporary API drafts and separate demo sessions were removed afterward.
- Desktop browser checks pass for invalid dimensions, transparent previews, reviewed publication and unchanged logo/photo slots. At 390×844, cancellation preserved the current watermark, confirmed removal cleared it, and draft save/reload/resume retained a decoded 1024×1024 watermark. A fictional School center created through the wizard received its saved watermark. Mobile page width was 390 px and dialog width 356 px. No real center/account was created or real center image changed during browser checks.
- Production compilation and TypeScript pass. Build privacy passes across **54 traces** and standalone output; production access smoke passes with anonymous APIs denied and demo entry disabled. No private environment, SQLite or legacy connection file was included in build output.

Watermarks are stored in private portal media only. QR generation, overlays, child-record processing, legacy file/URL integration, live center provisioning and central Logging remain pending.

## Creation-wizard branding — 27 October 2026

[Chapter 18](18-draft-branding.md) adds logo/main-photo uploads to owned center drafts using the previously chosen private portal storage.

- **50 domain/security tests pass**, including six new draft groups for atomic profile/image saves, stale revisions, owner/admin/mode/draft/kind isolation, expiry and saved retention, deletion, inactive accounts, all three demo center types, publication rollback/idempotency and shared upload quotas.
- Disposable dev SQL acceptance passes for Nursery/Lite/School draft upload/save/resume, administrator isolation, inactive-account denial, the independent write switch (including image-bearing draft deletion) and live provisioning denial. Original rows and legacy image fields retained matching fingerprints; marked fixtures were removed. [Redacted evidence](generated/branding-sql-checks.json).
- HTTP acceptance passes for anonymous/cross-origin denial, strict payload/query schemas, cross-actor/draft denial, authenticated image headers, save/resume, stale saves/deletions and saved-image discard protection. Separate demo API sessions and their temporary drafts were removed afterward.
- Desktop and 390×844 mobile browser checks verify both image uploads, save/reload/resume, review, no horizontal overflow and successful transfer into a fictional demo center. Both resulting center images decoded successfully. Step navigation now resets the dialog scroll position. Browser checks used fictional demo images only; no real SQL center was created.
- The optimized production build and TypeScript checks pass. Privacy scanning covers **54 traces** plus standalone files with no private SQLite/env/legacy configuration inclusion. Production access smoke includes the new draft metadata/image routes: anonymous requests deny access and production demo entry stays disabled.

Live center creation, initial administrator creation, QR/watermarks, legacy image consumer integration and production/shared-storage acceptance remain pending. No credential or legacy image/folder changes were made.

## Activity and reports — 24 October 2026

The owner requested activity/report workflows while keeping user creation, password resets, Accounting and Logging pending. [Chapter 12](12-activity-and-reports.md) records the exact counting policy, read scopes, aggregate exports and limits.

- **30 unit/domain/security tests** pass. New cases cover exclusive dates, five/thirteen-day buckets, zero/unresolved activity, restores/conflicts, current demo totals, membership deduplication, formula-safe XLSX cells and stored report-grant revalidation.
- **16 desktop/mobile browser cases** pass across the final suite and targeted reruns. New flows verify report-only access without profile/user access, period reload state, stale-response protection, recovery from metadata/history errors, multi-center XLSX downloads, per-account history, Origin/payload/batch denial and School academic years. Tests use the School combobox's accessible name and scope error assertions to application banners, excluding Next's empty route announcer.
- Live reads passed across all five available Nursery centers, including empty results and a center with 2,001 eligible records. An absent actor with forged grants was denied. Both operational query variants passed system-compiler metadata checks; no School/Lite positive live fixture is available. [Sanitized evidence](generated/activity-sql-checks.json).
- `icare.test` signed in through the real browser, loaded live class activity and downloaded a three-sheet workbook whose counts matched the API. No operational SQL records were changed. The only new persistent application metadata was its private generation receipt; no invoice tracker or Logging/Accounting call was made. The verification session was signed out.
- The optimized production build/type checks, **36 output traces** and standalone privacy checks, anonymous page/API smoke checks (including activity/report routes), and production dependency audit passed. No known npm vulnerabilities were reported for the installed tree on the verification date.
- Fictional desktop/mobile captures had no page errors or page-level overflow: [activity](preview-activity-desktop.png), [mobile activity](preview-activity-mobile.png), [reports](preview-reports-desktop.png), [mobile reports](preview-reports-mobile.png). Original 113 legacy fingerprints and seven pre-existing modified paths are preserved. The reviewed grant script was updated but not applied. The normal port-3000 development preview was restored.

The historical sections below retain the results and limitations as of each prior increment. Historical activity/billing acceptance, timezone-policy decisions, production SQL deployment and durable export jobs remain incomplete; the delivered workbooks are activation aggregates with those rules stated explicitly.

## Existing center users — 24 October 2026

The owner confirmed dealer management and requested center-user management, explicitly keeping center-user creation/password resets pending after the credential-path review. [Chapter 11](11-center-user-management.md) records delivered profiles, secure status, local roles and mapping visibility.

- **24 unit/domain/security tests** and **12 desktop/mobile browser checks** passed. These include review/conflict recovery, center/type isolation, local-only users, read-only ambiguous mappings, protected accounts, last-linked-administrator protection and rejection of credential/role fields.
- Live roster/detail reads passed across all five Nursery centers. Exact transaction commands passed profile/status updates and rejection cases, then rolled back; the original user matched afterward. Center-user credentials, roles and usernames were neither selected for readback nor changed.
- The optimized build/type checks, **30 output traces**/standalone privacy check and production anonymous page/API smoke checks passed, including `/users` and center-user APIs.
- `icare.test` successfully signed in through the real browser, displayed its live roster/mapping notice, and opened an enabled profile form. Creation returned 405 and credential fields were absent. No live user change was submitted by that browser check.
- Desktop/mobile captures use fictional accounts and had no page errors. [Directory](preview-center-users-desktop.png), [mobile directory](preview-center-users-mobile.png), [profile editor](preview-center-user-editor-desktop.png), [mobile editor](preview-center-user-editor-mobile.png).
- A stale generated development cache was archived/regenerated to resolve refresh loops. Browser checks and the final build then ran separately. Normal portal storage and live data were preserved. The reviewed production grant script was updated but not executed.

## Owner-authorized test administrator — 24 October 2026

At the owner's explicit request, `icare.test` was promoted to administrator on the confirmed development server through the dealer-management service. Its password, active state and logical center assignment were retained; prior sessions were revoked. A fresh browser sign-in verified the Dealers navigation, administrator list/detail/assignment APIs and enabled creation form. No additional accounts or center-profile changes were made by this verification. Earlier ordinary-dealer denial checks below remain historical evidence from before promotion.

## Dealer administration — 24 October 2026

The owner confirmed the test dealer works and authorized the next features. [Chapter 10](10-dealer-administration.md) records administrator-only dealer creation, lifecycle, role and center-assignment management.

- All **21 unit/domain/security tests** and **10 desktop/mobile browser checks** passed. Browser fixtures now reset only their dedicated fictional test store before each run; normal portal storage and live SQL are preserved.
- The exact live transaction commands passed creation/password verification, assignment/status updates and duplicate/stale/unauthorized/self-lockout/missing-center denial checks. All fixtures were rolled back, and existing account/mapping snapshots matched. No extra permanent accounts or center changes were made.
- The optimized build/type checks, **26-trace**/standalone privacy verification and production anonymous route/API checks passed, including the new dealer routes.
- The real ordinary test dealer successfully signed in again, retained its assigned-center access, and was denied dealer administration through both page and API checks. Its role and assignments were not changed.
- Desktop/mobile directory and editor captures were visually inspected with no page errors. [Desktop directory](preview-dealers-desktop.png), [mobile directory](preview-dealers-mobile.png), [desktop editor](preview-dealer-editor-desktop.png), [mobile editor](preview-dealer-editor-mobile.png).
- Original legacy source fingerprints and the seven pre-existing modified paths were preserved. Source/document comparison against known legacy credentials/Maps keys passed. The reviewed restricted-account grant script was updated but not executed.

## Test dealer — 24 October 2026

At the owner's explicit request, a new development-only test dealer was created in Secure using the existing password-hashing function, with a new salt and generated password. The account is active, not a super administrator, and owns one existing Nursery center. No existing account or center profile was changed; Accounting/Logging were not used.

An Edge browser successfully signed in through the actual login form. Its center directory returned exactly the assigned center, profile detail was readable, editing was allowed, and another existing center returned 403. The verification session was logged out afterward. The generated credentials and verification artifacts are stored only in ignored private local files; no password is included in this record. Real profile mutation remains untested.

## Development connection — 24 October 2026

The owner confirmed the active legacy configuration as the development server. Private configuration now enables existing dealer sign-in and real center profile editing in local development. [Chapter 09](09-live-connection-setup.md) explains the explicit development exception and production requirements.

- Node SQL connections to Secure, Nursery and School reported encrypted sessions. Aggregate checks found five Nursery centers and no School centers.
- The actual verifier denied nonexistent credentials. An absent actor with forged service-layer grants received no directory records and could not read/update Nursery, Lite or School details. No real dealer session was fabricated and no business records changed.
- The live sign-in page was checked in Edge: sign-in enabled, SQL-backed invalid credentials returned 401 with the expected message, password cleared, anonymous center access denied and no page errors.
- All 17 unit/security/domain tests and eight desktop/mobile browser tests passed. The optimized production build, 22-trace/standalone privacy check and production route/API smoke check passed.
- All 113 indexed legacy fingerprints still matched; the source/document secret comparison passed. Private development credentials remain under ignored `.local` files and are excluded from deployment output.
- A successful existing-dealer login and a real SQL profile save require the owner's browser credentials and remain unverified by the agent. Live center provisioning, Accounting and Logging remain pending.

Connection-only evidence: [redacted runtime checks](generated/live-connection-checks.json). The following sections retain the historical 21 October implementation/audit results.

## Phase-one implementation — 21 October 2026

The owner resumed implementation after the database audit. [Chapter 08](08-authentication-and-centers.md) describes the delivered authentication, sessions, scoped center management and light-blue UI. The historical preparation/inspection sections below remain evidence of those earlier stages.

| Check                          | Current result                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/domain/security           | 15 passed: session hashing, expiry/revocation, limits, owned drafts, revisions, cross-center/type denial, validation and Origin/database gates                                                                                                        |
| Desktop/mobile browsers        | 8 passed on installed Edge/Chromium mobile emulation: protected routes, logout replay, filters, persistent profile edits, stale-save rejection, draft resume/publication, scoped dealer access, other-session revocation and keyboard drawer behavior |
| Production build/type checking | Next.js optimized compilation and TypeScript checks passed; all protected routes remain dynamic                                                                                                                                                       |
| Production access smoke        | Signed-out pages redirect; private APIs return 401; production demo entry disabled; no fictional center records in protected responses                                                                                                                |
| Build privacy                  | Server output traces and standalone package exclude private application storage, SQLite data, env files and legacy connection configurations                                                                                                          |
| SQL contract compilation       | Seven statements described through SQL Server system metadata with no compiler errors; statements not executed and no business records read/written                                                                                                   |
| Legacy integrity               | Original 113 source fingerprints and seven pre-existing modified paths preserved; no legacy modifications; 92 preparation files scanned with no known legacy SQL-password/Maps-key matches                                                            |

Visual review also checks the sign-in, desktop/mobile overview, directory and access page captures. Screenshots preserve the caret to avoid introducing DOM-style changes before hydration. The dev launcher supplies the mutable SQLite storage path at runtime so Next does not trace/watch it as application source. Captures are [desktop](preview.png), [mobile](preview-mobile.png), [sign-in](preview-login.png), [centers](preview-centers.png) and [access](preview-access.png).

Real dealer-account integration, restricted SQL permissions/TLS, SQL profile writes, deployment/restore, shared-store multi-host operation, MFA and full accessibility conformance remain unverified. No database mutations were used to test this implementation. Accounting/Logging remain pending.

## Initial project-preparation checks

| Check                                | Observed result                                                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reproducible source inventory        | 113 source/config/style/script files indexed; all 28 page/code-behind pairs; 59 database-access methods; 28 literal procedure names                                                                                    |
| Type checking                        | `npm run typecheck` passed; final production build's TypeScript pass also succeeded                                                                                                                                    |
| Domain / access / coverage           | `npm test`: 8 passed, 0 failed                                                                                                                                                                                         |
| Production compilation               | `npm run build`: successful Next.js 16.4.2 optimized build                                                                                                                                                             |
| Desktop browser flows                | 2 passed: directory search/filter/dialog/local creation/reset, module navigation, unavailable live API, viewport containment                                                                                           |
| Mobile browser flows                 | 2 passed on Chromium/Edge with iPhone 13 emulation; same flows, responsive menu, no page-level horizontal overflow                                                                                                     |
| Production mode guard                | `node scripts/verify-runtime.mjs` passed: overview/centers/payments show setup when preview disabled; no sample records in their HTML/React server responses                                                           |
| Live boundary                        | Live centers endpoint returns 503 INTEGRATION_NOT_READY and no-store, even with the database-enable environment flag set true                                                                                          |
| Dependency installation              | npm audit reported 0 known vulnerabilities for the installed 189-package tree after setup; this is time-specific, not a security certification                                                                         |
| Source integrity / secret comparison | `scripts/verify-preparation.mjs` matched all indexed source fingerprints and found no copied legacy SQL passwords/Maps keys in preparation source/doc files; comparison excludes passwords shorter than six characters |
| Legacy working copy                  | Original seven modified paths still present; no legacy changes made by this work                                                                                                                                       |

Browser checks use local installed Microsoft Edge, not actual iOS Safari hardware. No claim of full cross-browser or WCAG conformance is made. Screenshots under ignored `test-results/` were inspected for layout. The supplied browser tests can regenerate them.

Final dashboard captures are saved as `docs/preview.png` and `docs/preview-mobile.png` and were visually inspected. Dashboard layout width matched the viewport at 1440 px and 390 px, with no uncaught page errors in either capture.

## Issues found and corrected during preview verification

- Disabled form interaction until client hydration, so very early input is not overwritten by React initialization.
- Confined the table's absolutely positioned hidden header label to its scroll container. It previously expanded the mobile layout viewport and displaced native dialogs.
- Sized dialogs against the device viewport, used mobile input font sizes that avoid automatic zoom, and improved secondary text contrast.
- Hid closed mobile navigation from focus/visibility; added Escape, focus return, focus containment, and inert background behavior for the open drawer.
- Added page-level preview checks in addition to the layout check. A layout-only gate hid visible content while React server responses still included child sample records; the production smoke check now prevents this regression.

## Read-only database follow-up

The subsequent authorized inspection connected to active Secure/Nursery/School using existing configuration in memory. All metadata export queries completed without recorded errors. Inventoried 798 tables, 1,419 procedures, 253 functions, 285 views, two triggers and 62 table types; all 1,959 module definitions visible. The portal mapping contains 46 caller/function contracts and a 116-object static closure, with 66 relevant module review copies. Compiler result metadata was collected for 17 procedure instances; bounded non-personal references exposed the center-type/empty-lookup mismatch. No application stored procedure/function or customer-data query was executed.

Accounting/Logging are absent from the configured active server; the owner confirmed both unavailable. All connections to the alternate production/local variants failed. No schema or runtime claims extend to those endpoints. [The database inspection](07-database-inspection.md) explains exact read-only controls, SQL privilege/TLS observations, findings and remaining inputs.

Inspection tooling is separate from the web application. Follow-up validation completed:

| Check                                | Result                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspection script syntax             | All three PowerShell scripts parsed without errors; both changed JavaScript tools passed `node --check`                                                                   |
| Evidence consistency                 | Totals, 46 mappings, 116-object closure, 66 review copies and 17 first-result descriptions matched exports; no recorded metadata errors                                   |
| Contract distinctions                | Element_ID_List resolved as a type; only three absent reachable procedure paths, all School gateway/tracker; one generic School monthly-parameter mismatch                |
| Integrity/security observations      | FK enabled/trust counts, empty references, center-type mismatch and observed session privilege/encryption matched source exports                                          |
| SQL literal redaction                | Every quoted literal in the 66 public module review copies was either withheld or on the explicit harmless formatting/algorithm allowlist                                 |
| Documentation links                  | 33 local file links resolved                                                                                                                                              |
| Legacy integrity / secret comparison | All 113 source fingerprints matched; 64 preparation files scanned, including PowerShell/SQL; no copied legacy SQL passwords (six characters or longer) or Maps keys found |
| Legacy working copy                  | Same seven pre-existing modified paths; legacy repository unchanged                                                                                                       |

Application build/browser tests above belong to the initial preparation. They were not repeated for this analysis-only follow-up: no web application behavior changed, and no live feature was enabled. Secret comparison is bounded to known legacy values, not a comprehensive secret scanner. Full inspection commands and read-only constraints are in [chapter 07](07-database-inspection.md).

## Verification limits

The legacy application was not started under IIS, built with its original ASP.NET compiler or tested using live dealer accounts. Available stored-code definitions, compiler-described first result schemas, effective inspection-login privileges and observed session encryption were inspected; this does not prove runtime result values, real grant behavior or production parity. The separate `scripts/sql/discover-schema.sql` file was not executed. Accounting/Logging internals, deployed IIS/session settings, actual media trees, external callbacks, provider environments and historical activity accuracy remain unverified. No customer records, mutations or business procedures were exercised.

The portal is not a full implementation of the legacy feature set. The historical null session boundary was replaced in phase one; its real dealer verifier/SQL adapters still need end-to-end acceptance with restricted TLS connections and authorized accounts. Live provisioning and later modules remain unavailable. The acceptance matrix is in [the delivery plan](05-delivery-plan.md).

## Repeat checks

```powershell
npm run audit:legacy -- "D:/Data/Projects/Appware/Visual Studio/iCareAdmin-Web"
node scripts/verify-preparation.mjs "D:/Data/Projects/Appware/Visual Studio/iCareAdmin-Web"
npm run typecheck
npm test
npm run build
npm run verify:build
node scripts/verify-runtime.mjs
npm run test:e2e
```

Stop other development instances before browser checks. Tests use loopback 3101, an isolated .next-e2e output and a separate fictional store; the production smoke starts/stops loopback 3102. Run the build and browser checks separately. Restore the normal loopback 3000 preview afterward. These checks do not require SQL credentials. The normal development launcher supplies its private default storage path; production must configure a persistent path explicitly.

## Center status increment — 24 October 2026

[Chapter 14](14-center-status.md) records the activation contract, authorization, write switch and integration limits. Verification for this increment:

- All 33 domain/security tests passed, including status contracts, page-9 read-only scope, current stored identity, composite scope, stale/ABA revisions, atomic demo receipts, a 20-record history bound and mode separation.
- All 20 desktop/mobile browser checks passed. After the final status layout/search fixes, its four desktop/mobile checks passed again, including rapid typing, confirmation/history, conflicting edits, URL persistence, owner writes and denied cross-scope/CSRF/anonymous requests. Chrome on macOS with an iPhone viewport was used; this is not physical Safari/iOS acceptance.
- TypeScript and the production build passed. Build privacy verified 39 traces plus standalone output with no private store, environment files or legacy connection configurations. Status directory/review captures under ignored `test-results/` were visually inspected on desktop/mobile; result pages had no horizontal overflow.
- Read-only dev requests verified directory/type/status/sort/dealer filters and scoped detail. Five accessible Nursery centers had no stored status row; the current dealer filter matched one. A valid mutation request was blocked with `STATUS_WRITES_DISABLED`, and the separate verification session was signed out. No live status mutation or legacy Logging procedure was run.

The final production smoke includes the status page and both status read endpoints. Live status writes remain off pending disposable-fixture mutation/rollback and recovery acceptance. SQLite receipts do not complete central Logging. Existing user creation/password resets and Accounting/Logging remain deferred.

## Development status-write acceptance — 25 October 2026

The owner explicitly authorized testing and enabling center status writes on the confirmed dev server. The separate [acceptance runner](../scripts/verify-status-development.ts) passed all [nine grouped SQL checks](generated/status-sql-checks.json): Nursery/Lite/School committed saves, owner/admin enforcement, stale and competing writers, ambiguous-record guards, rollback, receipt-store failures and lost commit acknowledgement recovery. All disposable SQL rows and trigger-created timezone history were removed, and existing row/reference fingerprints matched. No reference seeds were repaired. The dev page-9 reference is absent, so positive page-9 scope remains covered by isolated demo/domain tests rather than a newly seeded SQL fixture.

All 33 domain/security tests, TypeScript, the optimized build, build privacy (39 traces plus standalone output) and production anonymous-access smoke passed. After enabling only the private dev status-write switch and restarting the local preview, authenticated in-app desktop/mobile saves on one disposable center produced confirmed portal history. The browser fixture was cleaned up with an unchanged baseline check. No existing center activation was changed by acceptance; production, legacy-client session enforcement and central Logging remain outside this verification. See [chapter 14](14-center-status.md) for commands, fixture boundaries and retained receipt details.

## Alerts increment — 25 October 2026

[Chapter 15](15-alert-messages.md) records the owner-selected inclusive UTC expiry rule, legacy contracts and independent alert switch. All 36 domain/security tests, TypeScript and optimized build passed; build privacy checked 44 traces/standalone output, and production smoke includes `/alerts` plus its anonymous read APIs.

The explicit dev fixture runner passed [eight grouped SQL checks](generated/alerts-sql-checks.json), including committed Nursery/Lite/School publication/read-back, idempotent batches, owner/admin enforcement, partial failures, stale/invalid-record denial, rollback, failed-only retry, lost commit acknowledgement, administrator reset and generation protection across reset cycles. Fixtures and their timezone history were removed; existing centers, alerts, accounts, assignments, grants and reference fingerprints matched. No seed repair or legacy logger call was performed.

In-app browser checks confirmed three-center publication, persisted batch results after reload, native UTC date selection and a three-center reset at 390×844. An ordinary demo operator published to its owned center while reset and page-8-only recipient selection stayed disabled. HTML validation left the recipient list visible. Desktop results and the mobile review dialog had no horizontal overflow; private captures are `.local/alerts-*.jpg`. Direct HTTP checks exercised anonymous/Origin guards, strict actor-field rejection, cross-type scope, admin-only dealer filtering/reset, cross-mode batch ownership, expiry validation and page-8 write denial; the independent verification session was signed out. Dev alert writes are enabled; existing real-center alerts were not used as test recipients. External client display/cache/expiry behavior, production identity privileges and central Logging remain unverified.

### Bus settings — 25 October 2026

- `npm test`: 39 passing tests; TypeScript and optimized production build passed. Build privacy scanned 48 traces/standalone output with no private stores, SQL configuration files or environment files. Production smoke confirmed protected transport pages and APIs deny anonymous access.
- Read-only dev inspection found ten Nursery buses, zero School buses and empty settings/default/reference tables in both operational catalogs. The independent transport-write switch remains disabled; no persistent lookup seeds or existing bus settings were changed.
- Rollback-only SQL acceptance passed for Nursery, Lite and School: missing-reference denial, ID/value distinction, override/readback, stale revisions, valid default restoration, duplicate guards, wrong bus membership, inactive stored account and revoked ownership. Temporary credentialless account/center/bus/reference rows rolled back; original bus/reference fingerprints matched. See `docs/generated/transport-sql-checks.json`.
- A separate fictional API session verified 401 anonymous reads/writes, 403 cross-origin and cross-scope requests, 422 strict actor/database/default-row/lookup rejection, 404 absent buses and 409 stale revisions; its own session was signed out.
- Desktop and 390×844 mobile browser checks verified an operator override/save and inherited-default restoration. Live bus review showed unconfigured settings and disabled choices. Final URL search typing retained spaces, survived reload, and clearing a bus removed its editor. Mobile content fit without horizontal overflow. The browser was returned to `icare.test` and the normal dev server remains on port 3000.
- Full committed public-boundary SQL acceptance awaits reviewed live choices; connected device consumption/delivery and production restricted-principal deployment remain unverified. SQLite operation receipts remain separate from pending Logging.

### Private center branding — 27 October 2026

- The owner selected private portal storage. Logos and main center photos are normalized and stored outside the web root in private SQLite; legacy image columns, filenames, folders and URLs are unchanged. The separate local dev branding-write switch is enabled; defaults elsewhere remain off.
- `npm test`: 44 passing tests, including full decoding, EXIF removal, alpha handling, actual animated WebP rejection, either-edge/pixel/body bounds, two-upload concurrency limits, owner/private/mode scope, atomic publication, stale revisions, failure rollback, retention, quotas and throttling. TypeScript and optimized build passed. Build privacy passed for 51 traces/standalone output. Production runtime smoke denied anonymous metadata/images and disabled demo.
- Disposable SQL/private-store acceptance passed across Nursery, Lite and School. Owner publication, other-actor preview denial, administrator reads, stale revisions and failed local receipts behaved correctly. Inactive/revoked/forged actor claims were rejected. All marked SQL accounts/centers/mappings/timezone rows were removed; original fingerprints (including legacy image fields) matched. Dedicated acceptance SQLite data is private and separate from normal sessions.
- HTTP API checks verified 401 anonymous reads/uploads, 403 cross-origin and cross-center/type denial, 413 oversized body rejection, 422 forged MIME/extra fields, 404 other-actor preview/discard, private no-store/Cookie headers, 409 stale publication and owner-only preview discard. Separate test sessions were signed out, and current fictional API-test center branding remained unchanged.
- Desktop browser checks uploaded, reviewed and published a fictional demo logo and photo together; current images and the center heading logo loaded successfully. Mobile 390×844 review/back/discard kept existing images intact, with no horizontal overflow. `prune-branding.ts` dry-run completed without deleting current images. These are authenticated private portal images, not legacy-client asset delivery; production backup/capacity/shared storage acceptance remains separate.
