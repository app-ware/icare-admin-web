# Saved center directory views

Rebuilt in the persistent project checkout on **26 November 2026**, after the original temporary checkout became unavailable. Open **Care centers → Center directory → My saved views**. This extends the directory in [chapter 08](08-authentication-and-centers.md) with private named filter preferences.

## Workflow

Choose a search, center type, activation status and sort order, then **Save current filters** with a name. Search text is captured immediately, even while the directory's debounce is pending. Views store those four filters only: page position, draft tabs, center IDs, profiles and result snapshots are excluded.

Select a view and **Apply view** to fetch current accessible results at page one. Selection alone does not change filters. Applied filters remain in the existing URL after refresh; selected view identity is not persisted or inferred from URL parameters. A message explains whether current filters match the selected view.

**Update view** reviews and replaces its name and filters with the current directory filters. **Remove view** leaves current filters intact and moves the preference into **Recently removed views**. Restore does not apply filters. Keep up to twenty active views and the twenty most recently removed views per account/mode. Removed views can be restored for up to thirty days; older removed entries may be purged sooner when the archive limit is reached. Restore rechecks active capacity and name uniqueness. A reused active name must be renamed before its archived predecessor can be restored.

Loading, empty, error/retry, saving, stale and restore states are explicit. A stale editor disables Save and offers **Close and refresh views**, requiring a new review. Directory reads remain available if preferences cannot load. Failed or uncertain mutations are never automatically replayed. A create retry keeps its client-generated UUID; a changed initial payload must use a new creation attempt.

## Access and storage

All endpoints load the existing verified opaque session and require `centers.read`. Live session verification rereads stored account activity and current grants. Demo service calls also check the current stored demo identity. Every preference lookup/mutation binds UUID, dealer and mode; administrator status never bypasses ownership. Applying a view uses the existing scoped directory API and repository. Retaining a filter after an assignment is revoked never restores access to that center.

Private SQLite stores names, strict filter JSON, opaque revisions, creation/update/removal instants and an initial-create fingerprint. Names reject control/formatting characters, normalize with NFKC and collapsed whitespace, and are limited to sixty characters after normalization. Active names are case-insensitively unique per owner/mode. React displays names/search as plain text; they are not logged. Responses use the existing no-store envelope.

Repeated creation with the original canonical payload returns the current owned record without overwriting later edits. A different payload or removed UUID fails. Updates, removal and restore compare/rotate opaque revisions atomically, including after values return to an earlier state. Immediate SQLite transactions protect quotas, names, mutations and owner-only archive pruning. Limits are twenty active views, twenty archived views per actor/mode, fifty thousand records globally and thirty mutation requests per actor/mode/minute. Capacity failures do not evict other accounts or active views. Expired archive cleanup is scoped to the current actor/mode.

No operational SQL statement, procedure, seed, credential, account role, center grant or legacy Logging integration is changed. Saved preferences do not require an operational write switch. Multi-host deployment needs a shared preference/session store; private names/search text must be included in backup/privacy retention review. Expiry does not erase backups.

## API

- `GET /api/center-views`: owned active and recently removed preferences.
- `POST /api/center-views` with `{id, name, filters}`: idempotent creation.
- `PATCH /api/center-views/{id}` with `{revision, name, filters}`: reviewed replacement.
- `DELETE /api/center-views/{id}` with `{revision}`: recoverable removal.
- `POST /api/center-views/{id}/restore` with `{revision}`: restore.

Mutations require matching Origin and bounded JSON. Unknown body/filter/query fields are rejected. No caller-selected actor, mode, URL, database, center list or arbitrary sort expression is accepted.

## Verification

Nine new domain/security groups verify canonical/strict payloads and Unicode limits, create replay after edits, owner/mode/admin isolation, revoked capability/account denial, unique names, stale/ABA changes and restore, archive expiry/pruning, current directory scope, atomic failure, throttling and global capacity. The complete combined suite has 92 passing tests. HTTP acceptance verifies anonymous/Origin/query/body/method denial, ownership, safe retries and stale/remove/restore outcomes; a separate existing dev-account session verifies scoped reads and private preference CRUD/restore without operational SQL mutation. Browser checks cover save/apply/reload/update, two-tab conflict recovery, removal/restore and desktop/mobile layout. See [verification](06-verification.md) for final build and persistence evidence.
