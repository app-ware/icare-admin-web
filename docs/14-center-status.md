# Center activation status

Implemented on **24 October 2026**; dev status writes enabled with owner authorization on **25 October 2026** after disposable-fixture SQL acceptance. Open **Center status** (`/status`) with an existing dealer or fictional demo session. The configured development connection supports reviewed owner/admin changes. The write switch remains off by default in other environments.

## Delivered workflow

- Search by name, domain or ID; filter by center type and status; sort and paginate. Administrators can filter by assigned dealer. Filters survive reloads in the URL.
- Review the center's stored activation and the last 20 portal change receipts, scoped by identity mode and composite center ID/type.
- Owners and administrators can choose a different status, enter a reason and confirm the reviewed change when writes are enabled. Conflicting revisions require reloading current state. Canceling a dirty form prompts before discarding it.
- Show explicit loading, empty, error, retry, view-only and disabled-write states on desktop and mobile.

Activation is separate from dealer enablement, center-user secure sign-in and gateway configuration. External client enforcement and external-session revocation are unverified; this workflow does not claim either.

## Verified contract and authorization

The legacy `App_Code/enums.vb` defines `CenterStatus.Active=1` and `Inactive=0`. These are center status values, separate from activity event codes. The audited `icare_secure.dbo.Center_Status` contains `ID`, `center_id`, `center_type`, `activation_status` and `update_time`; the reference table is empty and there is no unique composite center constraint. No seeds or schema constraints are repaired automatically.

The legacy status list assumes an absent record is active. The rebuild displays that as **No stored status** and explains the legacy assumption. Duplicate rows, a null value in an existing row or a value other than 0/1 produce **Needs review** and block changes. Nursery=1, Lite=3 and School=4 remain separate even when IDs match.

Every request loads a verified session and checks a named capability. Status reads include currently owned centers, current administrators, and the legacy page-9 center grant. Page 9 adds status viewing only; it does not authorize status changes, profiles, users or reports. Writes require current ownership or current administrator access, with actor activity and ownership rechecked under transaction locks. Neither request fields nor menu visibility supply authorization. Demo access is recalculated from its separate stored identity and assignments.

## Write and receipt boundaries

`ICARE_STATUS_WRITES_ENABLED=true` is a separate live-write switch, off by default and explicitly enabled in the private local development configuration after the acceptance checks below. No other write switch was changed. Existing center/dealer/user switches do not enable status changes. Production additionally requires the existing validated-TLS/restricted-identity controls. `scripts/sql/portal-app-grants.sql` includes the reviewed narrow status column permissions; this script has not been applied.

The old `iCareAdmin_updateCenterActivationStatus` writes and then calls unavailable Logging outside a transaction. The new adapter does not call it. It uses fixed parameterized statements in a serializable transaction, locks/rechecks the active actor, ownership and status rows, compares an opaque revision, and updates or inserts exactly one status. Requests have a bounded SQL driver timeout. Empty/duplicate/unrecognized data is handled explicitly rather than guessed from UI labels. Existing profiles, reference data, user credentials and gateway settings are unchanged by a status save.

SQLite stores the reason, actor display name, old/new codes, center ID/type, mode and operation state outside the web root. Demo state and its receipt commit atomically; a monotonic version rejects stale changes even when status returns to its previous value. Live mode persists an intent before writing, marks commit attempts unconfirmed, and records confirmed completion separately. SQLite and SQL do not share a transaction: crashes or uncertain commits can leave preparing/unconfirmed receipts. The UI tells the user to reload rather than replay a change blindly, and confirmed SQL success with missing history confirmation is reported distinctly. Receipts are local portal evidence, not the pending central Logging service. A shared replacement store, retention/backup policy and operational reconciliation are required for deployment across multiple hosts.

## Verification and remaining acceptance

