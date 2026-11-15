# Data

Raw files live in `data/raw/` (gitignored). Fetch with `make data-download`. Downloaded 2026-11-14.

| File | Source | Bytes | SHA-256 | Credit | Used for |
| --- | --- | --- | --- | --- | --- |
| LDEM_80S_20MPP_ADJ.TIF | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/ (PGDA 90) | 2,696,082,051 | 09b7ca80f9e6a146f970225d18af72fc02787669b3ef51b888e347d2b6845649 | NASA GSFC PGDA / LRO LOLA | Near-field terrain, heightmaps, masks |
| LDEM_80S_80MPP_ADJ.TIF | same | 189,158,392 | 82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a | NASA GSFC PGDA / LRO LOLA | Far-field terrain |
| LDSM_80S_20MPP_ADJ.TIF | same | 3,778,056,355 | 6f2ea5fa94b4d6587899cf9e6d6329a609e9eaee7eaf54a41c3f0e289f42a789 | NASA GSFC PGDA / LRO LOLA | Slope check (F16) |
| AVGVISIB_85S_060M_201608.TIF | https://pgda.gsfc.nasa.gov/data/MoonIllumination/ (PGDA 69) | 33,994,464 | d539467f16ccc5f51b6a904af6be5d16c9b2f194afe619b9f1f81841d9fec0bb | NASA GSFC PGDA / Mazarico et al. 2011 | Lit/dark validation |
| AVGVISIB_75S_120M_201608.TIF | same | 83,052,039 | ccf67d4f39e0a970c111196da7d6551ffcf50d075470b93067fb3904c0b05806 | NASA GSFC PGDA / Mazarico et al. 2011 | Lit/dark validation (sites north of 85°S) |
| 5m/Site01_final_adj_5mpp_surf.tif | https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/ (PGDA 78) | 40,980,810 | 3ba7b97cb00a2bcf21189c3aeb535f65afc21207154ab9f0d43c5bdc1f7e747e | NASA GSFC PGDA / LRO LOLA (Barker et al. 2021) | 5 m heightmap: Connecting Ridge |
| 5m/Site04_final_adj_5mpp_surf.tif | same, Site04 | 40,980,806 | 38ff70dbdf2f066c2cfa94a646c3a59d653ce7f6b4528b15fc1b43ee397ce758 | same | not used (no curated site inside it) |
| 5m/Site06_final_adj_5mpp_surf.tif | same, Site06 | 64,025,603 | cca17e8067601dd659b583f889204db6bce685bc30c60a9e62427a8bce36b03d | same | 5 m heightmap: Nobile Rim 1 |
| 5m/Site07_final_adj_5mpp_surf.tif | same, Site07 | 40,980,808 | 38aaee10bb4da4d63e7427aa1ca25c79bdbc649d212079a04990e135462091f8 | same | 5 m heightmaps: Shackleton rim (Chang'e-7), Peak near Shackleton |
| 5m/Site23_final_adj_5mpp_surf.tif | same, Site23 | 70,586,804 | 12d280a59cd7580415f6bada638d0abe025ce6727541fddf68d5dc371a6c94cf | same | 5 m heightmap: Malapert Massif |
| 5m/Haworth_final_adj_5mpp_surf.tif | same, Haworth | 142,123,767 | 387fd6e99bca266f4982f7256c4c185921105313882b4c2eee5b5ff1ef75016b | same | 5 m heightmap: Haworth |
| 5m/DM2_final_adj_5mpp_surf.tif | same, DM2 | 64,025,607 | d88677c21633683061117db0a577f0510e0948fe9db315d13be28782407ff604 | same | 5 m heightmap: Nobile Rim 2 |
| 5m/LM7_final_adj_5mpp_surf.tif | same, LM7 | 64,033,675 | 00930f9d110d5477b6d38349eb544ec35d0bb802035113a0894479c317d29023 | same | 5 m heightmap: Faustini Rim A |
| bsc5.dat.gz | http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz (Harvard TDC copy of VizieR V/50) | 590,228 | 0471ced07fc241e625613baa689b2fa5f4b59fd733f731003e57d2d436036cdb | Yale Bright Star Catalogue, 5th rev. ed., Hoffleit & Warren 1991 | Star field (9,096 stars with positions) |
| de440s.bsp | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/ | 32,726,016 | c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2 | NASA/JPL | Ephemeris |
| moon_pa_de440_200625.bpc | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/ | 12,863,488 | 60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f | NASA/JPL NAIF | Lunar orientation |
| moon_de440_220930.tf | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/a_old_versions/ | 19,571 | 73eb6b216c06a27c3419c4cfeaded7ffce46a714e3d4f9f5142dda51c0710f76 | NASA/JPL NAIF | Frame MOON_ME_DE440_ME421 |

Both DEMs open in rasterio: south polar stereographic, lat_ts −90, R 1,737,400 m, float32 metres, ±304 km; 30400² px at 20 m and 7600² px at 80 m.

## Derived / other

- `build/cache/horizons_*.txt`: JPL Horizons API responses for validation (committed).
- `build/sites_src.json`: site coordinates, source recorded per site. Nine PGDA-78-derived centres were read from GeoTIFF headers at `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/{site}/{site}_final_adj_5mpp_surf.tif`.
- `web/public/data/*`: **real** output of `make data` (`build/scripts/build_data.py`): ephemeris 2026–2035 from DE440; orientation 2026–2035 (ICRF → MOON_ME quaternions); masks and slopes for 9 site grids (3,969 points) from the two LOLA DEMs; heightmaps from the 5 m site DEMs (8 sites) or the 20 m DEM (IM-2 Mons Mouton); `stars.bin` from BSC5. Also hillshade basemaps (polar cap and one per region) and `tour.json` (from the hand-authored `build/tour_src.json`, our own words from NASA and CSA public material). `constraints.schema.json` is hand-authored. Slopes are checked against the LOLA slope map by `make validate`. Re-running `make data` on a second machine (Apple Silicon) reproduced the masks, slopes and heightmaps byte for byte.

## Cloudflare R2

Bucket `tranquility-base-data` (bound to the Worker as `DATA`). Uploaded 2026-11-14 with the AWS CLI over the S3 API:

- `raw/LDEM_80S_20MPP_ADJ.TIF` (2,696,082,051 bytes)
- `raw/LDEM_80S_80MPP_ADJ.TIF` (189,158,392 bytes)
- `raw/5m/*_final_adj_5mpp_surf.tif` (the eight PGDA 78 files above, 527,737,880 bytes) and `raw/bsc5.dat.gz` (590,228 bytes), uploaded 2026-11-14 with the AWS CLI; sizes verified with `aws s3 ls`

The app's derived data files (everything in `web/public/data/`, 58 objects) were uploaded under the contract paths by `make deploy` on 2026-11-14 17:20 (`web/scripts/upload-data.sh`, which skips unchanged files). The live Worker serves `/data/*` from R2 (`x-data-source: r2`) with the bundled copy as fallback; `make e2e-live` checks this.

The illumination maps store int16 values with scale 4e-5 (value × 4e-5 = fraction of time lit), in the same south polar stereographic projection as the DEMs.

## 5 m site DEMs and stars (P6)

The PGDA 78 files are 5 m/px GeoTIFFs in the same south polar stereographic projection as the 20 m DEM (R = 1,737,400 m, metres, pixel-registered), 16–30 km squares. `make data` uses the first one that covers a site's whole 5 × 5 km heightmap patch and records it in `sites.json` (`heightmap.source`). IM-2 Mons Mouton has no covering file and keeps its 20 m heightmap. Horizon masks, slopes and all numbers still come from the 20 m and 80 m DEMs.

`stars.bin` holds 9,096 BSC5 stars (14 retired entries have no position): J2000 unit vectors, V magnitude, B−V. `orientation/{year}.bin` is the hourly ICRF → MOON_ME_DE440_ME421 rotation from the same Skyfield kernels as the ephemeris.
