# Data

Raw files live in `data/raw/` (gitignored). Fetch with `make data-download`. Downloaded 2026-11-14.

| File | Source | Bytes | SHA-256 | Credit | Used for |
| --- | --- | --- | --- | --- | --- |
| LDEM_80S_20MPP_ADJ.TIF | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/ (PGDA 90) | 2,696,082,051 | 09b7ca80f9e6a146f970225d18af72fc02787669b3ef51b888e347d2b6845649 | NASA GSFC PGDA / LRO LOLA | Near-field terrain, heightmaps, masks |
| LDEM_80S_80MPP_ADJ.TIF | same | 189,158,392 | 82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a | NASA GSFC PGDA / LRO LOLA | Far-field terrain |
| LDSM_80S_20MPP_ADJ.TIF | same | 3,778,056,355 expected | pending (download in progress) | NASA GSFC PGDA / LRO LOLA | Slope check (F16) |
| de440s.bsp | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/ | 32,726,016 | c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2 | NASA/JPL | Ephemeris |
| moon_pa_de440_200625.bpc | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/ | 12,863,488 | 60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f | NASA/JPL NAIF | Lunar orientation |
| moon_de440_220930.tf | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/a_old_versions/ | 19,571 | 73eb6b216c06a27c3419c4cfeaded7ffce46a714e3d4f9f5142dda51c0710f76 | NASA/JPL NAIF | Frame MOON_ME_DE440_ME421 |

Both DEMs open in rasterio: south polar stereographic, lat_ts −90, R 1,737,400 m, float32 metres, ±304 km; 30400² px at 20 m and 7600² px at 80 m.

## Derived / other

- `build/cache/horizons_*.txt`: JPL Horizons API responses for validation (committed).
- `build/sites_src.json`: site coordinates, source recorded per site. Nine PGDA-78-derived centres were read from GeoTIFF headers at `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/{site}/{site}_final_adj_5mpp_surf.tif`.
- `web/public/data/*`: **synthetic fixtures** from `make data-fixtures` (not real data), except the hand-authored `constraints.schema.json`.

## Cloudflare R2

Nothing uploaded yet: R2 is not enabled on the account (wrangler error 10042).
