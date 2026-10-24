# Dealer administration — 24 October 2026

After confirming that test-dealer sign-in and scoped centers work, the owner authorized the next features. This increment adds administrator-only dealer administration to the existing light-blue portal. Accounting and Logging remain pending.

## Delivered workflows

- `/dealers` provides account cards, search by name/username/email, status and role filters, pagination, matching-account totals, refresh, empty/error states and retry. It appears in the navigation only for administrators. A non-admin opening the URL sees an access-required page; the APIs independently deny access.
- Create an active or disabled dealer with display name, username, optional email, initial password, administrator/ordinary role and center assignments. The form requires a review before saving. Initial passwords have 12–128 characters and are never returned by the API, saved in demo storage, displayed in the review, or sent by email. New usernames have 3–100 letters/numbers or `._@+-`; existing usernames are preserved and cannot be changed by the update API.
- Edit display name/email, enable or disable the account, change its role, and add/remove center assignments. Assignment search is paginated; the selection persists across searches. IDs always retain their center type. Administrators have global center access; their explicit assignments are retained for a later change to ordinary dealer.
- Stale revisions are rejected. The editor offers an explicit reload of current data before another save. Closing a changed form asks before discarding it; leaving the page warns about unsaved changes. Save feedback follows confirmed persistence.
- Self-disable and self-demotion are blocked. Active administrator rows are locked during live writes, and the lifecycle policy preserves at least one active administrator. Status/role/assignment changes revoke the affected other dealer's sessions in this portal. Name/email changes preserve sessions. No hard account deletion is provided.

The `icare.test` account was initially kept as an ordinary dealer. The owner subsequently explicitly requested administrator access for testing on 24 October 2026. It is now an active administrator on the development server, with its password and existing center assignment retained. Its prior sessions were revoked, and a fresh browser sign-in verified dealer navigation, administrator APIs and the creation form. Use the administrator demo for isolated exploration without live changes.

## API and authorization boundaries

| Route | Behavior |
| --- | --- |
| `GET /api/dealers` | Administrator directory with validated bounded filters and independent counts |
| `POST /api/dealers` | Administrator creation, strict input, Origin validation and reviewed form |
| `GET /api/dealers/{id}` | Administrator detail DTO with explicit non-secret account fields and assignments |
| `PATCH /api/dealers/{id}` | Administrator revision-checked account/role/status/assignment update |
| `GET /api/dealers/centers` | Administrator-only paginated assignment catalogue |

`dealers.manage` is derived from the current super-admin state, without numeric account exceptions. Every service checks the capability and administrator role. SQL reads repeat an active-administrator predicate; writes lock and recheck the actual database actor before touching the target account. Forged service-layer role claims cannot authorize an ordinary database dealer. Demo operations recheck their stored demo actor and never use SQL.

Live creation/update uses fixed parameterized SQL in one SERIALIZABLE transaction across the dealer row and composite ownership links. Assignments are parsed with a fixed `OPENJSON` shape and validated against the available catalogs. Duplicate usernames are checked under locking using SQL collation, including inactive accounts; no uniqueness constraint or other schema repair was applied. Supported but unavailable assignments must be explicitly removed before a save; unrecognized legacy mapping types block editing until reviewed. Other applications' simultaneous writes still require operational coordination; the portal cannot impose policy on external consumers.

Passwords are hashed through the inspected `dbo.getHashedPassword` with a fresh `NEWID()` salt. The known unsafe legacy dealer-update procedure is not used. Dealer DTOs explicitly omit password hash, salt and access token. Password reset, invitation/email delivery, MFA, username changes and arbitrary page-grant editing are not included.

## Configuration and persistence

`ICARE_DEALER_WRITES_ENABLED=true` enables live dealer mutations separately from center profile writes. It is enabled in the private local development configuration for the owner-confirmed dev server. Production retains the restricted-identity/validated-TLS requirements from chapter 09.

The reviewed [application-grant script](../scripts/sql/portal-app-grants.sql) now includes the additional read columns, hash-function execution, dealer inserts/allowlisted updates and ownership-link inserts/deletes. It has **not been applied**. SQL Server grants INSERT at object level rather than per column; runtime commands allowlist their columns. Use reviewed procedure wrappers if production requires a narrower insertion boundary. [Microsoft object-permission documentation](https://learn.microsoft.com/en-us/sql/t-sql/statements/grant-object-permissions-transact-sql).

The private SQLite store adds fictional dealer/assignment tables and a small operation-receipt table. Demo credentials are not stored; the existing two demo-entry roles remain the sign-in entry points. The demo session resolver now derives role, activity and assignments from those fictional tables, so permission changes can be tested realistically without accessing live data.

Live operation receipts record operation ID, actor/target IDs, mode, action, state and times. They contain no password, hash, account name or email. An intent is persisted before a SQL write; confirmed commits/rollbacks update the receipt. An uncertain commit is marked unconfirmed, and failure to finish a receipt leaves it for reconciliation rather than falsely reporting a confirmed SQL save as failed. These receipts are not a replacement for the unavailable Logging database or a complete enterprise audit system. Single-host persistence and backup constraints still apply.

Revocation occurs before SQL commit so a local session-store outage blocks an access change. A later SQL rollback may therefore require the affected dealer to sign in again. Account/grant changes are also reread on each authenticated request. This does not retrofit revocation checks into the separate legacy Web Forms application or other consumers.

## Verification

The suite contains 21 domain/security/unit tests and ten desktop/mobile browser checks. Coverage includes duplicate usernames, strict payloads, composite assignments, role changes, self/last-administrator protection, forged actor denial, mode separation, session invalidation, conflict recovery and viewport containment. The optimized build and production API/page guards are checked separately.

Visual references: [desktop directory](preview-dealers-desktop.png), [mobile directory](preview-dealers-mobile.png), [desktop editor](preview-dealer-editor-desktop.png) and [mobile editor](preview-dealer-editor-mobile.png). The dedicated browser-test store is reset before each run, leaving normal development sessions/drafts/demo records intact.

Live read adapters were exercised against the development server. The exact runtime transaction commands also created a temporary ordinary dealer, verified its salted password with the actual dealer authenticator, changed assignments/status, and rejected duplicate, stale, missing-center, self-lockout and unauthorized-actor cases. The enclosing transaction was rolled back. Existing dealer/ownership snapshots matched afterward; no account or center changes from those fixtures remain. SQL identity sequence numbers may advance after rolled-back inserts. [SQL verification evidence](generated/dealer-sql-checks.json).

No extra permanent administrator or live test account was created for this increment. Real account lifecycle writes become available when an administrator submits the reviewed form. Accounting/Logging, live center provisioning and shared center-user credential editing remain deferred.
