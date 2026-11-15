# Demo script (3 minutes) mapped to the UI

Open https://tranquility-base.rohansh2017.workers.dev in Planner mode before you start. The default plan is the Shackleton rim (Chang'e-7's target) on 2026-11-19 00:00 UTC, which passes every default constraint. Have a second browser window ready with the same page for step 6.

| Time | Say | Do |
| --- | --- | --- |
| 0:00 | "At the lunar south pole the Sun never gets more than a degree or two above the horizon, so a ridge, a few hundred metres or a few days decide whether a lander lives." | Page is open at the Shackleton rim. Point at the Sun just above the ridge in the 3D view and at the HUD: *Solar elevation 2.19°*. |
| 0:30 | "The two big numbers are what a planner lives by: time to sunset and time to Earthset." | Drag the lunar-day scrubber to about +200 h: the Sun drops behind the ridge, the HUD flips to *Dark* and *Sunrise in*. Point at the same moment in the panorama below: the yellow track dips under the grey silhouette. |
| 1:00 | "Chang'e-7 missed its August window. Suppose the landing slips twelve days." | Set the landing date to 2026-12-01 00:00. The chips turn red: *Sun*, *Dark*, *Earth*, *Landing* fail. |
| 1:20 | "So we ask the finder what still works. You can type the requirement." | Under Constraints, type *survive 4 days of dark, talk to Earth half the time*, press *Interpret with Gemini*, show the proposal (96 h, 50%), press *Apply to the panel*. Then press *Find alternatives*: ten ranked options in about 40 ms, each with a one-line difference. |
| 1:50 | "Open the best one. Here is the plan and the alternative side by side." | Press *Open in 3D* on the top result: it is pinned in the Compare tray beside the plan. Pin #2 too; open *Scenario matrix* on the left rail if time allows. |
| 2:20 | "Five hundred metres matters." | Press *Back to plan*, then *500 m E* / *500 m W* on the nudge row and watch the tiles change. In the second browser, join the mission room link (press *Start mission room* first) and change the date there: the first browser follows. |
| 2:40 | "Everything here is real JPL ephemeris and real LRO terrain, checked against Horizons to a thousandth of a degree and against PGDA's illumination maps at r 0.95 to 0.99. Explorer mode says the same thing in plain words." | Switch to *Explorer*. Point at the HUD sentence and the summary line. Close on the footer credits. |

If a step misbehaves, skip it: steps 1–4 and 7 only use must-have features.

## Example sentences for Gemini (rehearse these)

- "survive 4 days of dark, talk to Earth half the time" → max darkness 96 h, Earth visibility 50%
- "two-week rover mission, slopes under 8 degrees, don't move more than 2 km" → duration 14 d, slope 8°, radius 2 km
- A nonsense or injection sentence returns no values and the panel is unchanged.

## Backup

If the venue network fails: `make dev` serves the same app from this laptop with the bundled data (no mission room, no Gemini). The recorded video covers the full script.
