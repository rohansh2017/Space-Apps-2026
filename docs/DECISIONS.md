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
