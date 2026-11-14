# Data

Raw files live in `data/raw/` (gitignored). Fetch with `make data-download`. Downloaded 2026-11-14.

| File | Source | Bytes | SHA-256 | Credit | Used for |
| --- | --- | --- | --- | --- | --- |
| LDEM_80S_20MPP_ADJ.TIF | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/ (PGDA 90) | 2,696,082,051 | 09b7ca80f9e6a146f970225d18af72fc02787669b3ef51b888e347d2b6845649 | NASA GSFC PGDA / LRO LOLA | Near-field terrain, heightmaps, masks |
| LDEM_80S_80MPP_ADJ.TIF | same | 189,158,392 | 82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a | NASA GSFC PGDA / LRO LOLA | Far-field terrain |
| LDSM_80S_20MPP_ADJ.TIF | same | 3,778,056,355 | 6f2ea5fa94b4d6587899cf9e6d6329a609e9eaee7eaf54a41c3f0e289f42a789 | NASA GSFC PGDA / LRO LOLA | Slope check (F16) |
| AVGVISIB_85S_060M_201608.TIF | https://pgda.gsfc.nasa.gov/data/MoonIllumination/ (PGDA 69) | 33,994,464 | d539467f16ccc5f51b6a904af6be5d16c9b2f194afe619b9f1f81841d9fec0bb | NASA GSFC PGDA / Mazarico et al. 2011 | Lit/dark validation |
| AVGVISIB_75S_120M_201608.TIF | same | 83,052,039 | ccf67d4f39e0a970c111196da7d6551ffcf50d075470b93067fb3904c0b05806 | NASA GSFC PGDA / Mazarico et al. 2011 | Lit/dark validation (sites north of 85°S) |
| de440s.bsp | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/ | 32,726,016 | c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2 | NASA/JPL | Ephemeris |
| moon_pa_de440_200625.bpc | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/ | 12,863,488 | 60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f | NASA/JPL NAIF | Lunar orientation |
| moon_de440_220930.tf | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/a_old_versions/ | 19,571 | 73eb6b216c06a27c3419c4cfeaded7ffce46a714e3d4f9f5142dda51c0710f76 | NASA/JPL NAIF | Frame MOON_ME_DE440_ME421 |

Both DEMs open in rasterio: south polar stereographic, lat_ts −90, R 1,737,400 m, float32 metres, ±304 km; 30400² px at 20 m and 7600² px at 80 m.

## Derived / other

- `build/cache/horizons_*.txt`: JPL Horizons API responses for validation (committed).
- `build/sites_src.json`: site coordinates, source recorded per site. Nine PGDA-78-derived centres were read from GeoTIFF headers at `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/{site}/{site}_final_adj_5mpp_surf.tif`.
- `web/public/data/*`: **real** output of `make data` (`build/scripts/build_data.py`): ephemeris 2026–2035 from DE440; masks, slopes and heightmaps for 9 site grids (3,969 points) from the two LOLA DEMs. Also hillshade basemaps (polar cap and one per region) and `tour.json` (from the hand-authored `build/tour_src.json`, our own words from NASA and CSA public material). `constraints.schema.json` is hand-authored. Slopes are computed but not yet checked against the LOLA slope map. Re-running `make data` on a second machine (Apple Silicon) reproduced the masks, slopes and heightmaps byte for byte.

## Cloudflare R2

Bucket `tranquility-base-data` (bound to the Worker as `DATA`). Uploaded 2026-11-14 with the AWS CLI over the S3 API:

- `raw/LDEM_80S_20MPP_ADJ.TIF` (2,696,082,051 bytes)
- `raw/LDEM_80S_80MPP_ADJ.TIF` (189,158,392 bytes)

The app's derived data files (everything in `web/public/data/`, 58 objects) were uploaded under the contract paths by `make deploy` on 2026-11-14 17:20 (`web/scripts/upload-data.sh`, which skips unchanged files). The live Worker serves `/data/*` from R2 (`x-data-source: r2`) with the bundled copy as fallback; `make e2e-live` checks this.

The illumination maps store int16 values with scale 4e-5 (value × 4e-5 = fraction of time lit), in the same south polar stereographic projection as the DEMs.
