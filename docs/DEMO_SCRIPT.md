# 🎤 Demo script — 3 minutes

**Before you start**
- Open **https://tranquility-base.rohansh2017.workers.dev** in Planner mode, in a browser that has already finished
  the quick tour, so it doesn't pop up mid-demo. (To show the tour instead, open `?tour=1`.)
- The default plan is the **Shackleton rim** (Chang'e-7's target) on **2026-11-19 00:00 UTC**, which passes every
  default constraint.
- Have a **second browser window** on the same page, for the mission room.

## The script

| Time | Say | Do |
| --- | --- | --- |
| **0:00** | "At the lunar south pole the Sun never gets more than a degree or two above the horizon, so a ridge, a few hundred metres, or a few days decide whether a lander lives." | The page opens on the Moon. Point at the pins: solid passes, hollow fails. Click the **Shackleton rim** pin to fly down to its 10 km search grid. |
| **0:25** | "This is real LRO terrain. The Sun and Earth sit exactly where JPL's ephemeris puts them." | Press **Stand here**. Point at the Sun just above the ridge, and at the countdowns: *Sunset in* and *Earthset in*. |
| **0:45** | "The two numbers a planner lives by: time to sunset, and time to Earthset." | Drag the lunar-day scrubber to about **+200 h**: the Sun drops behind the ridge and the countdown flips to *Sunrise in*. |
| **1:05** | "Chang'e-7 missed its August window. Suppose the landing slips twelve days." | Set the landing date to **2026-12-01 00:00**. The plan card's tally drops and the chips turn red (*Sun*, *Dark*, *Earth*, *Landing*). |
| **1:20** | "So we ask what still works. You can just say what you need." | Type *survive 4 days of dark, talk to Earth half the time* → **Ask Gemini** → show the proposal (96 h, 50%) → **Apply and find alternatives**: ten ranked options in well under a second, each with a one-line difference. If the slipped plan still fails, point at its **Why not?** line above them: what would make it pass. |
| **1:50** | "Here's the plan next to the best alternatives." | Press the **pin** on results #1 and #2: they appear in the Compare tray beside the plan. **Open in 3D** on #1 to stand there. |
| **2:15** | "Mission control isn't one person." | **Mission room** → **Start mission room**, open the link in the second window, change the date there: the first window follows. |
| **2:40** | "Every number is real JPL ephemeris and real LRO terrain, checked against Horizons to a thousandth of a degree and against NASA's illumination maps at r 0.95 to 0.99. Explorer mode says the same in plain words." | Switch to **Explorer**. Point at the plain-language sentence. Close on *About the data*. |

> **If a step misbehaves, skip it.** The 0:00–1:05 steps and the close use no network services, so they always work.

## Alternative 1:20 beat: the slip copilot

Instead of typing constraints, describe the whole slip in one sentence and press **Ask Gemini**:

> *"my mission slipped by 11 days, stay near the rim"*

The card shows **11 days later than the original plan** (old → new date) and **Shackleton rim's grid within 5 km**. Press
**Apply and find alternatives**: the app moves the date, searches only that site's grid, and answers in a sentence built
from the results. Press it again and the landing stays 11 days after the original, not 22.

## Sentences to rehearse

| Sentence | Button | Expected result |
| --- | --- | --- |
| *survive 4 days of dark, talk to Earth half the time* | Ask Gemini | darkness 96 h · Earth 50% |
| *survive 4 days of dark, talk to Earth half the time, slopes under 8 degrees* | Ask Gemini | darkness 96 h · Earth 50% · slope 8° |
| *my mission slipped by 11 days, stay near the rim* | Ask Gemini | 11 days later than the original plan · this site's grid only |
| *slipped two weeks, anywhere on Nobile, soonest* | Ask Gemini | 14 days later · Nobile Rim 1 and 2 · earliest first |
| *we slip 3 days, move to Haworth, need Earth in view the whole time* | Ask Gemini | Haworth · 3 days later · Earth 100% |
| A nonsense or prompt-injection sentence | Ask Gemini | No values; nothing changes |

Each press is one small Gemini call (about 2 s). Gemini only proposes values: nothing changes until you confirm.

## Backup

If the venue network fails, `make dev` serves the same app from this laptop with the bundled data. The mission room and
Gemini need the Worker (`make dev-api` beside it, and it still needs the network for Gemini). The recorded video covers
the full script.
