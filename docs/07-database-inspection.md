# Database inspection and completed portal analysis — 21 October 2026

Historical inspection snapshot, before the owner resumed implementation. [Chapter 08](08-authentication-and-centers.md) records the subsequent authentication/center-management work and current configuration requirements. The inspection findings and two missing databases still apply.

The database follow-up is complete for the **three available catalogs**. Their schemas and stored code have been reconciled with the legacy portal. Accounting and logging remain unverified because those two databases are not available; the owner confirmed this during the review. Rebuild implementation remains paused. No application code, legacy configuration, database schema, reference data, or business records were changed.

This chapter supersedes the database-side unknowns in the initial source audit. It describes the **configured active endpoint**, whose relationship to the deployed production environment has not been established. It must not be treated as proof that the inaccessible production configuration has the same schema, seeds, or data.

## Access and evidence boundaries

| Configuration / database         | Inspection result                                                                                 | Meaning                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Active / `icare_secure`          | Connected; metadata and reference inspection completed                                            | Dealer identity, ownership, page grants, shared mappings and cross-database dependencies reviewed      |
| Active / `icare`                 | Connected; metadata and reference inspection completed                                            | Nursery/Lite contracts, provisioning, users, reports, alerts, gateway, transport and triggers reviewed |
| Active / `icare_school`          | Connected; metadata and reference inspection completed                                            | School variants and their differences reviewed                                                         |
| Active / `icare_accounting`      | Connection rejected with SQL 4060; absent from visible configured catalogs                        | Ledger tables, reference statuses, procedure internals and permissions unavailable                     |
| Active / `icare_log`             | Connection rejected with SQL 4060; absent from visible configured catalogs                        | Logging implementations, retention, schema and handling of credential arguments unavailable            |
| Production configuration variant | All five configured connections failed; native/network error 64                                   | No database claims can be made about this endpoint                                                     |
| Local configuration variant      | All four configured connections failed; native/network error 64; no logging connection configured | No database claims can be made about this endpoint                                                     |

Bounded TCP checks to the configured/default SQL port also failed for the two alternate endpoints. No port scan, credential guessing, configuration switching, or business procedure execution was performed. Endpoint addresses and credentials are intentionally omitted.

