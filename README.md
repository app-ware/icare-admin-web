# iCare Admin Portal

Next.js rebuild and a source-backed migration dossier for the legacy iCare admin portal.

**Start with [the audit dossier](docs/README.md).** It maps every one of the 28 legacy screens, authentication/authorization, five SQL database roles, 59 database-access methods, reporting rules, files/integrations, findings, and implementation phases.

[The database follow-up](docs/07-database-inspection.md) covers the three available catalogs (798 tables, 1,419 procedures). [Phase one](docs/08-authentication-and-centers.md) implements existing-dealer authentication, server sessions, scoped center adapters, profile editing, saved drafts and an independent light-blue interface. Accounting/Logging remain pending.

[Dealer administration](docs/10-dealer-administration.md) adds administrator-only account creation, profile/status/role updates and center assignments, with review, conflict recovery and session revocation. Open **Dealers** with an administrator account; ordinary dealers retain center-scoped access.

[Center-user management](docs/11-center-user-management.md) adds scoped existing-user search, contact editing, secure sign-in status, local-role visibility and mapping diagnostics. User creation/password resets remain pending by the owner's decision. Open **Center users** or follow the shortcut from a center profile.

## Run the workspace

Requires Node.js 22.17+ (supported range in package.json). Dependencies and lockfile are included.

```powershell
npm ci
npm run dev
```

Open [the sign-in page](http://127.0.0.1:3000/login). Choose **Explore demo workspace** to try the dashboard, center directory, profile editor, four-step draft wizard and access/session controls with fictional data. Demo changes persist on the server across refreshes. Switch the demo role to test a center operator's limited scope.

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

Browser tests use installed Microsoft Edge on desktop and a Chromium mobile viewport. They use an isolated output directory and demo store at 127.0.0.1:3101 and stop that test server when done. No browser binary download is required.

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
