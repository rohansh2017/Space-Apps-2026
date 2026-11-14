# Decisions

**D1 Frame kernel location.** The spec names `moon_de440_220930.tf`; NAIF moved it to `fk/satellites/a_old_versions/`. → Download from there. Same file, so the frame definition is the spec's.

**D2 No `/api` directory.** The spec's P0 lists `/build, /web, /api`, but the API is optional (only for points outside the precomputed regions) and the build brief's layout has none. → Not created until that requirement appears.

**D3 Python 3.12, numba < 0.62.** Spec says Python 3.11. The dev machine is an Intel Mac with uv's 3.12; current llvmlite has no wheel for it. → `requires-python >= 3.11`, numba pinned below 0.62. No science impact.

**D4 Skyfield PCK segment.** `moon_pa_de440_200625.bpc` holds two segments and Skyfield keeps only the last (2426–2650). → `ephem._kernels` picks the segment covering 2026–2035. Verified against Horizons (VALIDATION.md).

**D5 Contract details the spec leaves open.** Little-endian binaries; a region = one site's 21 × 21 grid, row-major, site at index 220; heightmap row 0 = north, height = offset + value × scale; added `elev_m` to points (the local frame needs elevation), `terrain` to sites, and `index` to points. Full list in CLAUDE.md.

