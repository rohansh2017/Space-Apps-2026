---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: ["web/src/index.css"]
---

# Main screen (web/src/App.tsx)

Mode: Operate. Audience and job: a planning team whose landing plan just broke compares the plan with up to three alternatives and settles on one; judges see the same flow in a 3-minute projector demo. Constraints: engine, Scene3D props, data contracts, number sources and finder ranking untouched; existing labels, roles and test ids kept; no runtime network calls (font bundled); screening-grade line always on screen. Decided in shape (2026-11-15): tray holds the plan plus up to 3 pinned scenarios; left rail plus bottom band; secondary tools (map, matrix) in drawers from an edge rail; mission room is a header button; pins go into the share link; the tray replaces the old side-by-side view; Public Sans, bundled.

## Direction contract

THESIS: The scenario is the unit. Every scenario (the plan, finder results, nudged or custom views, matrix cells) is drawn the same way in one tray so the difference is seen, not asserted. Refuses the category default of a form beside a map with a results list.

OWN-WORLD: Polar light. Deep-shadow near-black ground, regolith-grey translucent panels with warm grey text, one accent of grazing-sun gold used only where sunlight is the subject (Sun marker and track, lit state, sunlit metrics), Earth blue only for Earth, red and green only for pass/fail and always with words. Public Sans with tabular figures for every number. Real icons, no glyph icons.

STORY: The planner sees the site, sees the Sun skim the ridge, slips the date, finds alternatives, pins the best two, and reads the tray to choose; Explorer mode says the same in words.

FIRST VIEWPORT: The 3D view fills the window under a slim top bar (name, mode, copy link, mission room, full screen). Left: a narrow edge rail (Map, Matrix) and the Plan + Constraints panel with Find alternatives fixed at its foot. Top right: the HUD. Bottom band: scrubber and nudge, the panorama, then the compare tray (Plan first). One-line screening footer.

FORM: Pinned whole by the user, not rolled. seed: none (pinned). "The 3D view fills the viewport, with a full-screen toggle (browser Fullscreen API) for projector demos. Plan, constraints and results float over the view as panels. Comparison is the centrepiece… let users pin several scenarios… into a compare tray… The panorama is a designed element. Polar-light look: grazing gold, regolith grey, deep shadow; the accent colour means sunlight only; fixed-width digits for numbers." Signature move: the panorama, where each scenario's skyline carries the Sun track in gold (solid while visible, ghosted behind the ridge, ticked where it meets the ridgeline) and Earth's track in blue.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
