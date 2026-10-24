# Databases, contracts, integrations, and operations

## Connection topology observed in source

`ConnectionDataAccess.vb:16` reads five logical connection strings. The active Web.config references `Configurations/ConnectionStrings.config` and `Configurations/AppSettings.config`, with `WebServerRules.config` for rewrites. Production variants exist but are not the active sources in this working copy. File names alone do not establish what is deployed.

| Logical connection              | Observed database catalog | Purpose / selection                                                                                               |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| iCareSecureConnectionString     | icare_secure              | Dealer login/roles, dealer-center lists, shared currency/status references, center-user lookup and domain mapping |
| iCareNurseryConnectionString    | icare                     | Nursery and Lite center data; used for accounting-center activity lists and invoice tracker                       |
| iCareSchoolConnectionString     | icare_school              | School center/class/academic year data                                                                            |
| iCareAccountingConnectionString | icare_accounting          | Ledger rows, statuses, payment add/update/delete                                                                  |
| iCareLogConnectionString        | icare_log                 | record_adminWebErrorLog; falls back to configured local error file                                                |

`OpenConnection()` uses secure DB. `OpenConnection(type)` uses school only when type=4; all other values, including Lite and invalid values, route to nursery. New code must **reject invalid types** and preserve the Lite compatibility route intentionally. Independent pools are required; a single global connection pool cannot select the correct DB reliably. Credentials, hosts, usernames, and keys are deliberately omitted here.

Current config variants use SQL authentication, do not request driver encryption, and some use Persist Security Info. The local variant lacks the log connection even though the constructor always reads it; switching active config may fail before any query. The authorized follow-up connected to the active Secure/Nursery/School catalogs and observed unencrypted TCP sessions with a sysadmin login. Accounting/Logging are absent and the owner confirmed they are unavailable; alternate configuration endpoints were unreachable. See [the complete database inspection](07-database-inspection.md).

## Database contract inventory

The generated JSON/Markdown lists all 59 SQL-access methods, parameter declarations, source lines, SQL fragments, and table-valued types. This summary groups the 28 distinct literal procedure names. Identical names on Nursery and School are separate contracts until schema inspection proves otherwise.

| Area / DB role                                  | Procedures and functions                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity / secure                               | `authenticateDealer`, `iCareAdmin_updateDealer`, `iCareAdmin_getDealersList`, `iCareAdmin_getDealerCenters`; scalar functions `isDealerSuperAdmin`, `isCenterDomainAvailable`, `getCenterDomain`                         |
| Status / secure                                 | `iCareAdmin_getCenterStatusesList`, `iCareAdmin_updateCenterActivationStatus`                                                                                                                                            |
| Gateway / secure list + operational detail      | `iCareAdmin_getCentersCowPayApiSettings`, `iCareAdmin_getCenterCowPayApiSettings`, `iCareAdmin_updateCenterCowPayApiSettings`                                                                                            |
| Alerts / secure list + operational writes       | `iCareAdmin_getDealerCentersAlertMessage`, `iCareAdmin_updateCenterAlertMessage`, `iCareAdmin_resetCenterAlertMessage`                                                                                                   |
| Center / operational                            | `iCareAdmin_addCareCenter`, `iCareAdmin_updateCenterInfo`, `iCareAdmin_getCenterChildren`, `spGenerateChildQrCode`                                                                                                       |
| Center users / secure read + operational writes | `iCareAdmin_getCenterAdminUser`, `iCareAdmin_addCenterUser`, `iCareAdmin_updateCenterUserInfo`                                                                                                                           |
| Activity / nursery or school                    | `iCareAdmin_getUserAccountingCentersList` (Nursery), `iCareAdmin_getCenterClassesData`, `iCareAdmin_getCenterClassChildren`, `iCareAdmin_getChildLatestActivationTransactions`, `iCareAdmin_updateCentersInvoiceTracker` |
| Ledger / accounting                             | `iCareAdmin_getCentersPaymentsList`, `iCareAdmin_updateCenterPayment`, `iCareAdmin_deleteCenterPayment`                                                                                                                  |
| Error logging / log                             | `record_adminWebErrorLog`                                                                                                                                                                                                |

