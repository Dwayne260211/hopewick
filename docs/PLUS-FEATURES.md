# Free and Hopewick Plus

Hopewick Plus is AU$20 a month, with a 7-day free trial. Founder accounts
(`FOUNDER_PLUS_EMAILS`) get Plus at no cost. Gates are enforced by the server;
the app only shows Plus features in a kind way and links to the existing
checkout. Plan status never deletes data. If Plus ends, everything already
saved stays, can be exported, and can be deleted at any time.

## Always free, never capped

| Feature | Notes |
| --- | --- |
| Crisis contacts and Get help | On every screen. Never gated or rate limited. |
| My safety plan | Stage 5: seven guided steps (warning signs, things I can do on my own, people and places for distraction, people to ask for help, professionals and services, making surroundings safer, reasons for living), tap-to-call services, print, offline copy, share (only when the person taps it) and version history (last 20). `/api/me/safety-plan`, `/api/me/safety-plan/versions`. Signed out, it is saved in the browser. |
| About you (preferences) | Preferred name, focus areas, tone, faith opt-in. Used by Hope on the server. `/api/me/preferences`. |
| Faith reflections and prayers | Only when the person turns faith on (off by default). `/api/me/faith`. The faith core module is free; later faith modules follow the Plus schedule. |
| Relapse prevention and exit plans | Free forever on every plan: free, trial, Plus and lapsed (founder decision, 18 Oct 2026). `/api/me/plans`. |
| Basic coping tools | The 12 core tools, plus every scheduled tool once its free date arrives. |
| Daily check-in | Unlimited. In-app history shows the last 7 days (see below). |
| My next step | One step at a time, unlimited. |
| Basic journal entries | Free writing and prompt entries. |
| Your data | Read, export everything (`/api/me/export`), and delete by area or all (`DELETE /api/me/data/:area?confirm=:area`). |
| Account and privacy controls | Including AI consent. |
| Hope (AI) | 15 messages a day. |
| Recovery tracker | Unlimited goals (AOD or wellbeing, optional label), Day N, days that went to plan, milestones, craving and lapse logging, triggers, what helped, the after-a-lapse card, export and delete. `/api/me/recovery`. Day counts always use every log. |
| Core learning modules | 7 modules of about 5 minutes: cravings and triggers, sleep, stress and anxiety, harm reduction, support in Australia, CBT basics, and ACT unhooking. Progress, private reflections (encrypted) and "try this today" are free. |

**History window.** Free accounts see the last `HISTORY_WINDOW_DAYS = 7` days
in the app (`server/wellbeing/plan-rules.js`). This is a view rule only. Older
items are kept, shown as a count with "See your full history with Plus", and
included in exports. Items that are still open (an open next step, an
in-progress activity, the active weekly plan) always show.

## Plus: built now

| Feature | Status | Where |
| --- | --- | --- |
| Full history (check-ins, activities, journal, next steps, weekly plans) | Available | Windowed GETs in `server/wellbeing/routes.js` |
| Month mood view | Available | Daily check-in |
| Monthly insight summary | Available | `/api/me/insights?month=YYYY-MM`. Describes patterns only; no diagnosis or scores. |
| Printable / PDF report | Available | `/api/me/report?from&to`. Opened with the browser's print, so it can be saved as a PDF. Journal text is never included. |
| Weekly multi-step plans | Available | My next step. `/api/me/weekly-plans`, up to 10 steps, Sunday to Saturday. No reminders. |
| Journal: Deepen with Hope | Available | Still needs AI consent each time. |
| Journal: gratitude and recovery entries | Available | |
| Journal: guided series and prompt packs | Available | Plus first, free later (see `CONTENT-RELEASES.md`). |
| New coping tools first | Available | Weekly drops, free 6 to 12 months later. |
| Unlimited Hope | Available | |
| Recovery tracker: full log history | Available | Free sees logs from the last 7 days (view only; nothing is deleted). |
| Recovery trends over 30, 90 and 365 days | Available | `/api/me/recovery/insights`. Craving counts by week, average strength, top triggers and what helped. Not an assessment or a diagnosis. |
| New learning modules first | Available | Weekly releases (DBT skills, thought record, ACT values, behavioural activation, ACT acceptance). Free 6 months after each Plus date. |
| Personal goals, resume builder, nutrition library | Available | Unchanged from earlier stages. |

## Plus: later extras (coming soon, not built)

| Extra | Status | Notes |
| --- | --- | --- |
| Recovery tracker extras: milestone calendar, habits, meeting log, printable certificates | Coming soon | The tracker and clean time stay free. |
| Faith plans, devotionals, prayer journal | Coming soon | Optional, opt-in. |
| Guided audio, meditations, sleep stories | Coming soon | Needs recording, licensing and clinical review. |
| Themes and a custom dashboard | Coming soon | |
| Photo and voice journal attachments | Coming soon | Needs storage, encryption and retention design first. |

The pricing copy in the app (Tools → Free and Plus, `#hw3CompareSections`; the
account dialog, `#accountCompare`) and on the landing page (`#plan-compare`)
marks only the built features as available. Everything in the last table is
labelled "coming soon". Each comparison is a set of collapsible `<details>`
sections, one per category, all collapsed at first, with a one-line summary
visible on each header.

## Tests

- Server (JSON and Postgres backends): `server/wellbeing.test.mjs`,
  `server/next-step.test.mjs`, `server/hope-safety.test.mjs`,
  `tests/content-releases.test.mjs`, `tests/coping-tools.test.mjs`. These
  cover free, paid Plus, trial, founder comp, and lapsed Plus keeping its data.
- Stage 4: `server/recovery.test.mjs` (JSON and Postgres), `tests/test_stage4.py` (browser).
- Browser: `tests/test_free_plus_model.py`, `tests/test_plus_gates.py`,
  `tests/test_stage3_features.py`.
