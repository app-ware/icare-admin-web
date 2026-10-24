# iCare rebuild context

Read `docs/README.md` and the relevant audit chapter before implementing a module. The legacy working copy was analyzed as supplied; do not alter the separate legacy repository as part of routine rebuild work.

Read `docs/07-database-inspection.md` and `docs/08-authentication-and-centers.md` before live integration. The user resumed authentication, permissions and center management using existing iCare dealer accounts, with an independent light-blue theme. Accounting/Logging remain pending. Active reference seeds conflict with routing, so live provisioning remains unavailable. Keep inspection scripts separate from application runtime; do not repair seeds automatically.

- Protected Next.js/React/TypeScript workspace: legacy dealer verifier, opaque sessions, scoped center adapters, profile editor, owned creation drafts and separate persistent demo data. Read chapter 08 for tested behavior and remaining integration limits.
- Chapter 10 records delivered administrator-only dealer creation/lifecycle/center assignments. Recheck the stored active administrator for every operation, preserve self/last-admin protections and revisions, and keep the separate dealer-write switch. Account DTOs never include credential columns. On 24 October 2026 the owner explicitly authorized promoting icare.test to administrator on the dev server; this was applied and browser-verified. Do not silently change its role again.
- Chapter 11 records existing center-user roster/profile/secure-status management. The owner explicitly kept creation and password resets pending. Do not read/write center-user credential columns or call old credential-sync/logging procedures. Preserve usernames and roles, composite center scope, mapping-review read-only guards, last linked administrator protection and the separate center-user-write switch. Secure status does not revoke legacy-client access or external sessions.
- Chapter 12 records activity/report reads and in-memory XLSX exports. Preserve the versioned exclusive-calendar-end/legacy Excel bucket policy and visible assumptions; reports are not attendance or invoices. Page-7 grants add Nursery/Lite report scope only. Keep child/parent details out of DTOs/workbooks, recheck scope before delivery, and preserve School academic-year separation and bounded generation. SQLite generation receipts are separate from pending Logging. User creation/password resets, Accounting and Logging remain pending.
- Keep center ID and type together. Nursery=1, Lite=3, School=4. School and nursery procedures can have the same name with different parameters.
- Keep SQL, secrets, trusted sessions, and integration code in `src/server`, marked server-only. No arbitrary SQL/procedure/database selection from requests.
- Live features require a verified session, an explicit capability, and center scope at the server operation boundary. Menu visibility and numeric dealer-ID exceptions are not authorization.
- Preserve default-deny access. Demo sessions must never select live repositories. Production SQL requires verified TLS and restricted privileges; profile writes need a separate switch. The owner confirmed the active configuration as the dev server on 24 October 2026. Its explicit local compatibility mode permits the existing identity and certificate only under NODE_ENV=development, loopback application origin and an exact configured server match; SQL encryption remains required. Read chapter 09. Never make production silently use demo data.
- SQLite holds sessions, limits, owned drafts and fictional demo centers outside the web root. Preserve ownership, optimistic revisions, expiry and mode separation. Use a shared replacement store before deploying across multiple hosts.
- Do not infer SQL schemas, password formats, money rounding, activity buckets, or procedure success semantics from UI field names. The unresolved decisions are in `docs/05-delivery-plan.md`.
- Update `src/features/registry.ts` when changing module ownership. Its coverage test maps all 28 legacy screens exactly once.
- Run the relevant domain/security tests and build for behavioral changes. Use the desktop/mobile browser checks for affected flows; the preview must remain explicit about what is implemented.
- User-facing messages and audit logs must not expose passwords, SQL credentials, provider tokens, connection errors, or child PII.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