`tests/status.test.ts` covers status codes, unknown/ambiguous data, strict schemas, page-9 isolation, composite scope, current stored identity, stale/replayed edits, monotonic revisions, receipt atomicity, missing-state creation and the disabled live-write gate. `tests/e2e/status.spec.ts` exercises review/confirmation, history, URL filters, conflict reload, owner writes, view-only grants, cross-type denial, CSRF, invalid requests and anonymous access in desktop/mobile Chrome with a dedicated fictional store and live SQL disabled.

The 33 domain/security tests, 20 desktop/mobile regression checks and final four status checks passed. TypeScript, the production build and privacy verification of 39 traces/standalone output passed. Final directory and review screenshots were inspected. Rapid mobile input is preserved and search requests are debounced.

Read-only dev acceptance returned five accessible Nursery centers, all with no stored status row; the assigned-dealer filter returned one center for the current account. Directory, type/status/sort filters and scoped detail returned 200. A valid change request returned 503 `STATUS_WRITES_DISABLED`, and the independent verification session was signed out. No live status row or legacy logging procedure was changed/executed during this implementation.

### Authorized dev acceptance — 25 October 2026

The owner explicitly requested testing and enabling development status changes. The separate `scripts/verify-status-development.ts` runner requires an explicit development runtime, `--development-only`, the exact confirmed server/loopback compatibility configuration and the audited encrypted connection. It is never imported by runtime requests. Its fixtures are clearly marked minimal test records, not complete live center provisioning. No initial users, credentials, domains, files or reference repairs are created. The fixture-only ordinary dealer rows have no password/salt/token and cannot sign in.

[SQL acceptance evidence](generated/status-sql-checks.json) records:

- Committed Nursery/Lite/School status inserts and owner/admin updates, read-back, local receipts and stale-replay rejection.
- Denial of forged administrator claims, inactive actors, revoked ownership and incorrect center types. The dev `Admin_Pages` lookup lacks page 9, so its foreign key prevents creating a live page-9 fixture. That missing reference was left untouched. Positive page-9 viewing/write denial remains covered by domain/demo browser tests.
- Duplicate/null/unrecognized status records block changes. A serializable rollback restores the exact prior revision. Two different actors competing for the same fixture wait on locks, then the stale writer is rejected.
- A receipt-store outage before intent or after the SQL update rolls back the SQL change. Simulated lost acknowledgement after an actual SQL commit produces an unconfirmed receipt; reloading finds the persisted status, and repeating the same status is rejected. A receipt-confirmation outage after successful SQL commit returns success with history confirmation unavailable.
- All SQL fixture centers/dealers/statuses/assignments and their trigger-created timezone history were removed. Server-side SHA-256 fingerprints of existing centers, noncredential account fields, status rows, ownership, grants, timezone history and reference tables matched afterward. Identity sequence values may advance after fixture inserts; no reseeding was performed. Fault-injection receipts use separate private SQLite files.

After SQL acceptance and the domain/security/build checks passed, only `ICARE_STATUS_WRITES_ENABLED` was changed to `true` in `.env.local`, and the loopback preview was restarted. The authenticated in-app browser confirmed an inactive status save on desktop and an active save at 390×844, with both recorded as confirmed in portal history. These writes targeted one additional disposable dev fixture. Its cleanup and baseline comparison are recorded in the private browser-fixture manifest. Normal portal receipts for these test operations are retained; the removed fixture is inaccessible in the directory. Screenshots are private under `.local/status-dev-*.jpg`.

To repeat the SQL acceptance, stop concurrent business edits and use:

```sh
NODE_ENV=development node --conditions=react-server --import tsx scripts/verify-status-development.ts --development-only --run
```

`--prepare-browser-fixture` / `--cleanup-browser-fixture` are an explicit paired workflow. Clean up the prepared fixture after browser testing. The runner guards cleanup using its exact marker, IDs and credentialless actors; it never restores/overwrites other users' concurrent edits. It can require the existing privileged dev connection to create/remove fixtures; success does not certify the unprovisioned restricted production identity.

Production rollout, other legacy clients' activation enforcement/external-session revocation, complete historical change records and Accounting/Logging integration remain unverified. User creation/password resets remain deferred.
