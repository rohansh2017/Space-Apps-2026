# Tranquility Base: the only entry points humans need.
PGDA := https://pgda.gsfc.nasa.gov/data/LOLA_20mpp
NAIF := https://naif.jpl.nasa.gov/pub/naif/generic_kernels
ILLUM := https://pgda.gsfc.nasa.gov/data/MoonIllumination
# Order matters: the 2.6 GB 20 m DEM first, slope map (3.8 GB, should-have) last. The AVGVISIB maps are for validation.
RAW_URLS := $(PGDA)/LDEM_80S_20MPP_ADJ.TIF $(PGDA)/LDEM_80S_80MPP_ADJ.TIF \
  $(NAIF)/spk/planets/de440s.bsp $(NAIF)/pck/moon_pa_de440_200625.bpc \
  $(NAIF)/fk/satellites/a_old_versions/moon_de440_220930.tf \
  $(ILLUM)/AVGVISIB_85S_060M_201608.TIF $(ILLUM)/AVGVISIB_75S_120M_201608.TIF $(PGDA)/LDSM_80S_20MPP_ADJ.TIF

.PHONY: setup data-download data data-fixtures test parity validate e2e e2e-live perf check dev build deploy

setup:
	cd build && uv sync
	cd web && npm install && npx playwright install chromium

# Resumable and idempotent. PGDA sometimes closes long transfers, so each file gets 8 resume attempts.
data-download:
	@mkdir -p data/raw && cd data/raw && for u in $(RAW_URLS); do \
	  for i in 1 2 3 4 5 6 7 8; do curl -fSL -C - --retry 5 -O $$u && break; \
	    [ $$? -eq 22 ] && break; sleep 10; done; done; ls -l
# curl exit 22 with -C - means HTTP 416: the file is already complete.

# Real ephemeris, masks, slopes and heightmaps into web/public/data/ (about 15 s).
data:
	cd build && uv run python scripts/build_data.py

# Python reference engine vs engine.ts on shared/fixtures.
parity:
	cd build && uv run python scripts/make_parity.py
	cd web && npx vitest run src/engine

e2e:
	cd web && npx playwright test

# The same browser tests against the deployed site (LIVE=... to point elsewhere).
LIVE := https://tranquility-base.rohansh2017.workers.dev
e2e-live:
	cd web && BASE_URL=$(LIVE) npx playwright test
	@curl -sI $(LIVE)/data/sites.json | grep -i x-data-source

# Finder timing at the spec's size and download sizes. Writes docs/PERF.md.
perf: build
	cd web && sh tests/perf.sh > ../docs/PERF.md; s=$$?; cat ../docs/PERF.md; exit $$s

data-fixtures:
	cd build && uv run python scripts/make_fixtures.py

test:
	cd build && uv run pytest -q
	cd web && npx vitest run --passWithNoTests

# Engine vs Horizons (offline after the first run), then sunlit % vs the PGDA illumination maps (needs data/raw).
validate:
	cd build && { uv run python scripts/validate_horizons.py && uv run python scripts/validate_illumination.py; } > ../docs/VALIDATION.md; s=$$?; cat ../docs/VALIDATION.md; exit $$s

check:
	cd build && uv run ruff check . && uv run ruff format --check .
	cd web && npm run lint && npx tsc -b
	$(MAKE) test parity e2e

dev:
	cd web && npm run dev

build:
	cd web && npm run build

# Uploads the data files to R2, then publishes the app. Auth: `npx wrangler login`, or Cloudflare_Token_Value in .env.
deploy: build
	cd web && sh scripts/upload-data.sh && sh scripts/wrangler.sh deploy
