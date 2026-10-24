# Live connection setup — 24 October 2026

The owner confirmed that the active `ConnectionStrings.config` endpoint is the **development server**. Its three available catalogs are now privately configured for local Next.js dealer sign-in and center profile management. Accounting and Logging remain pending.

A read-only connection probe using the active Secure connection requested `Encrypt=true;TrustServerCertificate=false`. It failed with SQL/native error **-2146893019**, classified as **certificate authority untrusted**. No raw connection error, endpoint, credentials or business rows were printed. The failure establishes a certificate trust problem; it does not establish whether the certificate's hostname and expiration are valid after trust is resolved.

The earlier audit established that its existing SQL identity is sysadmin/db_owner/CONTROL. For the requested development integration, an explicit local compatibility switch permits this identity and its untrusted certificate. This is a development exception, not a production security assessment. SQL traffic is still encrypted. No SQL users, permissions, certificates or business records were changed.

## Local configuration and verification

`scripts/configure-development-sql.ps1` reads the active legacy configuration once, verifies the explicitly supplied development target, and writes ignored `.local/development-sql-{role}.json` files for Secure, Nursery and School. Credentials never enter dotenv values or browser bundles. It refuses to overwrite an existing `.env.local`. The app itself never reads the old project files.

Private `.env.local` enables live data, profile writes, `ICARE_DEV_SQL_COMPATIBILITY`, an exact `ICARE_DEV_SQL_SERVER`, loopback `ICARE_APP_ORIGIN`, and private JSON paths. JSON paths and the compatibility exception work only with `NODE_ENV=development`, a loopback application origin and an exact SQL server match. Production cannot enable this exception by setting the switch. Encryption remains mandatory in every mode. The development launcher binds the portal to loopback.

The application's `mssql` driver successfully connected to all three catalogs, and each SQL session reported `encrypt_option=TRUE`. Nonexistent credentials were rejected by the actual dealer verifier; an absent dealer was rejected by state loading. Runtime directory queries in all three sort modes returned no records for an absent actor with forged service-layer grants, and Nursery/Lite/School detail/update attempts returned not found. These negative fixtures never created an authenticated session, impersonated a real dealer or changed business records.

The dev server contains **five Nursery centers and no School centers**. The Nursery metadata now reports 402 tables/three triggers, compared with 401/two at the historical audit. The only trigger on `Care_Center` remains the reviewed timezone-history trigger; School has none on that table. No seed repair was performed. Real sign-in still requires the owner's existing dealer credentials, entered in the browser; successful login and a real profile save have not been claimed as verified without those credentials.

## Production preparation

For production, the database administrator needs to provide a certificate-valid SQL hostname and its approved CA chain, or configure the SQL endpoint with a certificate already trusted by the application runtime. The Node SQL driver must validate both the CA chain and hostname. A private approved CA can be supplied to Node through `NODE_EXTRA_CA_CERTS` at process startup after its identity is verified. A .NET probe alone is not proof that Node's trust store accepts the same certificate.

For production application access, create a fresh dedicated SQL login `icare_portal_app`, then review [the prepared grants](../scripts/sql/portal-app-grants.sql). The script has **not been executed**. It maps that login into the three available catalogs, grants authentication/hash-function execution and needed read columns, and permits updates to nine center-profile columns. The dealer-administration increment adds account inserts/allowlisted updates and ownership-link inserts/deletes, as recorded in [chapter 10](10-dealer-administration.md). It grants no administrator role, database CONTROL, center provisioning/domain/type changes, or Accounting/Logging access. The server-side actor and composite center checks continue to enforce scope. Review inherited/public grants separately; this script cannot certify the server's existing public permissions.

After production provisioning, configure the dedicated login with validated TLS using the existing `ICARE_SQL_SECURE` JSON setting, validate effective permissions and account workflows, and enable profile writes as required. Existing creation drafts do not provision live centers because the audited reference-data conflicts remain unresolved.

Accounting and Logging remain pending and their application pools remain blocked.
