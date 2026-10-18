# Move & Recover: 30-Minute Move, sauna, cold and contrast protocols

**Status: live.** The founder (Dwayne) confirmed the clinical review on 18 Oct 2026 and
approved switching it on with defaults D1–D5 as built. Production runs with
`FEATURE_FITNESS_PROTOCOLS=1` on Render (JSON store, so migration 006 is not used there).
To turn it off quickly, set `FEATURE_FITNESS_PROTOCOLS=0` and redeploy or restart.

Design source: `hopewick-2.0/fitness-research/FITNESS-RECOVERY-PROTOCOLS.md`
(research brief, outside the repo). Sources: `docs/CONTENT-SOURCES.md`, section
"Move & Recover".

## What it is

- **30-Minute Move** (Plus): 5 min warm-up, 20 min main block, 5 min cool-down, on a
  7-day rotation (Mon Strength A, Tue steady cardio, Wed mobility and balance,
  Thu Strength B, Fri intervals, Sat your choice (advanced can do Strength C), Sun gentle recovery).
  Three levels; six tracks (standard, seated, back, knee, hip, shoulder) that swap
  moves and add notes. 50 exercises, each with how-to steps, form cues, and easier
  and harder options. All wording is original.
- **Heat & cold** (Plus): sauna, cold water and contrast guides in stages, unlocked
  only by the heat and cold safety screen, with a pre-session check every time.
- **Safety rules and research info** (free, every plan): `GET /api/fitness/safety`.
- **Hopewick tie-ins**: mood taps before and after each session; "Add to My Next
  Step"; a "Move this week" weekly plan in My Next Step (heat or cold steps only if
  unlocked); a weekly movement summary (minutes vs 150, strength days vs 2), kept
  separate from clean time; heat and cold not suggested on a Struggling or
  strong-craving check-in day; Plus weekly drops.

## Switching it on

| `FEATURE_FITNESS_PROTOCOLS` | Effect |
| --- | --- |
| unset, `0`, `off`, anything else | **Off** (default). Every `/api/fitness/*` route returns 404 `{"error":"Not found."}`, the same as an unknown URL. The app shows nothing: no Tools card, no tab, no teaser. |
| `1`, `on`, `true`, `yes` | On for everyone. Plus gates still apply. Safety info is public. |
| `founder` | Founder preview: only accounts in `FOUNDER_PLUS_EMAILS` (never the Play reviewer). Shows a "Founder preview for Dwayne" banner. |

The flag is read on every request (`server/fitness/flag.js`), so a local `.env` or a
test can change it. Local preview: `FEATURE_FITNESS_PROTOCOLS=1 npm start`.

`FITNESS_PLUS_START=YYYY-MM-DD` (Brisbane) starts the Plus weekly drops; unset opens
everything. Drops: wk1 program + beginner + movement screen; wk2 intermediate and
advanced; wk3 adapted tracks; wk4 mobility and gentle recovery; wk5 heat and cold
safety questions; wk6 sauna; wk7 cold; wk8 contrast. Safety info is never scheduled.

## Gates (all on the server, `server/fitness/routes.js`)

1. Flag (404). 2. Sign-in (401), except `GET /safety`. 3. Plus (403 `code: "plus"`):
   `publicUser().plus`, so paid, trialing and founder comp count. 4. Release drop
   (403 `not_released`). 5. Safety screen per area (move, sauna, cold, contrast):
   red never unlocks; amber unlocks only after the doctor's-OK tick. 6. The
   pre-session check for every heat, cold or contrast session, re-run on the server
   when the session starts (a client cannot skip it).

## Endpoints

| Method and path | Who | What |
| --- | --- | --- |
| `GET /api/fitness/safety` | anyone (flag on) | Free rules, stop signs, research info, pain guide |
| `GET /api/fitness/status` | signed in | Flag, Plus, rules, pending decisions, drops; for Plus: screen status per area, pause, today's suggestion, week summary |
| `GET /api/fitness/program` | Plus | Workouts built for the person's level and track, exercise library |
| `GET /api/fitness/protocols` | Plus | Per protocol: released, screen status, and the steps only once unlocked |
| `GET /api/fitness/screen/questions` | Plus | Question text only (the outcome logic stays on the server) |
| `POST /api/fitness/screen` | Plus | `{part: "move"\|"heat-cold", answers, agree}`; stores the result only |
| `POST /api/fitness/screen/clearance` | Plus | `{confirm: true, areas}`; amber only |
| `POST /api/fitness/check` | Plus | Pre-session check verdict; a reported use stores the 24 h pause |
| `POST /api/fitness/sessions` | Plus | `{kind, planKey, check?, moodBefore?}` |
| `PATCH /api/fitness/sessions/:id` | Plus | `{status, durationSeconds, moodAfter, stoppedForSymptoms}`; symptoms ask for a fresh screen |
| `GET /api/fitness/sessions`, `GET /api/fitness/summary` | Plus | History and the week |
| `PUT /api/fitness/prefs` | Plus | `{level, track}` |
| `POST /api/fitness/next-step`, `POST /api/fitness/weekly-plan` | Plus | My Next Step tie-ins |
| `DELETE /api/fitness/data?confirm=fitness` | signed in, every plan | Delete Move & Recover data for this profile |

