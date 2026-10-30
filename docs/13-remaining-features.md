# iCareadmin remaining features and delivery order

Status: **30 October 2026**.

The rebuild provides dealer sign-in, scoped center management, dealer administration, existing center-user management, activity and aggregate Excel reports. The remaining work is concentrated in operational modules, full center provisioning, credential workflows and production readiness.

The comparison baseline is the [audited legacy iCareadmin](01-current-system.md) and the implemented increments in chapters 08–12. Deployed online parity still needs acceptance against the actual online environment. The [delivery and acceptance plan](05-delivery-plan.md) retains the detailed acceptance matrix and unresolved business decisions.

## Delivered features

| Area                  | Available now                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Access                | Existing dealer sign-in, current permissions, expiring/revocable sessions, logout and sign out other sessions.                                                                                                     |
| Centers               | Scoped directory, search/filter/sort, profile/contact editing, manual/map coordinate updates and persistent owned creation drafts. Demo publication creates fictional centers only.                                |
| Dealers               | Administrator-only creation, profile changes, enable/disable, administrator roles and center assignments, with conflict and self/last-administrator protections.                                                   |
| Center branding       | Validated logo/main-photo uploads, private owned previews, atomic publication, creation-wizard save/resume and authenticated images in the new portal. Legacy image fields/URLs are unchanged.                     |
| Alert messages        | Scoped publication/replacement, inclusive UTC dates, administrator reset, per-center outcomes and owned failed-target retries.                                                                                     |
| Center status         | Scoped activation review, search/filter/sort, confirmation, conflict recovery and portal receipts. Dev changes are enabled after disposable SQL/browser acceptance; the independent switch defaults off elsewhere. |
| Existing center users | Scoped rosters, name/email editing, role/mapping visibility and secure sign-in enable/disable. Secure status does not revoke legacy-client access or external sessions.                                            |
| Activity and reports  | Monthly class/demo aggregates, School academic-year views, bounded in-memory XLSX generation and the account's generation history. These are activation reports, not attendance or invoices.                       |

Implementation details: [centers and access](08-authentication-and-centers.md), [dealers](10-dealer-administration.md), [center users](11-center-user-management.md), [activity and reports](12-activity-and-reports.md), and [center status](14-center-status.md).

## Operational workflows still pending

Bus settings are delivered with live writes gated. CowPay readiness is delivered read-only in chapter 22; credential replacement/enablement and payments remain pending; the [feature registry](../src/features/registry.ts) records their intended workflows.

| Feature                     | Remaining scope                                                                                                         | Dependency or boundary                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bus settings (`/transport`) | Delivered scoped reads and demo override/default editor; guarded SQL adapter and rollback acceptance.                   | Live writes await reviewed lookup seeds and committed fixture acceptance; dev references are empty. See chapter 16.                         |
| Payments (`/payments`)      | Read/add/edit/delete ledger entries; filter due dates/status; show exact per-currency totals.                           | Accounting database is unavailable. Inspect its contracts and agree precision, rounding, statuses and deletion rules before implementation. |
| CowPay (`/integrations`)    | Chapter 22 delivers scoped setup/readiness reads. Credential replacement, enablement and provider registration remain pending. | Nursery/Lite only; boolean credential presence, independent live/staging completeness and reviewed callback metadata. No provider requests or secret readback. |

Logging integration also remains pending because the Logging database is unavailable. Current SQLite operation and generation receipts do not provide a complete central business audit service.

## Remaining work within delivered modules