**D6 Constraint ranges.** The spec gives defaults only. → min/max chosen in `constraints.schema.json`: duration 1–30 d, sun 0–30 d, dark 0–720 h, Earth visibility 0–100 %, Earth elevation 0–10°, slope 0–30°, slip 0–30 d (±), radius 0–5 km (the grid's reach). Editable placeholders.

**D7 Site coordinates.** NASA published only a map of the 2024 Artemis III regions. → Where PGDA product 78 has a site DEM, the site uses the centre of that DEM footprint, marked approximate, with that source recorded. Five regions without any sourced coordinate are held in `sites_src.json` under `pending` and are not in `sites.json`: Peak near Cabeus B, Mons Mouton Plateau, Mons Mouton (region), de Gerlache Rim 2, Slater Plain. The spec says Connecting Ridge comes "from the PGDA 78 README"; that README has no coordinates, so the Site01 footprint centre is used.

**D8 Spec PDF stays at the repo root** (the brief references it there), not under `docs/spec/`.

**D9 Raw DEMs in R2.** The team asked for both LOLA DEMs to be stored in Cloudflare; the spec only puts derived files in R2. → Planned under `raw/` in the data bucket. Blocked: R2 is not enabled on the account.

**D10 Exact curvature.** The spec says to subtract the curvature drop d²/(2R). → The mask uses exact spherical geometry (ray along a great circle, angle = atan2(r₁cosθ − r₀, r₁sinθ)), which is what d²/(2R) approximates; the two differ by about 0.01° at 300 km. Tested against a far ridge and a flat sphere.

**D11 Rays stop at the DEM edge.** The 80 m DEM covers ±304 km around the pole, so for sites far from the pole some rays end before 300 km (Nobile Rim 2 is 183 km out). Terrain north of 80°S is not in any spec dataset. Accepted as a screening-grade limit.

**D12 Heightmap axes.** Heightmaps are sampled in the site's local east/north axes (row 0 = north, col 0 = west), not stereographic x/y, so the 3D scene needs no rotation and azimuths line up with the engine.

**D13 Partial solar disk.** The horizon is taken as level across the 0.53° disk at the Sun's azimuth (circular-segment area). The spec does not define the shape; 1° bins make anything finer meaningless.

**D14 Frontend simplifications.** Panorama is plain Canvas 2D (no D3 needed yet). All ten ephemeris years (2.5 MB) load at start rather than per year; masks load per region on demand.

**D15 Ahead of plan.** `make data` already builds masks, slopes and heightmaps for all nine site grids (12 s), which the spec schedules for P2/P3, because it is the same code as one site.

**D16 Cloudflare/Gemini setup.** Cloudflare's agent setup installed the `cloudflare` Claude Code plugin (user scope). The optional `cf` CLI was not installed because the project uses Wrangler. Gemini is called over REST (Interactions API, model `gemini-4-hydrogen`), so the `@google/genai` SDK is not installed: the Worker needs one `fetch`.

**D17 Five Artemis III regions deferred.** Peak near Cabeus B, Mons Mouton Plateau, Mons Mouton, de Gerlache Rim 2 and Slater Plain have no published centre coordinate (NASA released a map image only; PGDA 78 and two literature searches gave nothing usable). → The list is final at 12 sites; these five stay under `pending` in `build/sites_src.json` rather than being guessed. To add one: put its lat/lon and source in `sites` there and run `make data`. Mons Mouton is still covered by the IM-2 landing site.

**D18 Gemini tooling.** The optional `gemini-api-dev` skill and Docs MCP server are not installed: the project's only Gemini use is two Worker routes over REST.

**D19 Finder searches forward only.** The spec says slip range ±30 days. A slipped launch cannot land earlier, and the demo showed every top result before the slipped date. → Team decision (2026-11-14): start dates run from the planned hour to planned + slip range. The schema default stays 30 days; the panel label reads "later by up to". The 60-day performance target is tested as a 60-day forward range.

**D20 Site map without MapLibre.** The spec lists MapLibre over a static hillshade. → Two plain canvases (polar cap, and the selected site's 10 km grid) drawn from static hillshade PNGs. Same function (see sites, click to pick), no extra dependency, no tiles.

**D21 New contract file: basemaps.** `basemap.json` plus 8-bit `basemaps/pole.png` (80 m DEM block-averaged to 800 m, relief x4) and `basemaps/{region}.png` (20 m DEM, ±5.25 km), in stereographic x/y axes. Hillshade lighting is fixed (upper left, 35 deg), not the real Sun, and the map caption says so. `tour.json` is now written from the hand-authored `build/tour_src.json` and is no longer synthetic.

**D22 Illustrative 3D detail.** The terrain is 20 m per cell, which renders as a smooth slab from 2 m eye height. → A procedural soil normal map and albedo, a random star field, a glare sprite on the Sun and a stylised Earth (correct phase and angular size, invented surface). None of it feeds any number, and the app footer says which parts are illustrative. Soil relief strength scales with solar elevation so contrast stays readable at grazing angles (display choice, like the exposure scaling).

**D23 Overlapping regions.** Shackleton rim and Peak near Shackleton grids overlap. → A custom coordinate that is within 500 m of a grid point of the selected site stays with that site; otherwise the nearest point of any region wins.

**D24 R2 with a bundled fallback.** The Worker answers `/data/*` from R2 and falls back to the copy bundled in the static assets, so a failed or stale upload cannot break the demo (the spec's "local build as the backup"). `raw/` keys are never served. Responses carry `x-data-source: r2|assets`.

**D25 PGDA comparison is a pattern check.** PGDA's map is an 18.6-year average at the surface of 60 or 120 m terrain; ours is 2026–2035 at 2 m above 20 m terrain. → Pass criterion is Pearson r ≥ 0.5 across each site's 441 points, with the means reported, not an equality test.

**D26 Nudge step is one grid point (500 m), not 100 m.** The spec's nudge moves the site 100 m, but horizon masks exist only at the 500 m grid, and a 100 m move needs a new ray-march (offline, numba). → The nudge moves to the neighbouring grid point closest to the chosen compass direction (`nudgeNeighbour`), labelled "500 m N/E/S/W", and ±1 day. The summary tiles show each metric's change since the last nudge. Upgrade path: precompute a finer grid around the demo sites.

**D27 Side-by-side as paired panoramas.** The spec allows split 3D or paired panoramas. → Paired panoramas with paired metric tiles and pass/fail chips, scrubbed together; the 3D view stays on the opened alternative. A second WebGL scene would halve the frame rate on the 30 fps target.

**D28 Tour mechanics.** Three steps from `tour.json` in a card above the 3D view, Explorer mode only. Step 1 adds a small inline sketch of an Earth sunrise against the polar Sun path (the spec's "contrasting with an Earth sunrise"); step 2 starts lunar-day playback; step 3 points at the nudge control. Switching to Planner closes it.

**D29 Mission room details.** One Durable Object per room id (`getByName`), WebSocket hibernation API, latest state kept in DO storage so late joiners catch up. The room message gains `point_index` (custom grid point, or null) beyond the spec's four fields, and the room also broadcasts `{type: "presence", count}` so the UI can show "2 connected" (the demo's proof that two browsers are in step). The DO checks message shape only; each browser validates incoming constraint values against `constraints.schema.json` and ignores unknown sites, points and out-of-range dates. Room ids are random `tb-xxxxxx` and carried in `?room=`; there is no auth, which is fine for a hackathon demo and is noted here. The browser never echoes a state it just received (`lastRoomKey`).

**D30 Room test needs the Worker.** Vite preview cannot host a Durable Object, so `room.spec.ts` is skipped unless `ROOM_TEST=1`; `make e2e-room` starts `wrangler dev` on port 8788 for it and `make check` includes it; `make e2e-live` runs it against the deployed Worker.

**D31 Gemini sentence entry.** Interactions API over REST from the Worker (`gemini-4-hydrogen`, the model the current docs use; one constant to change), `constraints.schema.json` read from the Worker's own static assets and sent as `response_format.schema` with `additionalProperties: false`. The prompt asks for stated fields only, so a sentence that names two constraints changes two fields. Limits: 300 characters, 10 requests per minute per client IP per isolate. The browser re-validates strictly (`parseSuggestion`: unknown fields and out-of-range values are listed as rejected, never coerced), shows the proposal labelled as generated, and changes nothing until "Apply to the panel"; the finder runs only when the user presses it. Probe results 2026-11-14: "survive 4 days of dark, talk to Earth half the time" → `{max_continuous_dark_hours: 96, min_earth_visible_pct: 50}`; an injection sentence → `{}`; 3–11 s latency. The local `make e2e` mocks the route; `make e2e-live` calls the real one.

**D32 `.env` key names changed.** The team renamed the Cloudflare entries (`CLOUDFLARE_ACCOUNT_API_TOKEN`, `Cloudflare_R2_*`). `web/scripts/wrangler.sh` now tries `CLOUDFLARE_ACCOUNT_API_TOKEN`, then the old `Cloudflare_Token_Value`. The file also has a stray space after one `=`, which breaks `source .env` but not the grep-based scripts; left for the owner to fix.

**D33 Illumination map window and colour.** F15 shows sunlit % per grid point over the current mission window from the planned landing hour (441 series, recomputed when the site, date or duration changes; a few ms). Cells are 500 m squares at 78% opacity over the LOLA hillshade, coloured with the same single-hue ramp as the scenario matrix (`src/ramp.ts`), so one magnitude reads the same in both views; the legend sits under the map. A ten-year average would need no date and match PGDA's map more closely, but the planner's question is this mission's window.

**D34 Slope check criteria.** `validate_slopes.py` compares our Uint8 slopes with the LOLA slope product sampled at the same points; pass is Pearson r ≥ 0.9 and mean absolute difference < 1° per site. Measured: r 0.994–0.999, mean abs diff 0.26–0.33°, max 2.2° (whole-degree rounding plus the gradient stencil). Slope screening itself has been in the finder since P2 (`max_slope_deg`).

**D35 Share link format.** `?site=&point=&t=&c=id:value,…&mode=`; constraints appear only when they differ from the schema defaults, so a default plan shares as `?site=…&t=…`. The address bar is updated with `replaceState` on every change (no history entries), and a Copy link button copies it. Values from a link go through the same validation as mission-room messages.

**D36 Horizon description mechanics.** The browser computes eleven facts from the engine (highest and lowest skyline sectors with elevations, sunlit % and max solar elevation over the mission window from the scrubber position, Sun/Earth state and hours to the next change) and always shows a template sentence built from them. "Describe with Gemini" sends only those facts to `/api/describe`; the reply is kept only if every number in it is one of the facts (rounded forms and day/hour conversions of the countdowns allowed), otherwise the template is shown with a note saying why. A generated sentence is dropped as soon as the facts change (new scrubber position, site or date). Same caps and secret handling as F21. First live run: with no direction facts the model answered that it "cannot say where the tracks meet the ridgeline", which has no numbers and so passed the number check; the facts now include the Sun's and Earth's current sectors and the sectors where each next meets the ridge, and a reply that reads as a refusal (`looksLikeDescription`) is replaced by the template too.