The scripts read connection strings directly from the old project into process memory. Queries were fixed `SELECT` statements against system catalogs/metadata functions, plus `TOP (100)` reads of explicitly named, non-personal reference tables. Row volumes came from partition metadata. `sys.dm_exec_describe_first_result_set_for_object` obtained compiler-described result columns without running application procedures. It does not prove runtime success or describe every possible later result set. See [Microsoft's metadata function documentation](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-exec-describe-first-result-set-for-object-transact-sql?view=sql-server-2017).

Connections requested `ApplicationIntent=ReadOnly`, short timeouts, no pooling and low deadlock priority. **ApplicationIntent is advisory, and the configured login is a sysadmin. Read-only behavior was enforced by the inspected query text, not a read-only SQL account or database.** Session `SET` statements affected only the inspection connections. No customer/child/dealer rows, passwords, tokens or key-table values were retrieved. No application scalar function, stored procedure, migration or repair was executed.

## Complete metadata inventory and review scope

| Catalog role    |  Tables | Procedures | Functions |   Views | Triggers | Table types | Foreign keys |
| --------------- | ------: | ---------: | --------: | ------: | -------: | ----------: | -----------: |
| Secure          |      21 |         48 |        14 |       4 |        0 |           1 |            7 |
| Nursery         |     401 |        739 |       118 |     149 |        2 |          29 |          214 |
| School          |     376 |        632 |       121 |     132 |        0 |          32 |          318 |
| Total available | **798** |  **1,419** |   **253** | **285** |    **2** |      **62** |      **539** |

All **1,959 module definitions** were visible; none in the available catalogs was hidden/encrypted. The inventory includes all table/view columns, parameter types/directions/lengths, indexes and unique keys, foreign keys and cascade actions, check/default/computed definitions, table types, static dependencies, synonyms, estimated row counts and anonymous permission/membership metadata. There were no synonyms in these three catalogs.

The portal-specific review traces **46 source procedure/function mappings** into a **116-object static dependency closure**, including tables, types and unavailable dependencies. **66 relevant module review copies** cover that closure's stored code plus authentication/compatibility helpers, other admin procedures and both triggers. The other applications' hundreds of unrelated procedures are cataloged; this is not a claim that every unrelated iCare workflow has been reverse engineered. Dynamic SQL, external consumers and deployed runtime behavior remain outside what a static dependency graph can prove.

Browse [the generated database evidence](generated/database/README.md), [source-to-database contracts and dependencies](generated/database/contracts-and-dependencies.json), and the role-specific schema, reviewed-module and result-contract JSON files in that directory. Raw working exports are under ignored `.local/db-audit/`. Public review copies withhold SQL string literals and are **not executable migration scripts**. Known secrets were masked before review export; credentials were not copied into the application.

## SQL environment and connection security

All three available catalogs report SQL Server **13.0.5108.50**, Standard Edition (64-bit), compatibility level 130, and `SQL_Latin1_General_CP1_CI_AS` collation. They are online, read/write and multi-user, with SIMPLE recovery. Snapshot isolation and read-committed snapshot are off. Auto-close, auto-shrink, TRUSTWORTHY and database chaining are off.

Each inspection connection used SQL authentication over TCP and reported **`encrypt_option=FALSE`**. The configured login reports **sysadmin, db_owner and database CONTROL**. These are observed connection facts, not merely missing encryption settings in a file. Combined with the concatenated SQL in the portal, this substantially increases the impact of a reachable injection flaw. No injection or exploit was attempted.

Use separate least-privilege identities, fixed allowed commands and validated TLS before live integration. Recheck cross-database execution after reducing privileges: success under sysadmin does not prove that the same procedure chain works under a restricted app identity. SIMPLE recovery is an observed setting, not evidence of missing backups; actual restore readiness and recovery objectives were not inspected. SQL Server 2016 extended support ended in July 2026; Extended Security Updates enrollment is unknown. Include an upgrade/support decision in infrastructure planning. [Microsoft lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/sql-server-2016).

## Authentication and shared account compatibility

`icare_secure.dbo.authenticateDealer` validates username, password and `is_active=1`; success sets authentication status 1 and outputs dealer ID / super-admin flag, failure sets -1. Dealer passwords are compared using `getHashedPassword`: **SHA2-512 of the NVARCHAR password concatenated with the GUID salt cast to NVARCHAR(36)**, returned as `BINARY(64)`. Salt creation uses `NEWID()`. This is a salted fast hash with no work factor in the reviewed function. The portal does not use the unrelated reversible VB encryption helper for this login.

The procedure contains no failed-attempt counter, lockout, MFA, session rotation or throttling. Those protections were not found in the Web Forms source either; an external proxy/service policy has not been checked. `isDealerSuperAdmin` and `dealerHasAccess` do not recheck `is_active`, so disabling an account is not by itself a demonstrated revocation mechanism for an existing ASP.NET session.

`Center_Users` is a different identity domain. Its hashed password and salt coexist with an operational `sec_users` row whose `Password` is `NVARCHAR(50)`. The reviewed creation/update code **writes the submitted password as plaintext into that local column** and synchronizes it with the secure account. This finding comes from code and column definitions; no stored password values were read. Secure IDs and local `center_user_id` are different keys and must be preserved together with center ID/type.

Important compatibility paths:

- Secure `authenticateCenterUser` returns a row containing ID, username, admin flag and center identity after hash and active checks. Its comments describe a 2025 change for a NestJS service, evidence of another consumer to locate before migration.
- Secure `addNewCenterUser` returns immediately when the username already exists, without throwing or returning a success output. The outer operational add-user procedure then reports success unconditionally. A local/global account mismatch is therefore possible; it was not induced during inspection.
- Operational `iCareAdmin_updateCenterUserInfo` accepts only a local user ID and profile/password fields, with no actor or center. It updates local data, calls secure `updateUserPassword` with administrative bypass enabled, ignores that nested result, and has no enclosing transaction. A reported success does not establish synchronization success.
- Secure `updateUserPassword` uses the existing salt, calls `Temp_updateLocalCenterUserPassword`, and passes **old and new passwords as arguments to `icare_log.dbo.record_userPasswordUpdate`**. The unavailable logging implementation prevents establishing whether/how it stores those values. The dangerous credential-bearing call itself is verified.
- Parent/child/provider authentication and password-update branches use direct password comparisons/assignment. Old operational `authenticateDealers` checks `AdminUsers.Password` directly and is distinct from the current portal's secure dealer login. Do not unify these formats or replace shared tables before consumer discovery.

Secure `iCareAdmin_getDealersList` requires super-admin but selects `*`: compiler metadata includes password hash, salt and access token as well as display fields. A new dealer-list DTO must select only the needed non-secret fields. Prefer organizational OIDC/MFA and invitation/reset flows; isolate any temporary legacy verifier and plan changes across the other consumers.

## Actual authorization model

Ownership lives in `secure.Dealer_Centers`; global privilege is `Dealers.is_super_admin`. There is also a real `Dealer_Page_Center_Access` table with a unique `(dealer_id, center_id, center_type, page_id)` key. Its page grants affect some lists independently of ordinary ownership. The `Admin_Pages` reference is empty on this endpoint, so page meanings below come from procedure usage, not populated page titles.

| Operation                                      | Verified database enforcement                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Ordinary center list                           | Super-admin sees all; others see linked centers                                                                          |
| Activity/summary center list                   | Owned centers plus page **7** grants for non-admin; all branches exclude type 4                                          |
| Alert center list                              | Owned centers plus page **8** grants for non-admin; includes Nursery/Lite and School                                     |
| Status center list                             | Owned centers plus page **9** grants for non-admin                                                                       |
| Activation write                               | Super-admin or ordinary ownership only; page 9 list access alone does not authorize the write                            |
| Alert update                                   | Actor parameter and computed admin flag exist, but flag is unused and requested center IDs are not filtered by ownership |
| Alert reset                                    | Explicit super-admin check in both operational procedures; unauthorized returns 0                                        |
| Gateway single read/write                      | No actor argument or ownership assertion; secure list excludes School                                                    |
| Center profile update                          | Dealer argument is unused; no SQL ownership check                                                                        |
| Center-user update/read                        | No actor ownership check; update targets local user ID, read targets center/type                                         |
| Dealer update                                  | No caller/actor parameter; target dealer ID is not authorization                                                         |
| Child/QR/profile media/location/bus operations | Actor absent or unused in the reviewed operation; selectors are insufficient as a write boundary                         |
| Payment operations                             | Unknown: accounting procedures unavailable                                                                               |

The home-page exceptions for dealer IDs 4 and 5 are additional UI conditions, not a complete representation of these grants. Define the approved replacement matrix using ownership **and** page-specific grants; do not copy numeric user exceptions or assume that seeing a row gives write permission. Account revocation, permission changes and background/download access need current server-side checks.

## Transactions, side effects and success contracts

| Workflow              | Verified behavior and failure boundary                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create center         | Both variants use TRY/transaction/rollback across operational center rows, secure dealer/domain mapping and initial user/roles. School also creates academic-year records. Nested SQL writes run in the same server transaction; filesystem template/image operations occur afterward and remain outside it. |
| Add center admin      | Creates local account, center-user link, roles and legacy menu grants, then the secure identity. The silent duplicate-username path described above can still permit inconsistent success.                                                                                                                   |
| Update center profile | No explicit transaction; dealer is unused; output 1 can be set even when no center row matched. Input-mode updates may be partially applied on failure.                                                                                                                                                      |
| Update center admin   | Local write and secure synchronization are not one encompassing transaction; nested output is ignored.                                                                                                                                                                                                       |
| Change activation     | Secure status is updated/upserted, then logging is called without a surrounding transaction. Missing logging can produce an error **after the status write committed**. This is inferred from stored code; no write was attempted.                                                                           |
| Publish alerts        | Each operational DB begins its own transaction, updates selected centers, calls the logging procedure and commits; catch rolls back and returns -1. Missing logging is expected to roll back that batch. VB invokes Nursery/School separately, allowing partial success across batches.                      |
| Reset alerts          | Super-admin only; delete/log in a per-database transaction; returns 1 success, -1 exception, 0 unauthorized.                                                                                                                                                                                                 |
| Gateway update        | Upsert by center ID; returns 1; no actor check or encompassing transaction. No unique center-ID constraint protects concurrent upsert.                                                                                                                                                                       |
| Export tracker        | Inserts center ID, admin user ID and UTC download time into `icare.Center_Invoicing`; this is **download history**, not posting an invoice or charging a customer. No month/year and no explicit return 1. The VB helper expects return 1, while its caller ignores the outcome.                             |
| Dealer update         | Create branch checks duplicate username and returns -5; normal success 1. Edit can report 1 for a missing target. No actor authorization; existing salt is reused for password changes.                                                                                                                      |

Logging availability is therefore a dependency of business actions, not only exception diagnostics. User/password update failures may also leave partial changes. The unavailable log catalog prevents inspecting the downstream implementation, but does not hide these callers' transaction boundaries. Do not enable these legacy writes on this incomplete endpoint to “test” them.

Adapters must distinguish output parameters, procedure return values and affected rows. `dbo.Element_ID_List` is present in Nursery/School with a nullable `INT ID` column; application input should reject null, duplicates and empty recipient lists rather than relying on this permissive type. The generated contracts record exact parameter types/lengths and compiler-described first result sets.

## Schema integrity, field limits and implicit behavior

The configured endpoint has incomplete/inconsistent reference seeds:

- `secure.Center_Types`: 1 = Nursery, **2 = School**. The portal and stored routing use School **4** and Lite **3**; neither exists in this reference table.
- The four secure user tables have enabled, trusted foreign keys to `Center_Types`. Inserting a School-4 center user would conflict with these observed seeds. This is a constraint-based inference, not an attempted insert. Do not silently remap types or add seeds.
- `secure.Admin_Pages` and `Center_Status_Reference` are empty. Both operational databases have empty `Input_Type`, `DwellDuration_Values` and `GeofenceRaduis_Values`.
- Currency reference rows are LBP (1) and USD (2). Accounting precision, allowed statuses and rounding remain unknown.

This endpoint can establish stored-code contracts but is not a representative acceptance environment until the owner supplies/approves reference data and the missing catalogs.

Other concrete schema constraints:

- Secure domains are `NVARCHAR(50)`. Operational `sec_users` username, password, first name, last name and email are `NVARCHAR(50)`, despite larger parameters in some outer procedures. Secure `addNewCenterUser` uses `VARCHAR(50)` password / `VARCHAR(450)` username, introducing an additional Unicode boundary. Validate the entire composed `username@domain` against the narrowest contract. Existing preview limits are provisional and must be reconciled before a live adapter is enabled.
- `Center_Users` has unique username and unique composite center/local-user/type keys. `Dealers` does not have a unique username constraint. Dealer-center links, center domains and center statuses lack unique logical composite keys; prechecks alone do not prevent races.
- `Center_Alert_Message` has a unique center ID and `NVARCHAR(250)` message. Bus settings have no unique bus-ID key; gateway settings have no unique center-ID key. Concurrency-safe updates require a reviewed database/service strategy, not blind reuse of the old upserts.
- Nursery `Class_Child` uses **Child_ID as primary key**. An earlier generic concern about duplicate class membership is not established there. School uses a surrogate class-child key and academic-year joins; its semantics must remain separate.
- All 539 foreign keys are enabled. **46 School foreign keys are not trusted**; Secure/Nursery have none untrusted. Existing rows were not checked for orphans, and no constraint repair was attempted. Enabled-but-untrusted does not establish whether actual orphan rows exist.
- Nursery `Care_Center.time_zone` is required with default **Africa/Cairo**. Its `TR_Care_Center_Time_Zone_History` trigger creates/closes UTC-effective history intervals on inserts/zone changes. Old center creation omits timezone, so the default and trigger apply implicitly. School has no corresponding profile column. Do not assign a portal-wide Beirut/server timezone to historical Nursery activity without a policy decision.
- Nursery's second trigger, `trg_SystemMenusNew_SyncToNursery`, synchronizes legacy menu definitions into Nursery menu pages. Shared menu/role tables are another consumer boundary when moving center-user provisioning.

## Activity, reports and QR behavior resolved by SQL

The ordinary bulk activity/summary list explicitly filters out type 4 in every branch, including super-admin. Its nursery-oriented export helpers are consistent with the **existing Nursery/Lite-only bulk scope**. School uses a separate academic-year class report. Adding School bulk exports is a new feature and needs a distinct contract.

Nursery class/child data uses requested month/year, clamps the last date to today, and uses current class membership. `requestAll=1` includes deleted children/parents/classes according to its query predicates. School variants use academic year; the generic `GetClasses` helper would pass three unsupported nursery month parameters if routed to School, but the dedicated School path uses `GetSchoolClasses`. School CowPay get/update and invoice-tracker procedures are absent; their normal list queries already exclude Schools. These are latent generic-helper mismatches, not proof of broken School features offered by those lists.

Activation history returns in-month events plus the most recent pre-month event. Codes **1, 2, 3, 5, 6** are selected; **Move 4 is excluded**. Restore 6 is normalized to Activate 2 or Deactivate 3 using `child_is_active_on_restore`, defaulting to active. Rows are ordered by transaction time with no secondary tie breaker. The VB interval rules, end-date exclusivity, future-month behavior and disagreement at five/zero days remain real concerns; the previous hypothesis that Move rows reach that calculator is resolved.

Unused 2024 Nursery procedures `iCareAdmin_getChildActiveDays` and `iCareAdmin_getCenterChildrenMonthlyActiveDaysStats` contain a database-side calculator using cursors/temp tables and the exclusive day difference, with non-demo buckets 1–5, 6–13, >13. The Web Forms source does not call them. Their existence neither resolves the HTML/export disagreement nor makes them an approved replacement. They were read as definitions only.

The School demo query defect remains in VB: undeclared parameter references and a missing expected `Demo` result column. Compiler metadata for the real School class procedures does not repair that separate inline query. Preserve current reports as characterization cases on a valid test dataset before approving rule changes; no child activity rows were read here.

`spGenerateChildQrCode` in both operational DBs computes a deterministic MD5 value from child/parent/center IDs via `getEncyrptedQrCodeValue`, then inserts QR/input rows only when no matching input association exists. The commented passphrase encryption is not the active implementation. There is no actor check or explicit encompassing transaction. The emitted identifier must not be treated as a modern random authorization token. Compatibility and scanning consumers must be understood before changing it.

Gateway reads return merchant hash/tokens and a SQL-literal callback URL. No provider call was made, no secret configuration row was read, and no callback URL was followed. The portal remains a configuration editor; the payment provider service belongs to another integration boundary.

## What is complete and what remains

The portal source, available schema contracts, password verifier, ownership/page grants, SQL transaction boundaries, triggers, field limits, reference inconsistencies, bulk-report scope and unavailable dependencies are now documented. The evidence supports keeping the prepared Next.js modular server architecture: it needs strict adapters, permissions and workflows, rather than a framework change or an inferred new database schema.

Before resuming live implementation, resolve these concrete inputs:

1. Supply `icare_accounting` and `icare_log` when available, then inspect them with the same read-only method. Verify ledger amounts/statuses/deletion/ownership and logger arguments/storage/retention; do not invent either schema.
2. Identify a representative integration environment and reconcile center-type/reference seeds with its owner. Confirm deployed schema/config differences and file/template storage.
3. Approve the replacement grant matrix and identity transition with the consumers of secure/local users, roles, domains and QR values. Remove plaintext credential propagation/logging through a coordinated change.
4. Decide activity buckets, zero-day treatment, interval/timezone rules, School report fixes and future School/Lite scope. Download tracking is now understood; whether to retain its exact semantics remains a product choice.
5. Establish least-privilege TLS connections, supported SQL lifecycle, backups/restore and audit availability before exercising live reads/writes in the new app.

No rebuild feature work was continued during this inspection. The existing sample preview and default-deny live boundary remain as prepared. Full five-database verification cannot be marked complete until the two missing catalogs are supplied.

## Reproducing the inspection

Run from the new project's root, using existing local configuration files; never paste credentials into commands or reports:

```powershell
$legacyPath = 'D:/Data/Projects/Appware/Visual Studio/iCareAdmin-Web'
powershell -NoProfile -File scripts/inspect-databases.ps1 -LegacyRoot $legacyPath
& ./scripts/export-database-metadata.ps1 -LegacyRoot $legacyPath -Roles secure,nursery,school
& ./scripts/inspect-database-contracts.ps1 -LegacyRoot $legacyPath
node scripts/analyze-database-metadata.mjs
node scripts/verify-preparation.mjs $legacyPath
```

The export/analyzer scripts were created for this review; they do not run as part of the web application. Re-running the first three commands opens new read-only inspection sessions. They should be used only for the authorized configured environment; they are not a connection-setting repair or a migration tool.