| Area                          | Remaining work                                                                                                                                                                                                                                                             | Current boundary                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live center creation          | Provision the operational and secure records, initial administrator and required filesystem assets; support retries and recovery after partial failure.                                                                                                                    | Live creation saves drafts only. Reference seeds conflict with routing; account and photo-tree contracts also need resolution. Do not repair seeds automatically.                     |
| Branding                      | Logo/main-photo uploads are delivered in chapter 17 using owner-approved private portal storage. Creation-wizard uploads are delivered in chapter 18. Watermark uploads and reviewed removal are delivered in chapter 19. Legacy-client asset integration remains pending. | Existing legacy fields/files/public URLs are unchanged; production storage and asset consumer contracts require acceptance.                                                           |
| Center settings and QR        | Chapter 21 delivers scoped input-mode reads, reviewed demo changes and recoverable private demo QR jobs. Live QR generation remains pending.                                                                                                                                                                                                | Live mode writes default off; dev lookup choices are empty. Scanner/shared-storage acceptance is required for live QR. Profile saves remain separate. |
| Map selection                 | Delivered optional click/drag/keyboard picker with synchronized manual fields in chapter 20.                                                                                                                                                                               | Explicit provider loading; production maps default disabled. Manual coordinates and external links remain available.                                                                  |
| Center-user credentials       | Create users/initial administrators and provide a secure password change/reset workflow.                                                                                                                                                                                   | Explicitly deferred by the owner. Usernames and roles remain read-only; creation/reset work must account for other credential consumers.                                              |
| Dealer credentials and grants | Existing-dealer password change/reset; invitation/email delivery and arbitrary page-grant editing if required.                                                                                                                                                             | New-dealer initial passwords work. Existing usernames are read-only. Center assignments and administrator/ordinary roles already work.                                                |
| Reports                       | Historical output acceptance, larger background exports, durable recovery and confirmed download-history tracking.                                                                                                                                                         | Current exports are synchronous and bounded, retain no workbook, and use redesigned aggregate sheets. Generation history records preparation rather than confirmed browser delivery.  |

Report acceptance must preserve the documented `activation-calendar-v1` policy until an intentional rule change is agreed and versioned. Nursery/Lite batch exports and School academic-year exports remain separate. Exact legacy workbook layouts, an exclude-zero option and expanded School bulk/gateway scope require a parity/product decision rather than being assumed requirements.

## Suggested implementation order

1. **Center status rollout:** dev mutation/rollback/recovery acceptance is complete and its independent write switch was enabled on 25 October 2026. Production identity/deployment and legacy-client enforcement acceptance remain separate.
2. **Alerts rollout:** the new workflow is delivered; validate external client display/expiry/cache behavior and complete production controls.
3. **Bus settings:** implemented in chapter 16; resolve dev lookup data and committed fixture acceptance before enabling live writes.
4. **Branding and QR:** private portal logo/main-photo uploads are delivered in chapter 17. Verify the legacy asset/URL contract before adding external client delivery or live QR generation. Private recoverable demo QR jobs are delivered in chapter 21. Watermark storage/removal is delivered in chapter 19. Creation-wizard uploads are delivered in chapter 18.
5. **Live center provisioning:** proceed after reference-data, initial-account and filesystem dependencies are resolved and the owner resumes the deferred user-creation work.
6. **Payments, CowPay and Logging:** CowPay readiness reads are delivered in chapter 22. Resume credential/enablement writes only after provider/consumer/callback review. Payments and central Logging await their databases and contracts.

Historical report acceptance and deployment preparation can progress alongside this sequence. The order is a recommendation; documenting it does not resume user creation/password resets or authorize seed repairs, credential migrations or production cutover.

## Production readiness and acceptance

- Configure and verify a restricted SQL identity with validated TLS. The reviewed application-grant script has not been applied; the current local development compatibility exception is not a production configuration.
- Obtain representative School/Lite fixtures for positive live acceptance. Current live verification covers the available Nursery centers; positive School/Lite behavior uses fictional fixtures.
- Validate real report outputs with business owners, document intentional legacy differences and measure larger-load behavior.
- Confirm hosting, private persistent storage, backups/restore, monitoring and retention. Replace the local SQLite store before deployment across multiple hosts; add a shared durable queue/store when background jobs are introduced.
- Pilot selected staff/centers, complete relevant domain/security tests and builds plus desktop/mobile checks, and rehearse rollback before replacing the online portal.

Organizational sign-in and MFA are additional identity roadmap items, not established legacy-parity gaps. Arabic/RTL, inactive legacy child-image/sponsor features and new editability rules remain product decisions, as recorded in [the delivery plan](05-delivery-plan.md#questions-requiring-actual-systembusiness-evidence).

## Maintaining this status

When a feature is delivered, update its status here and its implementation chapter, record verification, and adjust the suggested order. Update the feature registry when module ownership changes. Keep deferred features and environment-specific acceptance limits explicit.
