# PROJECT ONE-PAGER FOR LOCAL JUDGES

| Field | Entry |
| --- | --- |
| Project title | Tranquility Base |
| Team name / ID | USACS / organizers fill in ID |
| Challenge | Lunar Landing Site Navigator |
| Team lead | Tanish / fishywish |
| Team members | Tanish Banota (R), Rohan Sharma (R), Hasan Ali (R), Brayden Uglione (R) |
| Project page | https://www.spaceappschallenge.org/2026/find-a-team/usacs/?tab=project |
| Demo | https://tranquility-base.rohansh2017.workers.dev/ |

## 1. In one sentence

A web app for lunar planners and students to explore real south-pole terrain in 2026–2035, see the Sun and Earth against the computed horizon, and find backup landing points and dates.

## 2. What you did

At the lunar south pole, low Sun and Earth angles make local terrain decisive: a short move or date slip can change sunlight and Earth visibility. Today, checking alternatives takes several specialist tools. Our app combines terrain, sky, mission constraints and ranked backups. Stand at a point in 3D, see sunset and Earthset countdowns, then search nearby points and later dates.

## 3. Data you used

- **NASA LRO LOLA terrain (GSFC PGDA):** 20 m and 80 m DEMs give horizons and slopes at 3,969 points in nine grids; 5 m DEMs add close-range terrain at eight sites. A LOLA global model supplies Moon relief.
- **JPL DE440 and NAIF lunar kernels:** hourly Sun/Earth positions for 2026–2035, precomputed with Skyfield in the LOLA frame.
- **JPL Horizons, PGDA illumination maps and LOLA slopes:** independent validation. Site coordinates come from NASA, PGDA and the project brief; approximate ones are labelled. The Yale Bright Star Catalogue supplies stars.

## 4. The science

**Question:** How much Sun is visible and does Earth clear the terrain? Which alternatives meet mission needs after a slip?

**Method:** From 2 m above ground, horizon rays use LOLA data and lunar curvature in 1° azimuth bins, up to the DEM edge (at most about 300 km). The engine models the Sun as a 0.53° disk and corrects Earth for observer offset; Earth must clear the ridge by 1°.

**Validation:** Sun/Earth angles differ from Horizons by at most 0.0007° over 720 hours at six sites (target: 0.1°). Ten-year sunlight patterns across nine grids match PGDA maps at r = 0.95–0.99, with grid means within 2 percentage points. The 500 m grid is for screening, not hazard assessment.

## 5. What it is and how it works

An orbitable Moon view shows site pins and sunlight/Earth maps. Zoom down and stand on LOLA terrain in 3D. The HUD, 360° horizon, playback, ranked finder, scenario matrix and comparison tray explain results in Planner and Explorer modes.

Python precomputes the data. React, TypeScript, Three.js and a Web Worker handle visualization and search; 5,000 candidate points across a 60-day range took 856 ms in a measured run. Cloudflare Workers host the app; R2 serves regional data. **Code:** https://github.com/rohansh2017/Space-Apps-2026

## 6. What is new here

Stand at a point to see why it passes or fails; the view and metrics share one engine. When a date slips, the finder ranks backups and states how each changes the plan. Planner metrics and plain-language explanations serve two audiences.

## 7. How you will present

We will give a virtual three-minute presentation with slides and a working screen-share demo. We will start at the Shackleton rim and move through time to show the Sun setting behind a ridge. Then we will slip the landing date, use the finder to identify a backup, and inspect that alternative in 3D. We will close by showing Explorer mode and the validation results.

## Special awards

☑ Cloudflare  ☐ Twilio  ☐ OpenSpace  ☑ MLH: Best Use of Gemini API

**Cloudflare:** Workers serve the app and API; R2 stores derived data and raw LOLA models. A Durable Object mission room syncs site, point, date and constraints over WebSockets.

**Gemini API:** Four Cloudflare Worker routes use Gemini to interpret mission requirements, plan a date slip, describe the horizon, and reword why a plan fails. The Worker keeps the API key secret; the app checks proposed settings against its schema and checks every number in descriptive replies against engine facts. Users confirm changes before the local finder runs. Gemini handles language; the terrain and ephemeris engine computes every mission metric.

## Use of AI

Claude Code wrote most code from the team's plan and science requirements. The team reviewed it, made design and science decisions, and deployed. Claude on GitHub reviews pull requests. Gemini interprets requirements and describes engine results; the DE440/LOLA-based engine computes every metric.
