# Interactive center location picker

Delivered on 30 October 2026 in **Care centers → Edit profile** and **New center draft → Location**. A click-to-place map, draggable pin and keyboard selection share the same named latitude/longitude fields and existing profile/draft save paths. Manual entry and the existing external map link remain available.

## Selection and saves

The map is optional. Opening an editor fetches authenticated provider metadata only; external tiles and the Leaflet runtime load after **Load map**. An empty location opens a world view with no pin and leaves both fields blank. Loading, zooming, panning and resizing never select or save a location. Existing projectable coordinates open at their saved position. Closing the map retains the entered coordinates and stops its tile layer.

Clicking the map or dragging the pin updates both fields and marks the form dirty. Keyboard users can focus the map, pan with arrow keys, zoom with +/− and choose **Use map center**. Manual edits move the pin; Clear coordinates empties both fields. The same Save/Cancel, unsaved-change warning, current permission/write gate and revision checks still apply. Drafts save/resume coordinates and carry them into demo publication; live provisioning remains pending.

Latitude zero and longitude zero are real coordinates. Partial or invalid entries do not produce a pin and remain subject to the existing form/server validation. Manual numeric precision is preserved. Map selections use seven decimal places and wrap longitude from neighbouring world copies into [-180,180]. Named domain coordinates still serialize to legacy **longitude,latitude** order through the existing adapter. No database schema, SQL write path, profile write switch or scope grant was changed.

The map uses Web Mercator, whose latitude coverage stops around ±85.0511287798 degrees. Valid manual coordinates up to ±90 are retained without clamping or rewriting; an explanatory message replaces the pin for locations outside map coverage. Tile/import failures show a retry message, with a ten-second loading fallback, while coordinate fields remain editable. Pending saves disable selection, map interaction and controls.

## Provider and privacy boundary

The UI names the provider before external loading and explains that requesting tiles shares the viewed area and IP address. No center name, contact data, center/dealer ID, profile request body or account details are placed in tile URLs. There is no geocoding/address search, browser geolocation, remote JavaScript SDK, legacy Maps key reuse, tile proxy, prefetch or offline download feature. External loading is chosen per mounted editor; no consent cookie or automatic location fetch is added.

[Leaflet 1.9.4](https://leafletjs.com/download) is pinned and bundled locally. Its BSD notice is retained in `public/licenses/leaflet.txt` and must be distributed with the public assets. Provider attribution remains visible outside the map canvas at desktop/mobile sizes. OpenStreetMap tiles use the [official HTTPS endpoint and usage policy](https://operations.osmfoundation.org/policies/tiles/), normal browser caching/Referer behavior and only the viewed viewport. Scroll-wheel zoom is disabled to avoid trapping page scrolling. Tile access is best-effort and production hosting/provider capacity and privacy requirements need acceptance before rollout.

## Configuration

`ICARE_MAP_PROVIDER` supports:

- `disabled`: manual coordinates only. This is the default outside development.
- `openstreetmap`: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, visible OpenStreetMap attribution, max zoom 19. This is the default in local development and must be explicitly selected elsewhere.
- `custom`: an administrator-approved HTTPS raster tile service. Set `ICARE_MAP_PROVIDER_NAME`, `ICARE_MAP_TILE_URL` with `{z}`, `{x}`, `{y}` path placeholders, `ICARE_MAP_ATTRIBUTION_TEXT`, `ICARE_MAP_ATTRIBUTION_URL`, and optionally `ICARE_MAP_MAX_ZOOM` (2–20, default 19).

Custom URLs must be HTTPS and have no credentials, query or fragment. Secret-bearing/query-key provider URLs are unsupported. Attribution is rendered as plain React text with a validated HTTPS link; no configured HTML is executed. Configuration is server-only and fixed by environment, never selected by requests. Missing/invalid configuration fails safely and leaves manual entry available. Use a provider licensed for the intended audience/load before enabling production maps; do not assume the local development default is a production service agreement.

`GET /api/maps/config` requires a verified session and `centers.create`, returns only public provider metadata with no-store, and rejects all query parameters. It accepts no coordinates or center references and performs no tile request. Profile/image/account secrets are never returned. Resource read/write operations still require their existing composite center scope and current actor checks.

## Acceptance

Four new test groups cover empty/partial/invalid coordinates, zero/negative/high-precision/polar values, longitude wrapping and legacy order; disabled production defaults and safe custom provider configuration; scoped profile persistence/stale saves; and owned draft save/resume/demo publication. Existing profile/session/scope tests remain in the suite.

HTTP acceptance verifies anonymous provider denial, rejected coordinate/query injection, safe public DTO/cache headers, existing Origin/scope/revision/range protection, profile persistence and temporary draft save/resume/clear. Temporary API data was restored/removed and separate API sessions were signed out. No real SQL center/profile was changed for this UI increment.

Desktop browser checks verify no external tile images before Load map, successful tile rendering/visible attribution, click/drag synchronization, unchanged fields on load/pan, keyboard selection, polar handling and profile save/reload. The existing native Cancel confirmation required human dismissal during testing; the unsaved point did not persist. At 390×844, the wizard map fit within the 356 px dialog (290 px map width), clear removed the pin/values and a selected `0,0` point survived save/reload/resume without automatically loading tiles. Tests used fictional demo data. Final build/privacy/access results are recorded in [verification](06-verification.md).
