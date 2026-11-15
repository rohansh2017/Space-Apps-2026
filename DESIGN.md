---
name: Tranquility Base
description: Lunar south-pole landing site navigator; stand on real LOLA terrain and compare landing scenarios.
colors:
  ground: "#050608"
  panel: "rgb(20 20 22 / 86%)"
  panel-solid: "#141416"
  raised: "#1d1d20"
  line: "rgb(224 216 200 / 10%)"
  line-strong: "rgb(224 216 200 / 22%)"
  text: "#ece8e1"
  dim: "#b9b3a8"
  mute: "#9a948a"
  sun: "#f0b955"
  earth: "#5fa8ff"
  ok: "#86d3a1"
  bad: "#ff8f84"
  bad-bg: "rgb(255 143 132 / 12%)"
  pano-sky: "#07080a"
  pano-terrain: "#57534d"
  pano-ridge: "#8a857c"
typography:
  headline:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
    fontFeature: "tnum"
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.1em"
    fontFeature: "tnum"
  numeral-large:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  hair: "2px"
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  gap: "12px"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.36rem 0.55rem"
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.panel-solid}"
    rounded: "{rounded.sm}"
    padding: "0.65rem"
  button-quiet:
    textColor: "{colors.dim}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.36rem 0.55rem"
  chip-pass:
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.5rem 0.1rem 0.4rem"
  chip-fail:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.bad}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.5rem 0.1rem 0.4rem"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.8rem"
  drawer:
    backgroundColor: "{colors.panel-solid}"
    rounded: "{rounded.md}"
  tray-column:
    rounded: "7px"
    padding: "0.5rem"
---

# Design System: Tranquility Base

## Overview

**Creative North Star: "Polar Light"**

The interface is the Moon's south pole at grazing sun: a deep-shadow ground, regolith-grey panels with warm grey text, and colour reserved for the two bodies that matter (the Sun and Earth) and for pass/fail. The 3D terrain view fills the window; every control sits over or around it as a quiet, translucent panel so the landscape stays the subject.

Density is that of an operations tool: 14px body, compact controls, tabular figures everywhere, and numbers that line up across the compare tray. Colour is semantic, never decorative. Every number comes from the engine; the renderer only draws.

**Key Characteristics:**
- Dark only (`color-scheme: dark`); near-black ground, warm-grey text.
- One meaning per colour: gold is sunlight, blue is Earth, red/green is pass/fail.
- The panorama (unrolled skyline with Sun and Earth tracks) is the signature element, repeated per scenario in the compare tray.
- Flat, translucent panels with hairline borders; shadows only on things that float above the view.
- Real icons (lucide-react), real words; no glyph icons.

## Colors

A near-monochrome warm-grey world with two celestial accents and a pass/fail pair.

### Primary
- **Grazing-Sun Gold** (sun): sunlight and only sunlight. Sun marker and track in the panorama and 3D trail, the lit state (`sunlit` text), the power-index battery fill, the sunlit ramp in the matrix and illumination map.

### Secondary
- **Earthshine Blue** (earth): Earth and only Earth. Earth marker and track, Earth-visibility ramp.

### Tertiary
- **Pass Green** (ok) and **Fail Coral** (bad, on bad-bg): constraint pass/fail. Always paired with a lucide Check/X icon and words ("5 of 5 met", "Sun 6 d min").

### Neutral
- **Deep Shadow** (ground): the page and footer background; the 3D stage itself is pure black.
- **Regolith Glass** (panel): translucent overlay panels (side panel, status, HUD) with a 12px backdrop blur.
- **Regolith Solid** (panel-solid): drawers, results column, bottom band, dialogs; also the dark text on primary buttons.
- **Raised Regolith** (raised): controls, result cards, metric tiles.
- **Dust Hairline** (line) / **Dust Edge** (line-strong): dividers and control borders, warm-grey at 10% and 22%.
- **Moon Text** (text), **Dim** (dim), **Mute** (mute): primary text, secondary text, tertiary text and panorama labels.
- **Panorama sky / terrain / ridge** (pano-sky, pano-terrain, pano-ridge): the skyline canvas only.

### Named Rules
**The Sunlight Rule.** Gold appears only where sunlight is the subject. Never as a brand accent, highlight, link or selection colour.

