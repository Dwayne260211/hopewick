# Content releases: Plus first, then free

Hopewick Plus members get new content first. Every new item becomes free
later, 6 to 12 months after its Plus date. The schedule is data, not code.

- **Data:** `server/library/content-releases.json`. This file is not served to the
  browser, so locked bodies and items that are not out yet never leave the server.
  That is why it lives here and not under `app/data`.
- **Server module:** `server/content-releases.js` loads and validates the file.
  `normalizeReleases` checks the items, `statusFor` and `publicItem` decide what
  each account can see, and `createReleaseCatalog` gives the server gates
  `list`, `find` and `allows`. Set `HOPEWICK_RELEASES_PATH` to load another
  file, for example in tests.
- **Endpoints:**
  - `GET /api/content/releases` lists what this account can see.
  - `GET /api/content/item/:id` returns one item: the body when it is
    available, `403` with a title and teaser only when it is locked, and `404`
    when the item is unknown or not out yet. Signed-out visitors count as free.
    If the schedule fails to load, both endpoints return `503` and the 12 core
    tools keep working.

## Rules

| Rule | Detail |
| --- | --- |
| Dates | `plusReleaseDate` and `freeReleaseDate` are `YYYY-MM-DD` in Brisbane time. |
| Default free date | When `freeReleaseDate` is left out, it is the Plus date + 6 months. |
| Allowed free date | 6 to 12 months after the Plus date. Anything else fails validation, and the server will not start with a bad schedule. |
| Core items | `"core": true` means always free, from day one. The 12 launch coping tools are core. Never take a core item away from free. |
| Before the Plus date | The item is invisible to everyone. |
| Plus date to free date | Plus members see and use the item. Free accounts see the title and teaser only, with "Coming to free in <month>". |
| After the free date | Everyone can use it. |
| Badges | "New for Plus this week" shows for the first 7 days after the Plus date. "Coming to free in <month>" shows until the free date. |
| Gates | Gates are enforced by the server. Starting a locked coping tool, or saving a journal entry with a locked `packId`, returns `403` with code `plus`. |

Safety content is never scheduled. Crisis contacts, Get help, safety plan
essentials, the core coping tools, the daily check-in and My next step are always
free.

## Adding a weekly Plus drop

1. Write the content. It must pass a clinical and safety review before release
   (founder sign-off). No diagnosis, no promises of outcomes, and every tool
   points to Get help if someone feels unsafe.
2. Add an item to `items` in `server/library/content-releases.json`.

   **Coping tool (`kind: "coping"`):**
   ```json
   {
     "id": "coping-<slug>",
     "kind": "coping",
     "key": "<tool-key>",
     "title": "Up to 120 characters",
     "teaser": "Up to 280 characters; free accounts see only this",
     "plusReleaseDate": "2026-10-25",
     "freeReleaseDate": "2027-04-25",
     "content": { "type": "grounding|breathing|mindfulness|...", "icon": "…", "minutes": 3,
                  "tags": ["…"], "short": "…", "intro": "…",
                  "steps": [{ "title": "…", "text": "…" }, { "title": "…", "text": "…" }] }
   }
   ```
   A new coping `key` must also be added to `COPING_TOOLS` in
   `server/wellbeing/validate.js`, using an existing type, so that check-ins and
   activities accept it. A coping tool needs at least two steps.

   **Journal pack (`kind: "journal-pack"`):** `content.prompts` is a list of
   `{ "title", "text" }`. Set `"series": true` for a day-by-day series.
3. Validate the schedule:
   `node --test tests/content-releases.test.mjs tests/coping-tools.test.mjs`
4. Commit on a branch and open a PR. The item goes live for Plus on its Plus
   date without another deploy, because dates are checked when each request is
   made.

   **Learning module (`kind: "module"`):** the item's `key` must match a module
   `id` in `server/library/learning-modules.json` (loaded by `server/learning.js`,
   path override `MODULES_PATH`). The module body comes from that file. The
   release item holds only the schedule, title and teaser. A module validates
   only when it is 2 to 8 minutes long and has 3 to 8 steps with exactly one
   practical "try" step. Quizzes need 2 or 3 questions, each with kind feedback
   for both answers. Timers must be under 3 minutes, and every source needs an
   https link. Each module is marked `review: "pending"` (clinical review) and
   says so in the app. `PUT /api/me/learning/:id` returns `404` when the module
   is not out yet for this account and `403` (code `plus`) when it is locked.

## Current schedule (October 2026)

| Item | Kind | Plus | Free |
| --- | --- | --- | --- |
| 12 launch coping tools | coping (core) | 2026-10-18 | 2026-10-18 |
| Self-compassion break | coping | 2026-10-18 | 2027-04-18 |
| First 30 days (series, 7 prompts) | journal-pack | 2026-10-18 | 2027-04-18 |
| Steady evenings (5 prompts) | journal-pack | 2026-10-18 | 2027-04-18 |
| 7 core learning modules: cravings and triggers, sleep, stress and anxiety, harm reduction, support in Australia, CBT basics, ACT unhooking | module (core) | 2026-10-18 | 2026-10-18 |
| DBT skills: TIPP, STOP, opposite action, wise mind | module | 2026-10-18 | 2027-04-18 |
| Your thought record (CBT) | module | 2026-10-25 | 2027-04-25 |
| ACT: what matters to you (values card sort, committed action) | module | 2026-11-01 | 2027-05-01 |
| Behavioural activation (CBT) | module | 2026-11-08 | 2027-05-08 |
| ACT: making room (acceptance and expansion) | module | 2026-11-15 | 2027-05-15 |
| Faith on hard days (optional faith layer) | module (core, faith) | 2026-10-18 | 2026-10-18 |
| Grace after a lapse (optional faith layer) | module (faith) | 2026-11-22 | 6 months later (default) |

Faith items (`"faith": true` on the module) are **never listed, locked or unlocked**, unless the
profile switched the faith layer on (`/api/me/preferences` → `faithOptIn`). The catalog takes
`{ plus, faith }`; `/api/content/releases?profileId=` reads the signed-in person's preference on the
server. Weekly faith content joins the Plus schedule like any module; the small free core is one
module plus the daily reflections and prayers. All faith content is pending founder and pastoral review.
