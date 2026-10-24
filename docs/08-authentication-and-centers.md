# Authentication, permissions and center management — phase one

The owner resumed the Next.js rebuild on 21 October 2026, selected **existing iCare dealer accounts**, and requested an independent **light-blue theme**. This chapter is the current implementation record; chapters 01–07 retain the legacy audit and historical preparation evidence. Accounting and Logging remain pending. No legacy application/configuration or business records were changed during implementation.

## Implemented experience

- A fresh blue/white sign-in screen and authenticated workspace, with responsive navigation, overview, center directory and access/session page. The visual system was created locally for this portal; no assets or theme were imported from another project.
- Server-side center search, type/status filters, sorting, pagination, URL filter state, loading/error/empty states and explicit retry. Center links always include type and ID.
- Center detail pages with profile/contact information, coordinates, identity, domain and observed timezone. Unknown activation status remains unknown; no lookup seeds were invented.
- Profile editing with server validation, coordinate limits, explicit save/cancel, unsaved-change warnings, conflict detection and persistence confirmation. Invalid legacy coordinate strings are preserved when left blank rather than silently erased.
- A four-step creation draft: basics, contact details, location and review. Drafts are privately owned, persistent, resumable, revision checked and deletable. Domains use the verified 50-character limit.
- An effective-permissions view and active-session list, with working logout and “sign out other sessions.” Permission assignment/dealer administration is a later feature; this UI does not pretend to change live grants.
- An explicitly labeled, server-backed demo workspace with administrator and scoped-operator experiences. Demo profiles/drafts survive refresh. Publishing a demo draft only creates a fictional demo center.

## Existing iCare sign-in

`POST /api/auth/login` calls the audited `icare_secure.dbo.authenticateDealer` with fixed typed input/output parameters. The submitted password is never returned, saved in a draft, logged or passed to the unavailable logger. Its legacy hashing remains in SQL; this release does not migrate shared credentials or add password reset/MFA.

After verification, the server rereads the active dealer and ownership records using explicit columns. Ambiguous duplicate active usernames fail closed. The session stores a derived credential stamp, not the password/hash/salt. Every authenticated request rereads account status, current administrator flag and center ownership. Disabling an account or changing its password invalidates subsequent session requests; permission changes take effect on subsequent requests.

Sessions use 32 cryptographically random bytes in an opaque cookie. Only the token's SHA-256 digest is stored. Login replaces/revokes the previous session; logout deletes it server-side. Idle expiry is 30 minutes and absolute expiry eight hours. Cookies are HttpOnly, SameSite=Lax, path `/`, and Secure with the `__Host-` prefix in production. No trusted roles or session tokens live in browser storage. Implementation follows the request/session boundaries in the installed Next.js authentication/cookie documentation and [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Sign-in has persistent account-based and global attempt limits. All mutations require a matching Origin; JSON inputs have a bounded body size and strict schemas. Production requires an exact configured application origin. The local development fallback accepts only loopback hosts. A reverse proxy should additionally apply network-level login limits; untrusted forwarded IP headers are not treated as client identity. See [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Permissions and data isolation

| Current capability          | Administrator                                     | Ordinary dealer                                       |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| View center profiles        | Global workspace scope                            | Owned `(center_id, center_type)` links only           |
| Update center profiles      | Global scope, subject to environment write switch | Owned composite center scope, subject to write switch |
| Save/manage creation drafts | Own drafts                                        | Own drafts                                            |
| Inspect/revoke sessions     | Own account/mode only                             | Own account/mode only                                 |

There are no user-ID 4/5 exceptions. Existing page 7/8/9 grants are documented for the later reports/alerts/status features; they are not broadened into profile-write permissions. Accounting, Logging, center-user credential editing, activation changes, uploads, QR generation and gateway operations are not enabled by these grants.

The center repository repeats SQL ownership and active-account predicates. Profile writes lock and compare the current revision inside a SERIALIZABLE transaction and confirm the actual updated-row count through OUTPUT. Profile writes use a fixed allowlisted projection rather than the old procedure that ignored its actor argument. Domain, type, currency, input mode and timezone are not changed by a profile save. This avoids invoking account synchronization or QR side effects under an ordinary profile edit.

The SQL adapter uses the secure connection for cross-database queries on the same server, across the audited catalog names `icare_secure`, `icare`, `icare_school`. All values are parameters. Only validated enum choices select fixed ordering/catalog expressions. Production requires validated TLS and rejects sysadmin, db_owner and database CONTROL logins. The owner-confirmed development server now has an explicitly enabled local compatibility exception, with encryption still required; [chapter 09](09-live-connection-setup.md) describes the exact boundary. The old connection is not imported automatically by application requests.

## Persistent application storage

Server-local SQLite stores opaque sessions, rate-limit counters, private drafts and fictional demo centers. It does **not** mirror live center profiles or replace the existing iCare databases. The development launcher supplies its private default path at process startup; production must set ICARE_STORAGE_PATH explicitly. Mutable data is excluded from Next's source graph/output traces and verified with `npm run verify:build`. Production storage needs a private persistent volume with appropriate OS access controls/backups. Windows ACLs need deployment configuration; Unix file modes alone do not establish them.

