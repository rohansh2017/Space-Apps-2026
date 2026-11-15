# 🏆 Sponsor prize slides (content)

Two slides, one per prize, plus the evidence judges can check live. Copy them into the deck as is.

---

## Slide 1 · Cloudflare — the platform runs core logic, not only hosting

**Products used**

| Product | What it does here |
| --- | --- |
| **Workers** (static assets + Worker) | Serves the app at https://tranquility-base.rohansh2017.workers.dev, and runs the `/data/*`, `/room/*` and `/api/*` routes (`web/worker/index.js`). |
| **R2** | Every data file (ephemeris 2026–2035, horizon masks, slopes, heightmaps, basemaps, site list) lives in bucket `tranquility-base-data` under the data-contract paths. The Moon view reads single mask rows with HTTP Range requests. The app starts with about 6.9 MB and fetches each site's 2.5 MB only when it is opened. The bundled copy is the fallback, and every response says which one served it (`x-data-source: r2`). |
| **Durable Objects** | `MissionRoom`, one object per room id, holds the shared plan (site, point, landing time, constraints) and relays changes over WebSockets with the hibernation API. Late joiners get the latest state, and each browser still runs the engine itself. |
| **Worker secrets and vars** | The Gemini key never leaves the Worker. The Gemini model is a Worker variable, so it changes without a code edit. |

**Live proof:** open the site in two browsers, press **Mission room → Start mission room**, open the link in the other,
and change the date in either. `make e2e-live` runs all 37 browser tests against the deployment, including the
three-browser room test.

---

## Slide 2 · Gemini API — Gemini in front of users, the engine behind the numbers

**Three jobs, one rule: Gemini reads and words, and never computes a number.**

| Feature | What the user does | What Gemini returns | What we check |
| --- | --- | --- | --- |
| **Ask Gemini** | Types requirements, a slip, where and when: *"survive 4 days of dark, talk to Earth half the time"* or *"my mission slipped by 11 days, stay near the rim"* | A search spec: constraints (`{dark: 96 h, Earth: 50%}`), a slip, where (this site, named sites from a fixed list, or all) and when (earliest first, land by), each part with the user's words it came from | The quote must be in the sentence; values are validated against `constraints.schema.json`; nothing changes until the user presses *Apply*, then our finder runs and our template writes the answer |
| **Say it plainly** | Asks why a plan fails | One or two sentences from the engine's "why not" facts | Kept only if every number in it is one of the facts; otherwise the engine's sentence stays |
| **Describe with Gemini** | Asks for the horizon in words | Two sentences from eleven engine facts | The same number check, with the template as fallback |

**Fast and frugal:** `gemini-3.5-flash-lite` with minimal thinking answers in about **2 s**. We chose it by benchmark
against a larger model, which took 20–96 s. One small call per button press, nothing automatic, and repeated questions
are cached. If the model is busy, the Worker falls back once to `gemini-flash-lite-latest`.

**Safety:** a 300-character cap, 10 requests per minute per client, and the key held as a Worker secret. A
prompt-injection sentence comes back with no values (tested).

**Live proof:** the demo at 1:20; `web/tests/e2e/gemini.spec.ts` calls the real routes in `make e2e-live`.

---

## Submission checklist (needs a person)

- [ ] Confirm each prize's submission steps on the Space Apps NYC page (an open question in the spec).
- [ ] Cloudflare: check whether the entry needs the vote snippet, and where it goes.
- [ ] Gemini: check the free-tier limits on the day; rehearse the sentences in [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).