Export (`GET /api/me/export`) adds `moveAndRecover` when the flag is on for that person.
"Delete all" (`DELETE /api/me/data/all`) and account deletion always clear it.

## Defaults pending founder and clinical sign-off

Each is one value in `server/fitness/rules.js`. The server, the screen, the check
and the app copy all read from there.

| ID | Default | Setting |
| --- | --- | --- |
| D1 | Heat, cold and contrast sessions lock for **24 h** after any reported alcohol or other drug use. Answering "no" later does not undo it. Workouts are not locked (gentle movement stays available). | `substanceLockHours: 24` |
| D2 | Sauna and cold are locked (temporary red) during withdrawal or detox, now or in the last 2 weeks; re-check after **14 days**. | `withdrawalLocksHeatCold: true`, `withdrawalRecheckDays: 14` |
| D3 | Cold floor **10 °C**: the session will not start below it, or if the temperature is unknown. | `coldFloorC: 10` |
| D4 | Sauna and cold are **not suggested** (a warning, not a block) on a "Struggling" (mood 1) or "Strong" craving check-in day. | `notSuggestedOnStruggling: true` |
| D5 | A stable, managed heart condition gives **amber**: unlock only after the doctor's-OK tick. | `stableHeartOutcome: 'amber'` (set `'red'` to lock) |

Other limits (also pending review): cold up to 5 min; sauna up to 20 min a round,
2 rounds; contrast up to 3 rounds, 45 min of sauna; cold kept 6 h away from strength
sessions (warning); re-screen every 6 months; other temporary reds (surgery,
wounds) re-check after 42 days; a just-finished screen can be corrected within 15
minutes, otherwise a temporary red holds until its re-check date.

## Screen outcomes (`server/fitness/screen.js`)

Part A (movement, paraphrasing the principles of the ESSA/Fitness Australia/SMA
APSS): chest pain (A2) and fainting with activity (A3) are red; withdrawal now (A9)
is a temporary red; the others are amber. Part B (heat and cold): unstable heart,
chest pain or unexplained fainting, stroke/TIA/aneurysm, pregnancy, recent surgery
(temporary) and withdrawal (temporary, D2) are red for all three; long QT or
methadone, uncontrolled blood pressure, epilepsy and eating disorder are red for
cold and contrast and amber for sauna; Raynaud's and cold urticaria are red for cold
and contrast; stable heart (D5), diabetes neuropathy, kidney or liver disease and the
listed medicines are amber; MS is amber for sauna and contrast; 65+ is amber for cold
and contrast; no support person keeps cold plunges and contrast locked (a cold shower
finish is still allowed alone). The person must agree to the rules.

**Only the result is stored**: outcome per area, completed and expiry dates, any
re-check date and the doctor's-OK tick. The answers are evaluated and discarded. The
reasons are shown once and not saved.

## Storage

Same pattern as Stage 3: Postgres when `DATABASE_URL` is set
(`migrations/006_fitness_protocols.sql`, RLS like 002), otherwise `fitness.json`
beside `users.json` (`FITNESS_STORE`), atomic writes, fail-loud on corruption (only
Move & Recover answers 503; the rest of the app keeps working). The screen result,
pause time, preferences and session detail are AES-256-GCM encrypted with
`HOPEWICK_DATA_KEY`, bound to `<userId>:fitness.<field>`.

## Files

`server/fitness/{rules,flag,content,screen,store,routes}.js`,
`migrations/006_fitness_protocols.sql`, `app/hw-fitness.js`, `app/hw-fitness.css`,
small hooks in `app/index.html` (tab `move`, Tools card) and `server/index.js`,
two hooks in `server/wellbeing/routes.js` (export, delete all).
Tests: `server/fitness.test.mjs` (JSON and Postgres), `tests/test_fitness_protocols.py`
(browser; `HW_FIT_SCREENS=dir` saves screenshots).

## Accessibility

Mobile first, tokens from `assets/hopewick-tokens.css`, light and dark. Questions are
fieldsets with legends and real radio inputs; the timer is `role="timer"` with
`aria-live="off"` and announces start, 10 seconds left and each next step through the
polite live region; start/pause is a toggle button with `aria-pressed`; progress
bars have values; the bar animation is off under `prefers-reduced-motion`. Stop
("something doesn't feel right") is always on screen during a session.

## Review needed before switching on

- **Clinician (GP or AOD medical officer):** the whole screen, outcomes D1–D5, the
  pre-session check, the protocols and the support-person script.
- **Accredited exercise physiologist:** the program, levels, adapted tracks, pain
  guide and every exercise's wording.
- **Pharmacist:** medicines in B3 and B11 against current Australian product information.
- **Founder (Dwayne):** D1–D5, drop dates (`FITNESS_PLUS_START`), and then the flag.