Direct-query objects observed include `Dealers`, `Currency`, `Center_Status_Reference`, `Center_Users` (secure); `Care_Center`, `Academic_Years`, `Child`, `Parent`, `Class`, `Class_Child`, `Child_Transactions`, `Input_Type`, `Center_Child_Input_Type`, `Bus_Type`, `Bus_Settings`, `DwellDuration_Values`, `GeofenceRaduis_Values` (operational); and `Payment_Status` (accounting). [Generated live metadata](generated/database/README.md) now supplements this source list with the complete available object/column/key catalogs and portal dependency closure. Accounting objects remain source-only evidence.

Verified relationships include Dealer→Dealer_Centers ownership plus Dealer_Page_Center_Access grants, operational Center→classes/buses/users, Child→Parent/Class_Child, and secure Center_Users→local center_user_id with center/type. Nursery Class_Child has Child_ID as PK; School uses a surrogate key with academic-year semantics. Profile/domain/status/bus/gateway logical uniqueness is not uniformly enforced. All three catalogs' key/cascade/index/view/dependency metadata is exported; there are no synonyms. This does not establish customer-data integrity or accounting relationships.

## Procedure differences and return semantics

- Dealer authentication returns multiple outputs; page ignores output isAdmin and looks it up separately.
- Most writes use `@updateStatus` output, some use SQL **return value**, and direct updates return affected-row count. These meanings cannot be unified by truthiness. General response enum maps failure=0, success=1, unauthorized=-1; payment delete also has a status 2 branch without an implemented message. Discover each SP's actual code and normalize explicitly.
- Bulk alerts and download tracking use verified operational `dbo.Element_ID_List` with a nullable `INT ID` column. A helper can construct center_id/center_type rows, but that helper is not passed as an observed TVP. Reject null/empty/duplicate recipients in the service rather than copying the permissive SQL type.
- Nursery class/child procedures accept centerID, month/year, requestAll (and classID for children). School variants take academicYearID instead. Wrong signature/database selection must fail before execution.
- `iCareAdmin_addCareCenter` includes academicYearID only for School, output centerID, output updateStatus, credentials and currency. Both inspected variants transact operational rows, secure mappings and initial users together. Subsequent filesystem provisioning is outside SQL. A nested duplicate-username return can still permit incomplete identity provisioning.
- `iCareAdmin_updateCenterUserInfo` receives userID, password, first/last name, email, output status, but not username, actor, or centerID. The VB method accepts centerID but doesn't pass it. Ownership must be asserted separately.
- CowPay single get/update omit actor. Update uses return value; get uses centerID on the operational DB. All secret-bearing results must be contained server-side.
- Invoice tracker accepts userID and centersList but no month/year. Its definition inserts UTC download history into Center_Invoicing; it does not post billing. It has no explicit return 1 despite the helper's success test. Preserve or deliberately redesign export delivery audit rather than inventing a financial mutation.
- Error logging includes class/function/line/error/additionalData, but `trace.GetFrame(trace.FrameCount-1)` can be missing, and logger fallback can also fail. Never depend on log DB availability for successful user-facing operations.

## Value normalization

Use positive integer IDs and validated enum types at all boundaries. Keep centerID/type together even when the legacy SP only needs one. Treat currency/status/input mode IDs as lookup IDs, not meanings invented in code. Keep source database casing/aliases inside adapters.

Money must use a reviewed decimal precision/scale (for example DECIMAL after checking existing values) and a decimal string or exact decimal representation in transport. The foundation validates decimal strings without floating-point conversion. Amounts from different currencies must never be added into one total. Determine currency fraction digits before choosing rounding behavior; LBP/USD/etc. are not all interchangeable contracts.

Use ISO dates for date-only due dates/expiry; use UTC instants for event timestamps and display a configured timezone. Do not parse locale-dependent strings in services. Activity day counting needs an agreed civil-date timezone, inclusive/exclusive boundaries, leap-year handling, transaction ordering/tie breaks, and policy for future requests. Preserve legacy outputs as comparison fixtures before changing rules.

Nursery now has a required `Care_Center.time_zone` defaulting to Africa/Cairo and a history trigger; School has no corresponding profile column. Domain and local username/password/name/email are limited to 50 characters despite wider outer parameters; the composed username must fit. These verified limits supersede assumptions based on UI fields or preview validation.

