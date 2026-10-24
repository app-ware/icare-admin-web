# Existing center-user management — 24 October 2026

The owner confirmed dealer management works and requested center-user management while keeping Accounting and Logging pending. After reviewing the audited plaintext compatibility requirement, the owner explicitly chose to keep **center-user creation and password resets pending**. This increment implements existing-user management without using those credential paths.

## Delivered workflows

- `/users` and the Center users navigation item provide a center-scoped roster. The center picker searches only accessible centers, preserves center ID/type together, and supports pagination. Center profiles also link directly to their users.
- Search existing users by first/last name, secure/local username or email. Filter secure sign-in status, administrators, other secure users and mapping-review accounts. Pagination, result totals, refresh, retry and empty states are implemented. Changing centers clears the previous roster while the new one loads.
- Edit first name, last name and email, each within the inspected 50-character column limits. Optional cleared values become NULL; unchanged null/empty contact values are preserved. Saves require a review and the current revision. Stale edits offer an explicit reload, and changed forms warn before being discarded.
- Review secure/local usernames, local and secure IDs, secure administrator flags and local role names. These fields are read-only. Roles outside the selected center are labeled without exposing another center's role name.
- Enable or disable **secure database sign-in** on an unambiguous linked account. This controls `icare_secure.dbo.Center_Users.is_active`; it does not claim to revoke existing JWTs, refresh tokens, legacy Web Forms sessions or local-password client access. The editor and review explain this boundary. At least one enabled, linked administrator must remain in the center.
- Local-only users can have their profiles edited without inventing a secure account or activation state. Missing local users, duplicate secure mappings/usernames and shared/conflicting links are read-only. Protected super-admin center accounts require a portal administrator, even when an ordinary dealer owns the center.

There is no enabled create, delete, password-reset, username-change or role-assignment operation in this module. The POST creation route is unavailable, and credential/identity/role fields in update bodies are rejected. No center-user password, hash, salt or token is selected, returned, displayed or written by the management queries.

## Scope and mapping rules

`users.manage` follows the existing composite center ownership grants: a portal administrator has global scope, while an ordinary dealer has only their owned `(center_id, center_type)` pairs. Pages and APIs verify sessions; every service checks the capability. SQL repeats active-dealer and current ownership/administrator predicates and verifies that the selected center exists with its actual type. Demo services recheck their stored fictional actor and assignments.

The roster starts with operational `sec_users` records belonging to the selected center through `center_id`, explicit `secCareCenterUser` membership, or an unambiguous secure mapping when the local center field is NULL. A secure record that points to a missing/out-of-scope local user is represented as a read-only secure account without reading another center's local contact details. Local IDs are not globally unique across catalogs; source-prefixed user keys are always bound to the selected center ID/type.

All supported mappings for the same local identity are checked for sharing. Unsupported/NULL secure center types are also treated conservatively because their operational identity cannot be inferred safely. A duplicate secure username or mapping blocks editing instead of selecting an arbitrary account. No seed repair, automatic remapping, ownership reassignment or role synchronization is performed.

The development data currently has **37 secure accounts referencing unsupported or unavailable centers**. Administrators see that count separately; those records are not silently attached to a supported center. Ordinary dealers do not receive the global count. Within-center mapping issues remain visible in that center's roster. Counts describe this environment on the verification date, not a universal data requirement.

## Persistence and configuration

Live saves use one SERIALIZABLE transaction on the Secure connection across the operational profile and secure status row. The relevant administrator/account/mapping rows are locked, revisions are checked, and both updates confirm their row counts. Only `Firstname`, `Lastname`, `Email`, and, when explicitly changed, secure `is_active` can be written. The old `iCareAdmin_updateCenterUserInfo`, `updateUserPassword`, password-sync helpers and Logging procedures are not called.

`ICARE_CENTER_USER_WRITES_ENABLED=true` enables this narrow write surface separately from center/dealer changes. It is enabled privately for the owner-confirmed development server. Production still requires the restricted SQL identity and validated TLS from chapter 09. The reviewed application-grant script adds only needed non-credential reads, local profile-column UPDATE and secure status-column UPDATE for this module. It has not been applied to the server.

Private SQLite storage adds fictional existing users and operation receipts. Live receipts contain operation/actor/center IDs, user key, action, outcome and times, with no contact values or credentials. An intent precedes SQL changes; confirmed outcomes finish the receipt, while uncertain commits remain unconfirmed for reconciliation. This is not a replacement for the unavailable Logging module or a complete enterprise audit service.

Roster reads are bounded to 5,000 accounts and 25,000 role links per center before filtering/pagination. Larger centers receive an explicit capacity error rather than silently truncated data; a SQL-side paging adapter is needed beyond that boundary. Current development centers are well below these limits.

## Verification and limits

- All **24 domain/security/unit tests** and **12 desktop/mobile browser checks** pass. The new cases cover profile persistence, secure status changes, review, stale revisions/reload, last-administrator protection, local-only records, mapping-review read-only states, protected accounts, forged role claims, cross-center/type denial, strict mutation payloads and unavailable creation.
- Live scoped roster/detail reads ran across all five available Nursery centers. The exact transaction commands changed a profile and secure status, rejected stale/absent-actor/ambiguous/last-administrator cases, and were rolled back. The original user DTO matched afterward. No live credentials, usernames or roles were changed. [SQL verification evidence](generated/center-user-sql-checks.json).
- School and Lite denial-query variants compile against the actual available catalogs. There are no live School/Lite center fixtures here; positive School behavior is covered in the isolated demo, not claimed as live acceptance.
- The existing tables involved have no enabled triggers in the inspected environment. Future schema/trigger changes require revalidation. Other applications and their caches/sessions are outside this portal's revocation boundary.
- A stale generated development cache caused refresh loops during initial browser checks. The generated cache was archived and regenerated without touching portal storage or live data; the subsequent full browser run passed. Build and browser checks are run separately for the final evidence.

Accounting, Logging, center-user creation/password reset, arbitrary roles, center provisioning and legacy credential migration remain deferred.

Visual references use fictional records: [desktop roster](preview-center-users-desktop.png), [mobile roster](preview-center-users-mobile.png), [desktop editor](preview-center-user-editor-desktop.png), [mobile editor](preview-center-user-editor-mobile.png).