This is a single-host deployment boundary. Multiple hosts require a shared session/rate-limit/draft store before deployment. Node 22.17's built-in `node:sqlite` works in the current runtime and is experimental; pin and validate the runtime when packaging, or replace the adapter with an approved shared store. [Node 22 SQLite documentation](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

Demo sessions carry a different mode and cannot call live-center endpoints. Production disables demo entry unless explicitly enabled. A valid demo session never becomes a live identity because SQL settings are present. Demo records and real drafts are separated by account and mode.

## Routes

| Route                                    | Behavior                                                 |
| ---------------------------------------- | -------------------------------------------------------- |
| `/login`                                 | Existing-account sign-in; optional explicit demo entry   |
| `/`, `/centers`, `/centers/{type}/{id}`  | Authenticated overview, directory and profile            |
| `/access`                                | Current permissions and sessions                         |
| `/api/auth/login`, `/preview`, `/logout` | POST only; Origin checked                                |
| `/api/auth/sessions`                     | GET own sessions; DELETE other own sessions              |
| `/api/centers`                           | Scoped GET with bounded search/filter/page/sort          |
| `/api/centers/{type}/{id}`               | Scoped GET/PATCH; strict revision/profile input          |
| `/api/center-drafts`                     | GET own drafts / POST new draft                          |
| `/api/center-drafts/{id}`                | PATCH revision checked / DELETE owned unpublished draft  |
| `/api/center-drafts/{id}/publish`        | Demo publication only; live returns PROVISIONING_PENDING |
| `/api/live/centers`                      | Requires a real iCare session; demo denied               |

API failures use sanitized codes/messages and a request ID. Application errors log only an ID and technical category/code; no centralized logging module or legacy logging pool was added.

## Configure real account access

Use `.env.local` privately, following `.env.example`. No real connection strings are provided in tracked files.

1. Configure `ICARE_SQL_SECURE` as `mssql` JSON for a **restricted** application identity on the representative integration server, with `options.encrypt=true` and `trustServerCertificate=false`. It needs the audited authentication procedure and required explicit read columns across Secure/Nursery/School. It must not be sysadmin/db_owner/CONTROL. Validate actual grants with the database owner.
2. Set `ICARE_LIVE_DATA_ENABLED=true`. Configure `ICARE_APP_ORIGIN` to the exact external origin; HTTPS is required for production cookie delivery. Verify the connection and account flows using authorized dealer fixtures.
3. Keep `ICARE_CENTER_WRITES_ENABLED=false` while validating reads. Enable it only for an approved test environment after profile-save/rollback/concurrency and audit requirements have been accepted. No SQL account/grant provisioning was performed by this implementation.
4. Set a private persistent `ICARE_STORAGE_PATH`. Configure proxy limits, storage ACLs/backups, operational monitoring and dependency failure behavior before deployment.

On 24 October 2026 the owner confirmed that the active configured endpoint is the development server. Private connection files now enable real dealer verification, scoped center reads and profile writes in local development. Node SQL connections to all three catalogs were verified encrypted; nonexistent credentials and absent-actor directory/detail/update requests were denied. Five Nursery centers and no School centers are present. No successful dealer-password login or real profile mutation was performed during connection verification; the owner can now test those flows through the UI. Production still requires the restricted validated-TLS setup above.

The owner subsequently requested a test dealer. That new ordinary dealer successfully signed in through the actual browser form, saw its one assigned center, and was denied another existing center. Its verification session was logged out. Credentials remain in a private ignored local file. This positive authentication/scope check changed only the new dealer and ownership rows, not center profiles; real profile mutation remains untested.

## Deferred scope

Accounting and Logging databases remain unavailable and their pools are explicitly blocked. Live provisioning is also deferred because center-type seeds conflict with routing, required references are empty, shared account creation propagates plaintext credentials and filesystem provisioning has not been migrated. Saving a real creation draft is supported; saving it never creates a live center.

Dealer account lifecycle and center-assignment editing were subsequently delivered in [chapter 10](10-dealer-administration.md), followed by existing center-user profile/secure-status management in [chapter 11](11-center-user-management.md). Center-user creation/password reset, arbitrary page-grant editing, branding/uploads, school-year provisioning, input-mode/QR changes, activation/alerts, transport, payment/gateway operations and activity exports remain later phases. Pending routes show a clear status and do not render fake working controls. No deployment or legacy-schema repair was performed.

## Verification

The focused unit/domain/security suite covers session hashing/expiry/revocation, throttling, draft ownership/revisions/idempotent demo publication, cross-center/type denial, profile conflicts, validation, Origin checks and blocked database roles. Desktop/mobile browser checks cover sign-in/demo separation, logout replay, filters, persistent edits, draft resume/publication, scoped dealer access, other-session revocation, drawer keyboard behavior and viewport containment.

SQL Server compiler-only metadata checks described seven statements successfully: all directory sort variants, detail read, active-dealer state and both profile update variants. The application statements themselves were **not executed**, and no customer rows or mutations were used for these checks. [Compiler-check evidence](generated/portal-query-checks.json). Runtime writes against SQL, shared-store deployment, real dealer workflows, MFA and full accessibility conformance remain unverified.

Final build, test and screenshot results are recorded in [the verification record](06-verification.md).

Visual references: [sign-in](preview-login.png), [desktop overview](preview.png), [mobile overview](preview-mobile.png), [directory](preview-centers.png) and [access/sessions](preview-access.png).
