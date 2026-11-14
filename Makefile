# Tranquility Base: the only entry points humans need.
# Not built yet (later phases): data, parity, e2e, perf. See docs/PLAN.md.
PGDA := https://pgda.gsfc.nasa.gov/data/LOLA_20mpp
NAIF := https://naif.jpl.nasa.gov/pub/naif/generic_kernels
# Order matters: the 2.6 GB 20 m DEM first, slope map (3.8 GB, should-have) last.
RAW_URLS := $(PGDA)/LDEM_80S_20MPP_ADJ.TIF $(PGDA)/LDEM_80S_80MPP_ADJ.TIF \
  $(NAIF)/spk/planets/de440s.bsp $(NAIF)/pck/moon_pa_de440_200625.bpc \
  $(NAIF)/fk/satellites/a_old_versions/moon_de440_220930.tf $(PGDA)/LDSM_80S_20MPP_ADJ.TIF

.PHONY: setup data-download data-fixtures test validate check dev build deploy

setup:
	cd build && uv sync
	cd web && npm install

# Resumable and idempotent. PGDA sometimes closes long transfers, so each file gets 8 resume attempts.
data-download:
	@mkdir -p data/raw && cd data/raw && for u in $(RAW_URLS); do \
	  for i in 1 2 3 4 5 6 7 8; do curl -fSL -C - --retry 5 -O $$u && break; \
	    [ $$? -eq 22 ] && break; sleep 10; done; done; ls -l
# curl exit 22 with -C - means HTTP 416: the file is already complete.

data-fixtures:
	cd build && uv run python scripts/make_fixtures.py

test:
	cd build && uv run pytest -q
	cd web && npx vitest run --passWithNoTests

validate:
	cd build && uv run python scripts/validate_horizons.py > ../docs/VALIDATION.md; s=$$?; cat ../docs/VALIDATION.md; exit $$s

check:
	cd build && uv run ruff check . && uv run ruff format --check .
	cd web && npm run lint && npx tsc -b
	$(MAKE) test

dev:
	cd web && npm run dev

build:
	cd web && npm run build

deploy: build
	cd web && npx wrangler deploy
