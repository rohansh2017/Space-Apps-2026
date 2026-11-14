# Sponsor prize slides (content)

Two slides, one per prize, plus the evidence judges can check live. Copy into the deck as is.

## Slide: Cloudflare — the platform runs core logic, not only hosting

**Products used**

- **Workers (static assets + Worker)**: serves the app at https://tranquility-base.rohansh2017.workers.dev and runs the `/data/*`, `/room/*` and `/api/*` routes (`web/worker/index.js`).
- **R2**: every data file (ephemeris 2026–2035, horizon masks, slopes, heightmaps, basemaps, site list) lives in bucket `tranquility-base-data` under the data-contract paths and is fetched per region on demand, so the first load is 3.9 MB. The bundled copy is the fallback; responses say which served them (`x-data-source: r2`).
- **Durable Objects**: `MissionRoom`, one object per room id, holds the shared plan (site, point, landing time, constraints) and relays changes over WebSockets with the hibernation API; late joiners get the latest state. Each browser still runs the engine itself.
- **Worker secrets**: the Gemini key never leaves the Worker.

**Live proof**: open the site in two browsers, press *Start mission room*, open the link in the other, change the date in either. `make e2e-live` runs 13 browser tests against the deployment, including the three-browser room test.

## Slide: Gemini API — Gemini in front of users, the engine behind the numbers

**What Gemini does**: under the constraint panel, a planner types a requirement in words: *"survive 4 days of dark, talk to Earth half the time."* The Worker calls the Gemini Interactions API (`gemini-4-hydrogen`) with our `constraints.schema.json` as the response schema. Gemini returns `{"max_continuous_dark_hours": 96, "min_earth_visible_pct": 50}`.

**What we do with it**: the browser re-validates the reply against the same schema (unknown fields and out-of-range values are listed and rejected, never coerced), shows the proposal labelled as generated, and changes nothing until the user presses *Apply*. The finder runs only when the user presses it. Gemini never receives or returns engine results.

**Second use, the horizon in words**: under the panorama, *Describe with Gemini* sends eleven engine-derived facts (highest ridge sector and elevation, sunlit %, hours to sunset and Earthset) and shows Gemini's two sentences, labelled as generated. The browser keeps the text only if every number in it is one of the facts; otherwise the engine's template sentence stands in and says why.

**Safety**: 300-character cap, 10 requests per minute per client, key held as a Worker secret, prompt-injection sentences come back as `{}` (tested).

**Live proof**: the demo moment at 1:20; `tests/e2e/gemini.spec.ts` calls the real route in `make e2e-live`.

## Submission checklist (needs a person)

- [ ] Confirm each prize's submission steps on the Space Apps NYC page (open question in the spec).
- [ ] Cloudflare: check whether the entry needs the vote snippet and where it goes.
- [ ] Gemini: confirm the model and free-tier limits on the day; rehearse the three example sentences in `docs/DEMO_SCRIPT.md`.