Legacy center locations are **longitude,latitude** strings. The DB read reverses them for Google Maps. The new domain uses named numeric latitude/longitude fields and an explicit serializer/parser; never split into positional numbers and guess their order. Validate latitude [-90,90], longitude [-180,180], finite values, negatives, and missing coordinates.

## Files and third-party integrations

| Integration               | Current behavior                                                                                                     | Migration requirement                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Maps JS SDK        | Hardcoded client keys; creation uses gmap.js, editing uses editMapScript.js; dragging and click update hidden fields | Decide provider/billing/domain-restricted browser key; accessible manual coordinates; never reuse old embedded key silently                                |
| PhotoServer / PhotoFolder | Public URL base separated from local filesystem root; school/nursery directories and center folder IDs               | Private authorization-aware access for sensitive child media; branding may be public by policy; preserve external consumers/URLs during transition         |
| Template 00000 tree       | Copied wholesale when a center is created                                                                            | Inventory live template contents; version templates; idempotent provisioning with manifest and ownership                                                   |
| Branding uploads          | Logo, center photo, fixed watermark; direct local writes                                                             | Per-draft objects, decode/re-encode approved images, bounded byte/pixel sizes, signed access, retention/rollback                                           |
| QR generation             | DB issues code; QRCoder renders PNG with optional watermark                                                          | Review identifier sensitivity; bounded background job, retries, avoid public enumeration, prevent duplicate processing                                     |
| Excel exports             | ClosedXML local temp XLSX; class sheets and center summary                                                           | Service/job export with explicit progress/status/download authorization; stream or short-lived storage; exact formatting/data parity fixtures              |
| CowPay                    | Configuration CRUD only; callback URL displayed from DB                                                              | Identify separate callback/service owner; document live/staging secret lifecycle, environment switching, current API and webhook contract before extending |
| WCF                       | Empty DoWork, metadata over HTTP enabled in source                                                                   | Retire from new app unless an external consumer is identified                                                                                              |
| Logs                      | SQL error procedure, file fallback, child-name activity log                                                          | Structured redacted telemetry, trace IDs, immutable business audit, retention and access policy                                                            |

The photo enum also names child, provider, album/photo, notifications, events, menu, medical report, pickup, homework, evaluation report, image data, shared links, QR, and sponsor folders. These indicate shared asset taxonomy, not functioning admin pages for each category. `resizeFactor`, compressExtension, children-download settings and unused helper models require consumer review before removal.

## Database evidence and remaining discovery

No maintained SQL schema/procedure repository was found in the supplied application. The subsequent user-authorized inspection closed that gap for the three reachable catalogs: 798 tables, 1,419 procedures, 253 functions, 285 views and two triggers inventoried, with portal-related definitions reviewed. All module definitions were visible. [Chapter 07](07-database-inspection.md) records the scope, findings and reference-data mismatch.

`scripts/inspect-databases.ps1`, `export-database-metadata.ps1` and `inspect-database-contracts.ps1` performed fixed system-metadata and bounded non-personal reference reads using existing configuration in memory. No business procedure ran. `analyze-database-metadata.mjs` creates redacted schema/contract/review evidence from ignored local exports. `scripts/sql/discover-schema.sql` remains an alternative discovery aid; that separate SQL file was not executed. Module text can contain secrets and belongs in private working storage; public review copies withhold literals.

Accounting/Logging schemas and code remain unavailable. Obtain them when supplied, plus representative sanitized test fixtures, grant examples for two dealers/admin and expected reports. The active endpoint's incomplete seeds are not adequate acceptance fixtures. The web application still never reads the legacy connection files or auto-connects; only the explicitly invoked inspection scripts do so.

## Operational baseline needed before cutover

Capture actual hosting topology and deployment procedure; SQL versions, network/TLS and backup/restore drill; DB principal privileges; stored jobs and external integrations; filesystem permissions and available capacity; busiest grids/export sizes; session timeout and concurrency; report/alert timezone; monitoring and log retention; and downstream apps depending on shared credentials, center domains, IDs and file URLs. These are explicit discovery tasks in the delivery plan, not verified characteristics of production.
