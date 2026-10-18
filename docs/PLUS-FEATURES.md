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
| My safety plan essentials | Warning signs, things that help, people, safe places, reasons. `/api/me/safety-plan`. |
| Basic coping tools | The 12 core tools, plus every scheduled tool once its free date arrives. |
| Daily check-in | Unlimited. In-app history shows the last 7 days (see below). |
| My next step | One step at a time, unlimited. |
| Basic journal entries | Free writing and prompt entries. |
| Your data | Read, export everything (`/api/me/export`), and delete by area or all (`DELETE /api/me/data/:area?confirm=:area`). |
| Account and privacy controls | Including AI consent. |
| Hope (AI) | 15 messages a day. |

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
| Personal goals, relapse and exit plans, resume builder, nutrition library | Available | Unchanged from earlier stages. |

## Plus: later extras (coming soon, not built)

| Extra | Status | Notes |
| --- | --- | --- |
| Learning courses | Coming soon | The first lesson of each course is free. |
| Recovery tracker extras: milestone calendar, habits, meeting log, printable certificates | Coming soon | Clean time itself stays free. |
| Faith plans, devotionals, prayer journal | Coming soon | Optional, opt-in. |
| Guided audio, meditations, sleep stories | Coming soon | Needs recording, licensing and clinical review. |
| Themes and a custom dashboard | Coming soon | |
| Photo and voice journal attachments | Coming soon | Needs storage, encryption and retention design first. |

The pricing copy in the app (`#hw3CompareTable`, account dialog) and on the
landing page marks only the built features as available. Everything in the last
table is labelled "coming soon".

## Tests

- Server (JSON and Postgres backends): `server/wellbeing.test.mjs`,
  `server/next-step.test.mjs`, `server/hope-safety.test.mjs`,
  `tests/content-releases.test.mjs`, `tests/coping-tools.test.mjs`. These
  cover free, paid Plus, trial, founder comp, and lapsed Plus keeping its data.
- Browser: `tests/test_free_plus_model.py`, `tests/test_plus_gates.py`,
  `tests/test_stage3_features.py`.
