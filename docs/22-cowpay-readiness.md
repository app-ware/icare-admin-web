# CowPay configuration readiness

Delivered on 30 October 2026 at **CowPay readiness → Review setup**. This is a read-only review of stored configuration for authorized Nursery and Lite centers. It does not call CowPay, initiate payments, register callbacks, replace credentials or change enablement. School gateway scope remains pending.

## Verified contracts and scope

The audited secure `iCareAdmin_getCentersCowPayApiSettings` excludes School. Nursery `iCareAdmin_getCenterCowPayApiSettings` returns raw merchant code/hash and live/staging tokens plus a SQL-literal callback. Its update procedure has no actor assertion or encompassing transaction, and its table has no unique center-ID constraint. Neither legacy procedure is called by this implementation. The similarly named `CenterCowPay.aspx` remains owned by the center-status module; only `CenterCowPaySettings.aspx` belongs here.

`integrations.read` follows current owner/administrator composite center scope. Numeric dealer 4/5 exceptions and page-only 7/8/9 grants confer no gateway scope. `integrations.manage` remains denied. Every directory/detail operation checks a verified principal and explicit capability; live SQL repeats stored active-dealer and ownership predicates, and demo operations reload the stored actor/assignments. Detail references accept types 1/3 only. Demo sessions never select a live repository.

The new SQL projection selects center ID/type/name, aggregate row/type consistency, enablement, update time and four credential-presence flags. Raw credential values, partial masks, lengths, hashes and customer defaults are not returned to Node or the browser. Presence treats NULL/empty/space-only values as missing; it does not validate credential syntax. There is no request-selected database, procedure, projection or dealer identity. Search is parameterized and LIKE-escaped; sorting uses fixed allowlisted expressions.

## Reading the result

- **No settings stored:** no row exists. Credential presence is false, while enablement remains unknown rather than being silently treated as disabled.
- **Stored fields complete:** merchant code/hash and at least one environment token are present. Live/staging completeness is shown independently and does not imply gateway validity, active environment or payment success.
- **Missing credential fields:** a consistent record exists but neither environment has all required fields.
- **Needs review:** duplicate rows, a NULL/mismatched stored center type, unknown enablement or invalid observation metadata. Ambiguous rows are never combined into apparently usable credentials; their flags remain unknown.

The legacy enablement flag is shared and is distinct from center activation. There is no verified live/staging selector in this settings contract, so the UI offers none. Last-update timestamps are displayed in UTC under the audited writer's `GETUTCDATE()` contract; this does not establish the time policy of unreviewed external writers.

Search, Nursery/Lite type, setup, stored enablement and sorting filters persist in the URL. Pagination is bounded to twelve rows; filtered totals are returned even for an empty later page. Summary cards count stored field completeness in the current filtered scope, not verified integrations. Current SQL statement boundaries can observe concurrent external changes between totals and page reads; refresh to compare current state. Malformed/extra/duplicate directory query parameters are rejected. Detail reads accept no query parameters. Anonymous API reads fail with 401; unsupported mutation methods return 405.

## Callback review and environment configuration

The old SQL-literal callback is not imported or displayed. An operator can configure a public callback URL with `ICARE_COWPAY_CALLBACK_URL` and explicitly mark ownership/consumer review with `ICARE_COWPAY_CALLBACK_REVIEWED=true`. Without that marker, metadata says pending and returns no URL. Reviewed URLs must use HTTPS, contain no embedded credentials, query or fragment, and stay within 2048 characters. Invalid configuration returns a safe review state without echoing the value. The reviewed address is plain text with an explicit Copy action; no automatic navigation or request occurs.

This marker records operator review only. Callback registration, reachability, signature validation, provider API versions and delivery remain separate acceptance work. Demo callback state always remains pending, irrespective of live configuration. No provider secrets are added to environment templates or client bundles.

## Demo, storage and deployment

Fictional metadata includes both-environment completeness, staging-only setup, absent settings and duplicate-row review. SQLite stores only synthetic presence/enablement metadata, never merchant credentials or a live configuration mirror. Existing demo centers and assignments remain persistent and scoped. This read-only feature needs no write gate or business-operation receipt and does not complete pending Logging.

Dev uses the existing owner-confirmed SQL compatibility boundary. Production still requires validated TLS and restricted privileges. The existing grant proposal has not been applied or expanded for CowPay; review an owner-managed presence projection or appropriate column privileges before deployment. Do not grant access to secret columns automatically, broaden School support, copy the old callback or enable legacy writes as part of this review.

The installed Turbopack **development** preview repeatedly refreshed during browser acceptance; Webpack stayed loaded with the same feature and private store. The development launcher now defaults to supported `--webpack`, retaining explicit `--turbopack`/`--webpack` overrides. The underlying Turbopack refresh cause remains unconfirmed. No SQL transport/security setting or production bundler default changed.

## Verification

Seven new test groups cover independent environment/enablement states, missing/ambiguous references, strict queries, callback redaction, owner/page/numeric-ID scope, demo filtering/pagination and current stored actor revocation. [Disposable SQL acceptance](generated/cowpay-sql-checks.json) verifies Nursery/Lite projections using fake credentials and credentialless fixtures, with rollback and unchanged settings metadata fingerprints/center/account/link counts. The first aggregate form hit SQL Server's outer-reference restriction; the corrected projection passes. Existing secret values were not returned and no provider request occurred.

HTTP acceptance covers anonymous/scoped access, strict selectors, boolean-only credential DTOs, filtered totals, out-of-range pagination and mutation-method denial, plus live dev reads with a separate test-account session. Those sessions were signed out. Browser acceptance verifies live missing-state detail, filter/history/reload/reset, fictional staging-only and duplicate-row states and responsive layouts. Full results are recorded in [verification](06-verification.md).
