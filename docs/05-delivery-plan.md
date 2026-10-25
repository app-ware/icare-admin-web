# Implementation sequence, acceptance, and remaining evidence

## Current delivery and boundaries

Source analysis and the three-catalog follow-up are complete for the supplied environment. The owner resumed authentication, permissions and center management using existing dealer accounts and a new light-blue interface. [Chapter 08](08-authentication-and-centers.md) records that foundation. The owner-confirmed development server is connected, the owner confirmed test-dealer sign-in/centers work, and [chapter 10](10-dealer-administration.md) adds dealer administration. Production still needs restricted validated-TLS SQL settings. Live center provisioning remains gated by reference/account/filesystem issues. Accounting and Logging remain pending. The table below is a roadmap; only the explicitly documented increments are delivered.

Existing center-user profiles, secure sign-in status and mapping visibility are also delivered in [chapter 11](11-center-user-management.md); the owner explicitly kept creation/password resets pending. The rollout below is ordered by dependencies. Durations should be estimated after staging contracts and team capacity are known; a reliable schedule cannot be inferred from page count alone.

[Chapter 12](12-activity-and-reports.md) delivers read-only activity, explicit legacy Excel ranges/exclusive dates, scoped class/demo summaries and bounded synchronous XLSX generation with own-account history. This does not complete historical business-output acceptance, durable background exports or the pending Accounting/Logging integrations. The owner reconfirmed user creation/password resets remain pending.

[Chapter 13](13-remaining-features.md) summarizes the remaining feature gaps as of 24 October 2026 and suggests the next implementation order. Use it for current feature status; the phases below retain the broader delivery and acceptance framework.

[Chapter 14](14-center-status.md) delivers center activation review and an isolated demo change workflow. Dev status reads/writes are enabled after owner-authorized disposable-fixture mutation/rollback/recovery acceptance on 25 October 2026; production remains subject to its own controls. Local receipts do not complete central Logging.

[Chapter 15](15-alert-messages.md) adds scoped selected-center alert publication/reset, the owner-selected inclusive UTC expiry policy and durable per-center batch outcomes. Storage confirmation does not certify external client delivery.

| Phase                        | Work                                                                                                                                    | Exit criteria                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 0 — Evidence                 | Three catalogs inspected; obtain missing Accounting/Logging, reconcile reference seeds, approve grants/consumers, deployment/photo tree | Representative contracts/data, identity transition, activity rules and backup plan reviewed             |
| 1 — Identity and read access | OIDC/session integration, approved capability grants, SQL roles/pools, row-scoped center directory/detail, audit                        | Real admin/dealer fixtures pass deny/allow tests; secrets absent from browser/logs; no writes enabled   |
| 2 — Center lifecycle         | Owned drafts, profile/coordinate updates, safe uploads, provisioning state machine, administrator invite/reset, QR job                  | School/nursery/lite parity; retry/idempotency/recovery tests; no cross-tab interference                 |
| 3 — Daily operations         | Status, alert publishing/reset with partial results, bus inheritance, dealer administration                                             | Actor/resource enforcement on all operations; confirmed success/error UI; business audit complete       |
| 4 — Ledger and integration   | Exact decimal ledger, approved statuses/currencies, CowPay metadata/secret replacement, callback ownership                              | Staging reconciliation; no secret readback; no falsely reported writes; no real charges from tests      |
| 5 — Activity and reports     | Approved activity calculator, school academic-year fixes, batch queries, XLSX jobs/downloads and durable download-history audit         | Golden report comparison signed off, explicit rule differences documented, large export limits measured |
| 6 — Cutover                  | Pilot selected staff/centers, feature flags, read-only comparisons, trained operators, monitoring and rollback                          | Acceptance signed off; restore/rollback rehearsed; legacy safely retired after consumer review          |

## Characterization and acceptance matrix

These are tests to implement as each feature becomes real. They are deliberately specific to observed behavior and risks.