**The Earthshine Rule.** Blue appears only for Earth. Links, focus and selection are white or warm grey, never blue.

**The Words-With-Colour Rule.** Red and green mean pass/fail only, and never alone: every pass/fail carries a Check or X icon and words.

**The One Ramp Per Subject Rule.** Data maps use single-hue sequential ramps (13 steps, dark to light): the sun ramp for sunlight metrics, the Earth ramp for Earth metrics, the regolith ramp for everything else. Low values recede toward the ground.

## Typography

**Body Font:** Public Sans (bundled via @fontsource at 400, 600, 700; fallback system-ui, -apple-system, Segoe UI, sans-serif). One family for everything.

**Character:** A plain, public-service grotesque; legible on a projector, neutral enough that the data carries the voice.

### Hierarchy
- **Numeral large** (600, 1.6rem; 1.3rem when results are open): the HUD countdowns (Sunset in, Earthset in).
- **Headline** (700, 1rem): the app name; status and result titles at 650.
- **Title** (600, 0.9rem): sub-headings in panels.
- **Body** (400, 14px, 1.45): everything else; metric values 0.82 to 0.98rem.
- **Label** (600, 0.72rem, 0.1em tracking, uppercase, dim): section headings that name the panel they sit on (Plan, Compare, Alternatives) and HUD countdown names. Metric-tile labels use the same treatment at 0.64rem.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on body; every number in the app uses fixed-width digits.

**The Missing Glyphs Rule.** Public Sans has no ≤ ≥ ✓ ✗. Thresholds are words ("6 d min", "80 h max", "40% min", "10° max"); state uses lucide Check/X icons. Never type those glyphs.

## Layout

A full-window grid (desktop, above 860px wide): a 52px top bar; a 56px icon rail and a 300px collapsible Plan panel on the left; the 3D view filling the remaining area with overlays (status top-left, HUD top-right, results column 360px on the right, stage notes bottom-left); a bottom band (max 42vh, 38vh on windows under 800px tall) split 5:7 between timeline + panorama and the compare tray; a one-line footer. The 3D stage spans behind the rail, panel and overlays; overlays pass the pointer through except where a panel is.

The primary action (*Find alternatives*) is fixed at the foot of the Plan panel so it never scrolls away. Secondary tools (map, scenario matrix, mission room) open as non-modal drawers over the view, never as new pages.

The compare tray shows the plan plus up to three pinned scenarios in equal columns, all scrubbed by the one timeline.

Spacing rhythm is a single 12px gap (`--gap`) for panel padding, overlay insets and grid gaps, with rem steps (0.25 to 0.8rem) inside components.

**Phone and narrow windows (provisional).** Below 860px everything stacks under a 56vh 3D view: sticky top bar, horizontal rail, HUD hidden, results and tray in a single column, drawers inset 8px. This is a basic fallback pending `/impeccable adapt`; do not treat it as designed.

## Elevation & Depth

Flat and translucent. Overlays on the view use regolith glass (86% opacity, 12px backdrop blur) with a hairline border; solid panels sit in the band and drawers. Depth comes from translucency and hairlines, not shadows.

### Shadow Vocabulary
- **Drawer lift** (`box-shadow: 0 16px 48px rgb(0 0 0 / 55%)`): drawers floating over the view.
- **Tooltip lift** (`box-shadow: 0 6px 20px rgb(0 0 0 / 50%)`): glossary term tooltips.

### Named Rules
**The Float-Only Shadow Rule.** Only things that float above other UI (drawers, tooltips) cast a shadow. Panels docked to the grid or the view are flat.

## Shapes

Gently rounded and consistent: 8px for panels, drawers and dialogs; 6–7px for controls, cards and tray columns; pills (999px) for chips, tags, presets and counts; 2px for matrix cells. Borders are 1px warm-grey hairlines. No decorative borders, side stripes or clipped silhouettes.

## Components

