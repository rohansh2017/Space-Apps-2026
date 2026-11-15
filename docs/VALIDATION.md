# Validation

Measured values only. Regenerate with `make validate`.

## Engine vs JPL Horizons (quantity 4), frame MOON_ME_DE440_ME421

Engine angles are computed from the shipped Float32 ephemeris table (`web/public/data/ephemeris/2026.bin`) with `horizonwalk.engine.site_angles`.

Window: 720 hourly steps from 2026-11-20 00:00 UTC. Target: < 0.1 deg. Azimuth error is scaled by cos(elevation).

| Site | Body | Max az error (deg) | Max el error (deg) | Pass |
| --- | --- | --- | --- | --- |
| apollo11 | Sun | 0.00000 | 0.00068 | yes |
| apollo11 | Earth | 0.00000 | 0.00002 | yes |
| apollo15 | Sun | 0.00000 | 0.00068 | yes |
| apollo15 | Earth | 0.00000 | 0.00002 | yes |
| apollo17 | Sun | 0.00000 | 0.00068 | yes |
| apollo17 | Earth | 0.00000 | 0.00002 | yes |
| connecting-ridge | Sun | 0.00000 | 0.00068 | yes |
| connecting-ridge | Earth | 0.00000 | 0.00003 | yes |
| change7-shackleton-rim | Sun | 0.00000 | 0.00068 | yes |
| change7-shackleton-rim | Earth | 0.00000 | 0.00003 | yes |
| im2-mons-mouton | Sun | 0.00000 | 0.00068 | yes |
| im2-mons-mouton | Earth | 0.00000 | 0.00003 | yes |

## Sunlit % vs PGDA average solar illumination (Mazarico et al. 2011)

Ours: mean Sun visible fraction over all 87,648 hours of 2026-2035, 2 m above the 20 m terrain, at each of a site's 441 grid points (500 m spacing). PGDA: the 18.6-year average at the surface, sampled at the same points from the finest map that covers the site. Different height, resolution and time span, so the check is the spatial pattern: Pearson r >= 0.5 per site.

| Site | PGDA map | Ours, site point (%) | PGDA, site point (%) | Ours, grid mean (%) | PGDA, grid mean (%) | Mean difference (pts) | Pearson r | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shackleton rim (Chang'e-7 target) | 060M | 53.8 | 49.0 | 35.8 | 35.1 | +0.7 | 0.96 | yes |
| Mons Mouton (IM-2 landing) | 060M | 44.8 | 46.3 | 31.3 | 31.6 | -0.4 | 0.99 | yes |
| Haworth | 060M | 10.6 | 8.2 | 26.5 | 27.2 | -0.8 | 0.98 | yes |
| Malapert Massif | 060M | 22.0 | 20.0 | 36.8 | 37.9 | -1.0 | 0.97 | yes |
| Nobile Rim 1 | 060M | 30.5 | 29.6 | 30.3 | 30.9 | -0.6 | 0.98 | yes |
| Nobile Rim 2 | 120M | 40.9 | 41.1 | 33.9 | 35.1 | -1.2 | 0.99 | yes |
| Connecting Ridge (Barker Site 01) | 060M | 45.4 | 40.7 | 28.8 | 28.1 | +0.7 | 0.95 | yes |
| Peak near Shackleton | 060M | 68.3 | 44.3 | 34.8 | 34.4 | +0.4 | 0.96 | yes |
| Faustini Rim A | 060M | 26.8 | 26.1 | 21.7 | 23.7 | -2.0 | 0.98 | yes |

Site points ranked by our sunlit %: Peak near Shackleton, Shackleton rim (Chang'e-7 target), Connecting Ridge (Barker Site 01), Mons Mouton (IM-2 landing), Nobile Rim 2, Nobile Rim 1, Faustini Rim A, Malapert Massif, Haworth.

Connecting Ridge is number 3 of 9 (among the best-lit, as the spec expects).

## Slopes vs the LOLA slope map (LDSM_80S_20MPP_ADJ)

Ours: numpy.gradient on the 20 m DEM at each grid point, stored as whole degrees. LOLA: the PGDA slope product sampled at the same points. Pass: Pearson r >= 0.9 and mean absolute difference < 1.0 deg per site.

| Site | Ours, mean (deg) | LOLA, mean (deg) | Mean abs diff (deg) | Max abs diff (deg) | Pearson r | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| Shackleton rim (Chang'e-7 target) | 11.2 | 11.1 | 0.33 | 1.1 | 0.997 | yes |
| Mons Mouton (IM-2 landing) | 5.8 | 5.8 | 0.28 | 1.1 | 0.994 | yes |
| Haworth | 8.0 | 8.0 | 0.28 | 0.9 | 0.996 | yes |
| Malapert Massif | 16.9 | 16.9 | 0.29 | 1.3 | 0.998 | yes |
| Nobile Rim 1 | 16.2 | 16.2 | 0.28 | 2.2 | 0.999 | yes |
| Nobile Rim 2 | 9.9 | 9.9 | 0.26 | 1.0 | 0.998 | yes |
| Connecting Ridge (Barker Site 01) | 11.6 | 11.5 | 0.30 | 1.9 | 0.998 | yes |
| Peak near Shackleton | 11.0 | 10.9 | 0.28 | 1.1 | 0.997 | yes |
| Faustini Rim A | 9.8 | 9.8 | 0.31 | 2.1 | 0.997 | yes |