| Area            | Cases that must pass                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity        | Wrong/disabled/expired/revoked account denied; login rotation; logout invalidation; MFA; login throttling; no credential in trace/UI/network logs                                                                                                   |
| Authorization   | Dealer A denied dealer B's center; same numeric center ID with different type denied; manual API/route/postback bypass denied; forged actor/dealer/filter ignored; ID 4/5 has no implicit permission; unauthorized downloads/jobs denied            |
| Center creation | Nursery and School with school year; Lite compatibility decision; duplicate domain/name races; missing required data; session expiry; two tabs; retry after SQL success/file failure; canceled draft cleanup only owns its files                    |
| Center edits    | Correct actor passed as dealerID; unchanged immutable fields; input mode transition; QR job failure/retry; output status denied/failed produces no success notification; optimistic concurrency conflict                                            |
| Uploads         | One dimension over limit; exact watermark dimensions; disallowed bytes under valid extension; oversized file/pixels; collision-safe naming; path traversal; canceled/replaced uploads; uppercase names; Windows/Linux/object-storage compatibility  |
| Location        | Longitude-first legacy conversion; latitude ±90/longitude ±180; negative coordinates; absent/invalid fields; no silent fallback overwrite; map/manual inputs agree                                                                                  |
| Administrator   | No readback of password; username policy explicit; invite expiry/single use; correct center_user_id bound to center; disabled access; email change audit                                                                                            |
| Dealers         | Admin grant actually persists; no escalation by direct request; target differs from actor; active-account semantics; membership changes and revocation                                                                                              |
| Status          | Scoped activation/deactivation; invalid status; conflicting concurrent edits; reason/audit; gateway enablement independent                                                                                                                          |
| Money           | Fractional amounts preserved; large values without Int32 overflow; defined rounding and scale; per-currency totals; malformed/negative/exponent amounts by policy; optional month/year valid; due-date range ordered; center -1 rejected            |
| Payments        | Add/edit/delete procedure outputs 1/0/-1/2 mapped; failure does not clear draft or say success; deletion requires correct payment-center scope; URL scheme validation; duplicate retry protected                                                    |
| Gateway         | Missing configuration; live/staging separation; replace without revealing existing values; unauthorized secret read/write denied; callback URL validated/owned; provider error redacted                                                             |
| Alerts          | Empty selection rejected; expiry today/past/invalid and timezone edge; message length/format; mixed Nursery/School success and partial failure; selected row fallback; reset requires independent permission; retry only failed targets             |
| Transport       | Correct database/lookups; reference IDs and units; default -1 fallback; override/inherited distinction; missing bus/default; bus not in center; empty input selection; failed upsert not reported successful                                        |
| Activation math | 0/1/4/5/6/13/14 active days; no rows; one pre-month add/activate/deactivate/delete; Restore 6 normalization; Move 4 excluded; tied/out-of-order events; leap February; current/future month; per-center timezone/history; errors distinct from zero |
| Activity totals | Demo vs non-demo; zero-day children; historical demo membership vs current state; HTML/class Excel/center summary consistency under approved rules; Student total definition; School academic-year counts                                           |
| Exports         | Multiple centers and types; duplicate/long/invalid sheet names; empty rows; include inactive/exclude zero switches; partial job failure; large dataset; secure expiring download; injected spreadsheet formulas treated as data; file retention     |
| Tracker         | Export delivery records scoped UTC download history without posting an invoice/charge; retries idempotent; audit failure distinct from file generation; no inferred month/year billing meaning                                                      |
| Reliability     | SQL/log DB outage; pool reconnect; timeouts; cancel/retry; no leaked connection; bounded result size; error envelope with request ID; no PII/secret in logs; backup restore                                                                         |
| UI              | Desktop/mobile search/filter/sort; keyboard-only dialogs/forms/nav; visible focus; zoom/reflow; live error/status announcements; no color-only status; loading/empty/error/partial states; RTL if approved                                          |

## Questions requiring actual system/business evidence

1. **Missing databases/environment:** Accounting/Logging are not available yet. When supplied, inspect ledger precision, statuses, write/authorization semantics and logger behavior. Which environment represents deployed production? How should its owner reconcile School-2 reference seeds with School-4 routing, absent Lite-3 and empty lookup tables?
2. **Identity:** Which organizational provider, MFA and lifecycle should be used? Which other apps consume Dealers, Center_Users, local sec_users and roles? The dealer hash/active check is now known; how should plaintext local synchronization/password-bearing logging be migrated? Approve named grants covering current ownership/page 7/8/9 access and UI exceptions.
3. **Activity rules:** Should five days be in the first or second bucket? Count zero-day children? Keep exclusive end dates? How should Nursery timezone history/default Africa/Cairo, School timezone and historical demo state apply? Move 4 is excluded and Restore 6 normalized by SQL; download tracker is now verified as delivery history, not billing posting.
4. **School and Lite:** Existing bulk exports and gateway lists exclude School. Should future versions expand that scope? What should School demo totals count? Is Lite creation required? Which workflows need parity versus a new feature decision?
5. **Money:** Which currencies, decimal scales, accepted negative/refund values, due-date semantics, ledger statuses, deletion rules, and payment link schemes are valid? Does the ledger integrate elsewhere?
6. **Gateway:** Who owns the CowPay callback/service and merchant credentials? Which environments and API versions are used? Are these settings shared by other apps?
7. **Files and infrastructure:** Where is the live template/photo tree, and who consumes its URLs? Which child assets must be private? What are actual IIS/proxy, SQL/TLS, backup, retention, capacity, and deployment settings? Where should Node run?
8. **Product policy:** Which displayed-but-not-persisted fields should become editable? Should the inactive child-image/sponsor features return? Is Arabic/RTL required? Which staff should pilot each module?

The source/available-database audit is reviewable now. These are the remaining inputs for live workflows; unavailable databases and business policy must not be filled in by guessed schemas or silent rule changes.

## Cutover controls

Preserve numeric IDs and center type, existing external domains/usernames, and file URL compatibility until consumers have migrated. Export a baseline of staging outputs; compare the new service's read-only results before enabling writes. Version any intentional billing corrections and keep historical reports reproducible. Use explicit role/capability mappings rather than copying menu visibility.

Start with a small staff/center pilot. Gate writes per feature, monitor errors/audit and report parity, and keep the old site accessible during validation. Avoid uncontrolled dual writes. Take verified database/file backups before any schema/credential migration. Rollback requires a documented traffic switch and reconciliation of writes since cutover; reverting UI code alone is insufficient. Credential rotation and legacy endpoint retirement are coordinated operational actions after consumer discovery.

## Current verification evidence

See [verification record](06-verification.md) and [database inspection](07-database-inspection.md) for actual commands/results and limitations. Read-only SQL metadata/reference inspection was performed; no application procedure, mutation, exploit/security test, provider request, legacy IIS runtime test or real-data migration was performed.

Bus settings delivery (25 October 2026): chapter 16 records scoped reads, demo editing, SQL transaction/revision guards and rollback acceptance. Dev lookup/default tables remain empty; no seeds were repaired and the independent live transport-write switch remains disabled.
