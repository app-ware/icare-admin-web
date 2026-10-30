# iCare Admin Portal

Next.js rebuild and a source-backed migration dossier for the legacy iCare admin portal.

**Start with [the audit dossier](docs/README.md).** It maps every one of the 28 legacy screens, authentication/authorization, five SQL database roles, 59 database-access methods, reporting rules, files/integrations, findings, and implementation phases.

[The database follow-up](docs/07-database-inspection.md) covers the three available catalogs (798 tables, 1,419 procedures). [Phase one](docs/08-authentication-and-centers.md) implements existing-dealer authentication, server sessions, scoped center adapters, profile editing, saved drafts and an independent light-blue interface. Accounting/Logging remain pending.

[Dealer administration](docs/10-dealer-administration.md) adds administrator-only account creation, profile/status/role updates and center assignments, with review, conflict recovery and session revocation. Open **Dealers** with an administrator account; ordinary dealers retain center-scoped access.

[Center-user management](docs/11-center-user-management.md) adds scoped existing-user search, contact editing, secure sign-in status, local-role visibility and mapping diagnostics. User creation/password resets remain pending by the owner's decision. Open **Center users** or follow the shortcut from a center profile.

[Activity and reports](docs/12-activity-and-reports.md) adds authorized monthly activity, class/demo breakdowns, School academic years, multi-center Excel workbooks and per-account generation history. Open **Activity & insights** or **Reports**. These are activation aggregates, with counting rules displayed; no invoice or Accounting/Logging operation is performed.

[Center status](docs/14-center-status.md) adds scoped activation review, filters, confirmed changes and portal history. Dev status changes are enabled after disposable SQL fixture/rollback/recovery acceptance. The independent write switch remains off by default for other environments.

[Alert messages](docs/15-alert-messages.md) adds selected-center publishing, inclusive UTC expiry dates, administrator resets and private per-center batch results with safe retries. Dev publishing/reset is enabled after disposable SQL and browser acceptance. Open **Alert messages**.

[Center branding](docs/17-center-branding.md) adds private logo and main-photo uploads on each center detail page, with validated previews and atomic publication. The owner-approved dev switch is enabled. Existing iCare client image fields and URLs are unchanged.

[Creation draft branding](docs/18-draft-branding.md) adds both uploads to the center creation wizard, with save/resume, revision protection and atomic demo creation. Live center provisioning remains pending.

[Watermark uploads](docs/19-watermark-uploads.md) adds an optional transparent PNG watermark to center branding and creation drafts, with exact 1024 × 1024 validation and reviewed replacement/removal. QR generation remains pending.

[Location picker](docs/20-location-picker.md) adds optional click/drag/keyboard map selection to profiles and creation drafts, synchronized with manual coordinate entry. Development maps use OpenStreetMap after an explicit Load map choice; production defaults to manual entry until a provider is configured.

[Input modes and QR jobs](docs/21-input-mode-and-qr.md) adds scoped settings and reviewed demo changes, resumable private QR preparation, watermarks and verified PNG downloads. Live QR generation awaits scanner/storage acceptance; live mode changes have a separate disabled switch.

## Run the workspace

Requires Node.js 22.17+ (supported range in package.json). Dependencies and lockfile are included.

```powershell
npm ci
npm run dev
```

Open [the sign-in page](http://127.0.0.1:3000/login). Choose **Explore demo workspace** to try the dashboard, center directory, profile editor, five-step draft wizard with logo/photo uploads and access/session controls with fictional data. Demo changes persist on the server across refreshes. Switch the demo role to test a center operator's limited scope.

The owner-confirmed development SQL server is now configured privately for existing dealer sign-in and real center profile management. Sign in with your dealer credentials to use real data; the demo button continues to open fictional data separately. [Development connection setup](docs/09-live-connection-setup.md) records its local compatibility settings and verification limits.

Production continues to require validated TLS and a restricted SQL identity. Anonymous APIs return 401; demo sessions cannot access live endpoints. The app never accepts browser-provided live roles or falls back to demo data. The explicit bootstrap script reads the old configuration once; application requests use private server configuration.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run verify:build
npm run test:e2e
```

Browser tests use installed Chrome on macOS and Microsoft Edge elsewhere, on desktop and a Chromium mobile viewport. Set `ICARE_E2E_BROWSER_CHANNEL` to override the installed browser channel. They use an isolated output directory and demo store at 127.0.0.1:3101 and stop that test server when done. No browser binary download is required.

## Production build preview

```powershell
npm run build
$env:ICARE_PREVIEW_ENABLED = 'true'
npm start
```

Production requires sign-in, disables demo entry by default and requires an exact ICARE_APP_ORIGIN. Persist the private SQLite application store on a single host; use a shared replacement store for multiple hosts. This is not a validated live deployment: restricted SQL/account fixtures, deployment controls and remaining provisioning work are still required. See [phase one](docs/08-authentication-and-centers.md). The standalone output also needs its static/public assets when packaging.

## Re-run source analysis

```powershell
npm run audit:legacy -- "D:/Data/Projects/Appware/Visual Studio/iCareAdmin-Web"
```

This reads source and writes a redacted, line-referenced inventory under docs/generated. It never connects to SQL. `scripts/sql/discover-schema.sql` is a separate metadata-only staging discovery aid; it has not been run against any database.

The explicitly invoked PowerShell inspection scripts are separate from the web app and did connect to the authorized active endpoint for metadata/non-personal reference reads. Their scope and repeat commands are in [the inspection report](docs/07-database-inspection.md).

## Add future features

Use `src/features/registry.ts` for module ownership and routes, `src/domain` for business types/permissions, and `src/server` for identity, services and database adapters. Follow [the architecture](docs/04-rebuild-architecture.md). Do not move database logic or secrets into browser components, or use UI visibility as access enforcement.

Bus settings are available at `/transport`: owned-center buses, inherited defaults, reviewed overrides and separate demo persistence. Live bus writes remain disabled because dev reference tables/defaults are empty; see [the integration record](docs/16-bus-settings.md).
