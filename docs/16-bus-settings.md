# Bus settings

Implemented on 25 October 2026 at `/transport`, replacing `iCareBusSettings.aspx`. The feature selects a scoped center and registered bus, displays current configuration and its source, reviews an override, saves with confirmation, and can remove an override to restore a valid inherited default. Search, type and pagination use URL state. Desktop and 390-pixel mobile flows were checked in the local browser.

## Verified legacy contract

The reviewed legacy source at `4bee1247adeb7a0794eaf996268c88cc3a092465` binds **lookup IDs**, not physical values: `geofence_raduis_id`, `dwell_duration_id` and `input_type_id`. `Bus_Settings.geofence_raduis`, `dwell_duration` and `passenger_input_type` contain these IDs. Labels and ordering values come from `GeofenceRaduis_Values`, `DwellDuration_Values` and enabled `Input_Type` rows. Units are never inferred from an ID. Bus membership comes from `Bus_Type.bus_type_id/center_id`; tracking `Bus` rows and driver/child/location details are not queried.

Nursery (1) and Lite (3) share the fixed `icare` catalog; School (4) uses `icare_school`. A bus override wins over `bus_id=-1`, which is a **catalog-wide** default, not a center default. The portal never changes that global row. Missing settings remain unconfigured, without inventing a default. Missing/duplicate/invalid reference choices, ambiguous effective settings and dangling/null stored choices block editing. A valid explicit override can remain usable even if an unused global default is ambiguous; restoring inheritance requires exactly one valid default.

## Authorization and writes

`transport.manage` belongs to active administrators globally and ordinary dealers for owned composite center keys only. Page 7/8/9 grants add no transport access, and numeric dealer exceptions grant nothing. Every endpoint validates strict inputs; writes require the same application Origin and a fresh verified session. SQL repeats current active ownership/admin predicates and verifies the bus belongs to the selected center and type. Demo operations reread stored roles/ownership and cannot select SQL.

Live writes require `ICARE_TRANSPORT_WRITES_ENABLED=true`, independently of all other modules. It defaults to false. SQL mutations use fixed parameterized projections inside SERIALIZABLE transactions, lock actor/ownership, center/bus, settings ranges and current reference rows, compare an opaque revision and verify one affected row plus readback. Duplicate settings have no unique SQL key, so this locking strategy protects portal mutations; arbitrary external writers remain a deployment concern. No legacy write/logger procedure is called. Production grant guidance is review-only; wrappers could further restrict SQL-level writes to positive bus IDs.

SQLite stores mode-separated bus revision generations and minimal operation receipts. The generation and an unconfirmed intent are persisted before SQL commit; successful commit finalizes the receipt. Lost commit acknowledgement is explicitly unconfirmed and requires reloading, with no automatic write retry. Confirmed SQL saves remain reported as saved if the receipt or subsequent read fails. Demo changes, revisions and receipts are atomic. Portal generations prevent return-to-default ABA for portal saves. External clients changing a row away and back without changing its identity cannot be distinguished by this legacy schema; a database version column/shared writer protocol is needed for stronger cross-client guarantees. SQLite receipts do not replace pending central Logging and need the existing single-host storage boundary/retention review.

## Development data and acceptance

The owner-configured dev server currently has ten Nursery buses and no School buses. Both operational catalogs have **no bus settings/defaults and no dwell/radius/input choices**. Live browsing is available, but changes remain disabled. No lookup seeds were repaired or populated persistently. Business-reviewed reference data and committed disposable-fixture/public-boundary acceptance are required before enabling this switch.

`scripts/verify-transport-development.ts --development-only`, under explicit `NODE_ENV=development`, validates the configured encrypted dev connection. It refuses populated reference/settings tables or active triggers on bus/reference tables. It creates credentialless accounts, owned centers of all three types, buses and temporary choices **inside a transaction that always rolls back**. It verifies missing references, ID/value distinction, override insertion/readback, stale revisions, inherited restoration, duplicate rejection and current ownership/membership checks. Existing bus/reference fingerprints match after rollback. See [redacted SQL checks](generated/transport-sql-checks.json). Identity sequences may advance even though fixture rows are rolled back; they are not reseeded.

The fictional demo uses explicitly labeled example choices, separate from SQL and from live lookup seeds. Domain/security tests cover scope/type isolation, page-grant denial, forged/stale account grants, revoked ownership, strict schemas, default protection, stale ABA and receipt failure rollback. Browser acceptance verified live missing-state review and an operator override/default-restoration flow on desktop/mobile. Connected device refresh/delivery remains unverified; a portal save confirms stored configuration only.

Routes: `GET /api/transport`, `GET /api/transport/{type}/{id}`, and `GET/PATCH /api/transport/{type}/{id}/{bus}`. No arbitrary database, SQL, procedure, actor or default-row selector is accepted.

## Dev activation review — 26 November 2026

The [fresh read-only inspection](generated/transport-dev-readiness.json) still finds ten Nursery/Lite buses, zero School buses and zero radius, dwell or input choices, settings or catalog defaults in both operational catalogs. The private transport-write switch remains false. The rollback acceptance runner was rerun successfully on this date; all temporary fixtures rolled back and the original fingerprints matched. This does not substitute for committed fixture/public-boundary acceptance.

Repeat the reference/count inspection separately from the app:

```sh
NODE_ENV=development node --conditions=react-server --import tsx scripts/inspect-transport-development.ts --development-only --read-only
```

It requires the exact owner-confirmed development compatibility boundary and encrypted SQL configuration, uses fixed bounded reference reads and aggregate counts, and writes only the redacted report above. It never reads tracking, child, driver, account credential or location rows. It accepts no SQL, database or output path arguments, performs no SQL mutations, and does not enable any feature switch. Reads are observations at inspection time; later reference changes still require adapter validation/revisions.

The owner needs to supply a reviewed legacy seed/export source or complete the [review template](examples/transport-reference-review.example.json). For each radius/dwell choice record the intended ID (or explicitly request a new identity), physical value, unit and display label, with the source of the unit. For input choices record the exact ID, label, enabled state and meaning expected by consuming clients. Nursery/Lite share a catalog; School must be reviewed independently. The template intentionally contains no invented choices and is not consumed by runtime or an importer. Do not infer values/units from lookup IDs or promote demo examples to live references.

The GitHub connector could not access the legacy repository during this review. Existing authorized GitHub CLI access returned its complete, untruncated tree `4bee1247adeb7a0794eaf996268c88cc3a092465`, matching the audited source: 312 tracked files and no SQL files or seed/migration paths. This tree-level check supplies no approved reference values; it does not rule out exports or scripts held elsewhere.

After reference review, prepare the exact application/rollback plan, verify schema/identity handling and existing consumers, and apply only the approved reference changes. Global defaults remain unchanged; a valid catalog default is required only for inheritance/restoration, while explicit overrides can work with reviewed choices and no default. Complete committed disposable-fixture checks through the public adapter, clean them up, verify the original baseline and then enable the independent dev switch. Connected-client interpretation/refresh and production rollout remain separate acceptance tasks.
