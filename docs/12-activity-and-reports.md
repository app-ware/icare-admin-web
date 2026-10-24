# Activity and reports — 24 October 2026

The owner confirmed center-user management works and requested activity/reports, keeping **user creation, password resets, Accounting and Logging pending**. This increment reads the available operational catalogs and generates aggregate workbooks. It does not change operational records, post invoices, call the old invoice tracker or connect to Accounting/Logging.

## Delivered workflows

- **Activity & insights** (`/activity`): search accessible centers by name/domain/ID; filter type/status and, for administrators, assigned dealer. Choose a month and, for School, an academic year. Nursery/Lite can include/exclude currently deleted memberships. Search, pagination, refresh, loading, empty, retry and permission errors are handled.
- View unique center totals, class distributions and All/Non-demo/Demo groups. Zero days and unresolved records have separate columns. Class totals may overlap when one record belongs to multiple classes; center totals count it once. Data-quality counts and expandable counting rules explain assumptions.
- **Reports** (`/reports`): select up to 20 Nursery/Lite centers across catalog pages, including inactive centers. Generate a three-sheet XLSX: Center summary, Class breakdown and Report rules. School has a separate, single-center academic-year workbook available from its activity view.
- Review the account's last 20 generation requests, including failures, and generate again with current data and permissions. “Generated” means the workbook was prepared; browser storage/delivery is not claimed as confirmed.
- Both screens use the independent light-blue portal design and responsive layouts. The class table scrolls within its container on narrow screens. Changing a period clears old results, and delayed responses cannot overwrite a newer selection or navigation.

Workbooks contain center/class labels and aggregate numbers, with no child names, child/parent identifiers, dates of birth or contact data. Class/center strings are XLSX text cells, even when they begin with formula characters. Numeric count cells remain numeric. No workbook is retained on the application server: a fresh authorized request produces an in-memory download.

## Explicit counting policy

The version is `activation-calendar-v1`. These are **activation counts, not attendance, billing amounts or an invoice**. The old HTML and Excel disagree at five days; this implementation consistently follows the old Excel ranges: **1–5, 6–13 and 14+ days**, with zero separate. It includes all groups rather than silently dropping zero activity from the UI/workbook.

The interval starts on the first calendar date and ends at the earlier of the database's current date or the month's last date, **with the ending date excluded**, preserving legacy `DateDiff` semantics. A completed 31-day month therefore has a maximum of 30 days; leap February has 28. Future months are rejected. Recorded calendar dates are preserved without inferring a historical timezone conversion; `GETDATE()` supplies the live cutoff. This does not resolve the legacy Nursery timezone-history policy for future attendance/billing work.

No applicable activation history means the full interval is assumed, even for a newly created record. The UI/workbook count that assumption explicitly. Membership and demo flags reflect the current stored roster, not a reconstructed historical roster. Nursery/Lite use Add/Activate/Deactivate/Delete and Restore normalized by its active-on-restore bit (NULL means active); Move is excluded. School follows its audited Add/Activate/Deactivate-only contract, requires the selected academic year and excludes deleted child/parent/class records.

The latest event before month start and all relevant in-month events determine state changes. Same timestamp/same normalized state collapses; conflicting states remain unresolved. School's legacy prior-event query excluded the last day of the preceding month; the new adapter includes that date when finding the latest prior event. That correction is recorded in the workbook, rather than claiming byte-for-byte legacy parity.

Parent and class must both belong to the selected center. Duplicate class/child memberships collapse. Undated activation histories and histories pointing to another center make the record unresolved. Legacy NULL-center events for an otherwise scoped member are included and counted as centerless events. Future in-month events are ignored and flagged. These guards avoid returning another center's membership or treating data errors as zero activity.

## Authorization and data boundary

`reports.read` and `reports.export` are explicit capabilities. Administrators can report across supported centers. Ordinary dealers can report on owned composite ID/type pairs plus existing **page-7 grants for Nursery/Lite** from Secure. Report-only grants do not expand center-profile, user-management or School access. No page grants or reference seeds are created in SQL by this implementation.

Every request verifies the opaque session and reloads dealer state, assignments and report grants. Services check capabilities; fixed SQL repeats current active-dealer and administrator/ownership/page-7 conditions. Report reads use a SERIALIZABLE read transaction, and exports recheck every selected center before delivery. Demo sessions use only fictional SQLite data and recheck the stored fictional actor; a report-only Lite fixture tests that boundary.

Only audited columns are selected from `Class`, `Class_Child`, `Child`, `Parent`, `Child_Transactions` and `Academic_Years`. Numeric child IDs are used privately for joins/calculation and never serialized into the report DTO. No arbitrary SQL/catalog/procedure comes from a request. SQL reads are bounded to 10,000 unique class/child memberships and 200,000 relevant events per center; excessive input produces a capacity error, with no silent truncated report. A workbook is limited to 5,000 class rows across up to 20 centers, and generation is limited to six requests per account/mode per minute. SQL lock waits are bounded; errors use the portal's redacted response envelope.

These are bounded synchronous exports, not a background queue. Each center is read consistently on its own; a multi-center export is not one cross-center database snapshot. The private SQLite store keeps actor/mode, center references, parameters, state and timestamps, without child data or workbook bytes. An interrupted process can leave a “Preparing” receipt; there is no durable-job recovery or retained historical file. “Generate again” recalculates under current access. A shared store/queue and agreed retention are later deployment work. This generation history is separate from the pending Logging integration.

The review-only production grant script includes narrowly selected activity columns and the page-grant read. It has **not been executed**. Production still requires restricted SQL credentials and validated TLS; chapter 09's explicit local development compatibility exception is unchanged. There is no new operational write flag because this feature has no operational SQL writes.

## Verification and remaining limits

- **30 unit/domain/security tests** pass, including boundary days, leap/current/future months, restores, latest prior state, same-time conflicts, future events, deduplication, overlapping classes, demo conservation, strict export inputs and forged/revoked report access.
- **16 desktop/mobile browser cases** pass across the final suite and targeted reruns. New cases cover scoped activity, draft/reload state, late-response protection, metadata/history recovery, real XLSX downloads, history isolation, batch constraints, Origin denial and School academic-year selection. Existing center/dealer/user/session flows also pass. Mobile checks use Edge/Chromium emulation, not physical Safari devices.
- Live read checks passed across all five available Nursery centers, including empty activity and 2,001 eligible records in one center. An absent actor with forged grants was denied, and report DTOs contained no child-level fields. Nursery and School query variants passed SQL system-compiler metadata checks. There are no live School/Lite centers here; positive School/Lite behavior is demonstrated only with fictional fixtures.
- The optimized production build, type checks, **36 output traces** plus standalone privacy checks, anonymous-route/API production smoke and dependency audit pass. ExcelJS 4.4.0 writes XLSX; pinned `uuid` and Azure MSAL dependency overrides resolve advisories in the installed tree. Existing SQL-password authentication/connections were verified after that dependency change; Entra authentication is not implemented or claimed.
- Existing-account browser verification, screenshots and sanitized SQL evidence are recorded in [the verification record](06-verification.md). Historical business-output acceptance, larger-load performance, timezone-policy changes and production deployment remain outside this development increment.

Fictional visual references: [activity desktop](preview-activity-desktop.png), [activity mobile](preview-activity-mobile.png), [reports desktop](preview-reports-desktop.png), [reports mobile](preview-reports-mobile.png).

User creation, password resets, Accounting, Logging and live center provisioning remain pending.
