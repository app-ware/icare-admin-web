# iCare portal rebuild dossier

Source and read-only database review: **21 October 2026**. Source: `D:/Data/Projects/Appware/Visual Studio/iCareAdmin-Web`. Rebuild: `D:/Data/Projects/Appware/Node/icare_admin_portal`.

The source is an ASP.NET Web Site using VB.NET Web Forms and ADO.NET. The audit covers all **28 page/code-behind pairs**, shared application code, custom browser scripts, configuration structure, dependency declarations, and local filesystem/reporting integrations. The reproducible index contains **59 SQL-access methods and 28 distinct literal stored-procedure names**, including procedures used in multiple databases with different signatures. These are source counts, not a count of objects on a live database server.

The generated evidence also indexes **743 server-control declarations** and counts **39 static image assets**. Preview captures: [desktop](preview.png) and [mobile](preview-mobile.png).

The subsequent authorized database inspection covers **Secure, Nursery and School: 798 tables and 1,419 procedures**, plus functions, views, triggers, constraints and permissions. **Accounting and Logging are not available**, as confirmed by the owner. [The database inspection](07-database-inspection.md) records verified behavior and remaining limits. The owner then resumed authentication, permissions and center management; [phase one](08-authentication-and-centers.md) is the current implementation record.

## Read in this order

1. [Current system and every screen](01-current-system.md): functional inventory, workflows, state, fields, reports, and inactive code.
2. [Authentication, authorization, and findings](02-access-and-security.md): actual behavior, evidence, severity, and required changes.
3. [Data and integrations](03-data-and-integrations.md): five database roles, contracts, money/date handling, files, Maps, CowPay, and operational concerns.
4. [Rebuild architecture](04-rebuild-architecture.md): framework decision, modular boundaries, API design, UI behavior, identity strategy, and extension conventions.
5. [Delivery and acceptance plan](05-delivery-plan.md): sequenced implementation, characterization cases, migration controls, and unanswered questions.
6. [Generated inventory](generated/legacy-inventory.md) and [machine-readable evidence](generated/legacy-inventory.json): page controls, handlers, source references, SQL-call parameters, model declarations, navigation, configuration key names, and source fingerprints.
7. [Database inspection](07-database-inspection.md) and [generated database contracts](generated/database/README.md): available schema inventory, stored-code review, security/transaction findings and unavailable dependencies.
8. [Verification record](06-verification.md): preparation checks and database-inspection validation. [Schema discovery SQL](../scripts/sql/discover-schema.sql) remains a separate staging discovery aid.
9. [Authentication and center management](08-authentication-and-centers.md): current light-blue UI, existing-dealer verifier, session/permission boundaries, center profiles/drafts, configuration and remaining live-integration limits.
10. [Dealer administration](10-dealer-administration.md): administrator-only dealer creation, lifecycle, center assignments, session revocation and live rollback verification.
11. [Existing center-user management](11-center-user-management.md): scoped rosters/profile edits, secure sign-in status, role/mapping visibility, protections and explicitly deferred credential operations.
12. [Activity and reports](12-activity-and-reports.md): monthly class/demo aggregates, versioned counting rules, page-7 report scope, School academic years and aggregate XLSX generation/history.
13. [Remaining features and delivery order](13-remaining-features.md): current legacy-parity gaps, partial workflows, dependencies, deferred work and production-readiness requirements as of 24 October 2026.

14. [Center status](14-center-status.md): scoped activation reads, page-9 viewing, confirmed changes, revision protection, local receipts and a separate disabled live-write gate.

15. [Alert messages](15-alert-messages.md): page-8 read scope, owner/admin publication, administrator resets, inclusive UTC expiry and owned per-center batch outcomes/retries.

16. [Bus settings](16-bus-settings.md): scoped bus overrides, catalog defaults, validated lookup IDs, revision checks and missing-reference guards. Live bus writes remain disabled pending reference review and acceptance.

17. [Center branding](17-center-branding.md): validated logo/main-photo uploads, owned private previews, atomic publication and mode-separated private portal image delivery. Legacy client folders and URLs are unchanged.

18. [Creation draft branding](18-draft-branding.md): logo/main-photo uploads in the five-step wizard, owned saved attachments and atomic transfer during demo creation. Live provisioning remains pending.

19. [Watermark uploads](19-watermark-uploads.md): private PNG watermarks on centers and creation drafts, exact dimensions, preserved transparency and reviewed revision-protected removal. QR generation remains pending.

20. [Location picker](20-location-picker.md): optional interactive map with click/drag/keyboard selection and synchronized manual fields, explicit external loading and existing scoped saves. Production maps default off.

## What has been verified

- The code's execution paths, database selection, form handling, validation, known side effects, and access checks have been reviewed statically.
- The current working copy was used, including pre-existing changes to `App_Code/objClassChildrenActivity.vb`, `CenterReport.aspx`, `CenterReport.aspx.vb`, connection configurations, `Web.config`, and the solution. The legacy project was left untouched.
- Stored definitions, permission branches, parameter/first-result metadata, transaction boundaries, triggers, indexes and estimated table counts were inspected on the configured active endpoint's three available catalogs. No business procedures were executed; data accuracy, runtime outcomes and deployed IIS/production behavior remain unverified.
- No customer/user record retrieval, migration, credential rotation, payment operation, reference-data repair or file cleanup was performed. No connection secrets or Maps keys were copied into the rebuild. Metadata and bounded non-personal reference reads used the existing connection files in memory.

## What is prepared in the new project

A protected Next.js/TypeScript workspace with an independent light-blue interface, existing iCare dealer verification, opaque expiring/revocable sessions, scoped permission checks, server-backed center directory/profile editor, owned persistent creation drafts and a separate persistent fictional demo. The owner-confirmed development server is now privately configured for sign-in/reads and profile writes; [chapter 09](09-live-connection-setup.md) records verification and the explicit local compatibility boundary. Production needs restricted validated-TLS SQL settings. Accounting/Logging and live provisioning remain unavailable. Other audited destinations clearly indicate pending features.

**The rebuilt production portal is not complete.** Source/database analysis and the first authentication/center-management implementation are reviewable. Full five-database verification and live end-to-end acceptance remain incomplete; see phase one for exact boundaries and the delivery plan for later modules.

## Evidence conventions

References such as `App_Code/DML.vb:1817` refer to one-based lines in the reviewed legacy working copy. `generated/legacy-inventory.json` includes file SHA-256 fingerprints so future changes can be detected. Observed defects are distinguished from risks that require runtime confirmation. Commented code, unused models, and disabled UI are not treated as working features.

Regenerate the static index from this project's root:

```powershell
npm run audit:legacy -- "D:/Data/Projects/Appware/Visual Studio/iCareAdmin-Web"
```

This does not contact a database. Do not publish legacy configuration files or the generated SQL module-definition exports without reviewing them for sensitive content.