### Buttons
- **Shape:** gently rounded (6px), 1px Dust Edge border.
- **Default:** Raised Regolith fill, Moon Text; hover lifts the fill to #252528 and the border to Mute.
- **Primary:** a light fill with dark text (Moon Text fill, Regolith Solid text, 650 weight); hover goes pure white. One per context: *Find alternatives*, dialog Close, *Start mission room*.
- **Quiet / link:** no fill or border, Dim text, warm 6% wash on hover; link buttons underline with a 3px offset.
- **Icon buttons:** lucide icon only, Dim; pressed state takes the Raised fill and border. Always an `aria-label`.
- **Segmented mode switch** (Planner / Explorer): the pressed segment is a light fill with dark text, matching primary.
- **Focus:** every focusable element gets a 2px white outline at 2px offset.

### Chips
- **Style:** pill, 0.72rem, 1px border in the state colour, a 12px lucide Check or X, then the requirement in words ("Sun 6 d min"). Fail chips add the coral wash.
- **Compact form:** in the tray, a "N of M met" tally plus only the failing chips.

### Cards / Containers
- **Panels:** Regolith Glass, 8px radius, 1px Dust Hairline, 0.8rem padding. Inside the Plan column they lose their box and separate with a hairline.
- **Result cards:** Raised fill, 7px radius; the open result takes a Moon Text border. Stale results drop to 55% opacity under an out-of-date notice.
- **Metric tiles:** Raised fill, 6px radius, uppercase 0.64rem label over a 0.98rem value; deltas animate in once (1.4s, off under reduced motion).

### Inputs / Fields
- **Style:** same as default buttons (Raised fill, Dust Edge border, 6px). Range and checkbox use Moon Text as accent colour.
- **Error:** `aria-invalid` turns the border coral; the message sits under the field in #ffb8b0 at 0.78rem, linked by `aria-describedby`.

### Navigation
- **Top bar:** app name (700) and dim tagline left; quiet icon+word actions right (Copy link, Mission room, Full screen) and the mode switch.
- **Edge rail:** icon over a 0.7rem word (Map, Scenario matrix); hover or open shows a warm 8% wash.
- **Drawers:** non-modal, Regolith Solid, 8px radius, Dust Edge border, drawer lift shadow; header with label-style title and an X icon button; take focus, close on Escape, return focus.

### Horizon Panorama (signature)
The unrolled 360° skyline (N, E, S, W left to right; −8° to 16° elevation, hairlines every 4°, the 0° horizon stronger). Terrain is a regolith fill under a lighter ridge stroke. The Sun track is gold, the Earth track blue: solid where the body clears the ridge, ghosted (32% opacity) where the ridge hides it, and ticked (2px × 14px) where it crosses the ridgeline. The elapsed part of the track is drawn larger as a trail; the current hour is a ringed disc. A compact form (no labels, thinner marks) heads each tray column, so every scenario is drawn the same way.

### Compare Tray (signature)
Plan column first, then up to three pinned columns of equal width: title and site/time, pass tally and failing chips, one-line metric rows (label left, value right, hairline between), the compact panorama, then View in 3D and Unpin. The column shown in 3D takes a brighter border and a 7% wash. Pinned columns show their difference against the plan.

## Do's and Don'ts

### Do:
- **Do** keep gold for sunlight and blue for Earth, in the UI, the panorama, the 3D trails and the data ramps alike.
- **Do** pair every pass/fail colour with a lucide Check/X icon and words.
- **Do** make the primary button a light fill with dark text, and give every focusable element the 2px white focus ring.
- **Do** write thresholds as words ("6 d min", "80 h max") and use tabular figures for every number.
- **Do** list anything the 3D view invents (soil texture, ring rock texture, ground colour, Sun glare, Earth's surface, star colours, the shadow display fill) in the *About the data* dialog and label it in the view (stage tags such as "In shadow · view brightened").
- **Do** draw every scenario the same way (chips, metrics, panorama) so differences are seen, not asserted.

### Don't:
- **Don't** let any number come from the renderer; numbers come from the engine.
- **Don't** use gold, blue, red or green as decoration, brand accent, link or selection colour.
- **Don't** type ≤ ≥ ✓ ✗; the bundled face lacks them.
- **Don't** use glyph icons or emoji; use lucide-react.
- **Don't** add shadows to docked panels; only floating drawers and tooltips cast them.
- **Don't** treat the stacked phone layout as a design to extend; it is provisional until `/impeccable adapt`.
