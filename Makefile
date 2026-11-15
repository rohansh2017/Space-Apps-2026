# Tranquility Base: the only entry points humans need.
PGDA := https://pgda.gsfc.nasa.gov/data/LOLA_20mpp
NAIF := https://naif.jpl.nasa.gov/pub/naif/generic_kernels
ILLUM := https://pgda.gsfc.nasa.gov/data/MoonIllumination
PGDA5 := https://pgda.gsfc.nasa.gov/data/LOLA_5mpp
# PGDA 78 5 m site DEMs used for 3D heightmaps (Site04 is downloaded but no curated site falls inside it)
SITES_5M := Site01 Site04 Site06 Site07 Site23 Haworth DM2 LM7
# Yale Bright Star Catalogue (BSC5); the Harvard TDC copy, as CDS (VizieR V/50) was unreachable
BSC5 := http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz
# Order matters: the 2.6 GB 20 m DEM first, slope map (3.8 GB, should-have) last. The AVGVISIB maps are for validation.
RAW_URLS := $(PGDA)/LDEM_80S_20MPP_ADJ.TIF $(PGDA)/LDEM_80S_80MPP_ADJ.TIF \
  $(NAIF)/spk/planets/de440s.bsp $(NAIF)/pck/moon_pa_de440_200625.bpc \
  $(NAIF)/fk/satellites/a_old_versions/moon_de440_220930.tf \
  $(ILLUM)/AVGVISIB_85S_060M_201608.TIF $(ILLUM)/AVGVISIB_75S_120M_201608.TIF $(PGDA)/LDSM_80S_20MPP_ADJ.TIF

.PHONY: setup data-download data data-globe data-fixtures test parity validate e2e e2e-live e2e-room perf check check-changed dev build deploy

setup:
	cd build && uv sync
	cd web && npm install && npx playwright install chromium

# Resumable and idempotent. PGDA sometimes closes long transfers, so each file gets 8 resume attempts.
data-download:
	@mkdir -p data/raw/5m && cd data/raw && for u in $(RAW_URLS) $(BSC5); do \
	  for i in 1 2 3 4 5 6 7 8; do curl -fSL -C - --retry 5 -O $$u && break; \
	    [ $$? -eq 22 ] && break; sleep 10; done; done; \
	cd 5m && for s in $(SITES_5M); do \
	  for i in 1 2 3 4 5 6; do curl -fSL -C - --retry 5 -O $(PGDA5)/$$s/$${s}_final_adj_5mpp_surf.tif && break; \
	    [ $$? -eq 22 ] && break; sleep 20; done; sleep 5; done; ls -l .. .; \
	mkdir -p ../globe && cd ../globe && for f in ldem_16.lbl ldem_16.img; do \
	  for i in 1 2 3 4 5; do curl -fSL -C - --retry 5 -O $(LOLA_GDR)/$$f && break; [ $$? -eq 22 ] && break; sleep 10; done; done
# curl exit 22 with -C - means HTTP 416: the file is already complete.

# The LOLA global DEM for the whole-Moon hillshade (D60), 33 MB.
LOLA_GDR := https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img

# Real ephemeris, orientation, stars, masks, slopes and heightmaps into web/public/data/ (about 15 s).
data:
	cd build && uv run python scripts/build_data.py && uv run python scripts/build_globe.py

# Only the whole-Moon hillshade (basemaps/globe.png), from data/raw/globe/ldem_16.img (a few seconds).
data-globe:
	cd build && uv run python scripts/build_globe.py

# Python reference engine vs engine.ts on shared/fixtures.
parity:
	cd build && uv run python scripts/make_parity.py
	cd web && npx vitest run src/engine

e2e:
	cd web && npx playwright test

# The same browser tests against the deployed site, mission room included (LIVE=... to point elsewhere).
LIVE := https://tranquility-base.rohansh2017.workers.dev
e2e-live:
	cd web && BASE_URL=$(LIVE) ROOM_TEST=1 GEMINI_TEST=1 npx playwright test
	@curl -sI $(LIVE)/data/sites.json | grep -i x-data-source

# Mission room test on the local Worker (wrangler dev runs the Durable Object; the R2 fallback serves the data).
e2e-room: build
	cd web && mkdir -p .wrangler && (npx wrangler dev --port 8788 > .wrangler/dev.log 2>&1 & echo $$! > .wrangler/dev.pid); \
	  for i in $$(seq 1 60); do curl -sf -o /dev/null http://localhost:8788/ && break; sleep 1; done; \
	  BASE_URL=http://localhost:8788 ROOM_TEST=1 npx playwright test room; s=$$?; \
	  kill $$(cat .wrangler/dev.pid) 2>/dev/null; pkill -f 'workerd.*8788' 2>/dev/null; exit $$s

# Finder timing at the spec's size and download sizes. Writes docs/PERF.md.
perf: build
	cd web && sh tests/perf.sh > ../docs/PERF.md; s=$$?; cat ../docs/PERF.md; exit $$s

data-fixtures:
	cd build && uv run python scripts/make_fixtures.py

test:
	cd build && uv run pytest -q
	cd web && npx vitest run --passWithNoTests

# Engine vs Horizons (offline after the first run), sunlit % vs the PGDA illumination maps, slopes vs the LOLA slope map (both need data/raw).
validate:
	cd build && { uv run python scripts/validate_horizons.py && uv run python scripts/validate_illumination.py && uv run python scripts/validate_slopes.py; } > ../docs/VALIDATION.md; s=$$?; cat ../docs/VALIDATION.md; exit $$s

# Everything: the gate before merging to main and before a deploy.
check:
	cd build && uv run ruff check . && uv run ruff format --check .
	cd web && npm run lint && npx tsc -b
	$(MAKE) test parity e2e e2e-room

# Only the checks the files changed since main can affect (PLAN=1 to just print them). Before every push.
check-changed:
	sh web/scripts/check-changed.sh

dev:
	cd web && npm run dev

build:
	cd web && npm run build

# Uploads the data files to R2, then publishes the app. Auth: `npx wrangler login`, or Cloudflare_Token_Value in .env.
deploy: build
	cd web && sh scripts/upload-data.sh && sh scripts/wrangler.sh deploy
