# Hopewick database layer (Postgres on Neon)

Status: **code only, not used by production.** The live site keeps using the JSON
files (`users.json`, `chats.json`, `checkins.json`, `visits.json`) on the Render disk.
Nothing in `server/index.js` reads or writes Postgres for requests yet. When
`DATABASE_URL` is set, the server only logs whether the database is reachable and
which schema version it is on (host name only, never the URL).

## Where things are

| Path | What it does |
|---|---|
| `migrations/NNN_name.sql` | Versioned schema. Applied in order, each in one transaction. Never edit an applied file: add a new one. |
| `server/db/migrate.js` | Runner + CLI. Records each file in `schema_migrations` with a SHA-256 checksum and refuses to run if an applied file changed. Uses a transaction-scoped advisory lock so two runners cannot apply at once. |
| `server/db/index.js` | Pool (only created when `DATABASE_URL` is set; `pg` is not even imported otherwise), `withUser()`, `probeDatabase()`. |
| `server/db/repo.js` | Per-user functions (profiles, consent, check-ins, journal, safety plan, delete-all). Not wired to routes yet. |
| `server/db/crypto.js` | Optional app-level AES-256-GCM encryption for the most sensitive text. |
| `server/db.test.mjs` | Live tests. Run only when `DATABASE_URL` is set (env or local `.env`), skipped otherwise. |
| `server/db-optional.test.mjs`, `server/db-crypto.test.mjs` | Always run, no database needed. |

## Commands

```bash
npm run db:migrate          # apply pending migrations (DATABASE_URL from env or local .env)
npm run db:migrate:status   # list applied / pending, change nothing
npm run test:db             # DB tests (live part skips without DATABASE_URL)
```

Local development uses the Neon branch **`dev`** of project `hopewick`
(`bold-frog-27259139`, AWS ap-southeast-2 Sydney). Put its connection string in the
untracked `.env` as `DATABASE_URL=...`. Never point local work or tests at Neon `main`.
The live tests create and delete throwaway users named `dbtest_*`.

If your network blocks outbound port 5432, add `DATABASE_DRIVER=neon-websocket` to the
local `.env`. That uses Neon's WebSocket driver over port 443 (dev dependency only,
never installed in the Docker image). Do not set it on Render.

## Tables (migrations/001_init.sql)

Every table is keyed by the account id (`user_id`, the same id as in `users.json`),
`NOT NULL`, with a foreign key to `app_users(id) ON DELETE CASCADE`, so deleting an
account removes all of its rows in one statement. `profile_id` matches the app's local
profiles (`main` by default). Every list query has an index that starts with `user_id`.

| Table | Purpose | Sensitive columns |
|---|---|---|
| `app_users` | One row per account id (no email, no password, no billing: those stay in `users.json`). | none |
| `user_profiles` | Display name, companion mode, faith preference, theme, time zone. | `display_name`, `faith` |
| `consent_preferences` / `consent_events` | Current consent per key + the full history of changes. | none |
| `mood_entries` | Daily check-in: mood (1-6 + label), craving level, up to 3 gratitude items, note. One per profile per day. | `gratitude`, `note`, `craving_level`, `mood_*` |
| `recovery_milestones` | Clean-time start date, milestones, resets. One current start date per profile. | `label`, `note` |
| `goals` | Weekly SMART goals (week starts Sunday, enforced). | goal text |
| `journal_entries` | Journal. | `title`, `body`, `refined` (**encrypted when key set**) |
| `guided_activity_history` | Skills, circuit breakers, breathing etc. used. | `note` |
| `learning_progress` | 12 Steps, Going deeper, Bible/SOAP, education progress. | `note` (step work) |
| `safety_plans` | Stanley-Brown safety plan sections + relapse plan. One per profile, version counter. | all text (**encrypted when key set**) |
| `next_step_items` | My Next Step items. | `detail` |
| `ai_conversations` / `ai_messages` | Saved chats with Hope. A message's `user_id` must match its conversation's owner (composite FK). | `title`, `content` |
| `notification_preferences` | Email / reminder choices, quiet hours. | none |

All columns marked `-- SENSITIVE` in the SQL are health information under the
Australian Privacy Principles. They must never be logged, sent to analytics, or
copied to another system without consent.

## Per-user access (enforced on the server, twice)

1. Every repository function takes the **signed-in user's id from the session** (never
   from the request body) and filters with `WHERE user_id = $1`.
2. Row level security is **enabled and forced** on every user table, with a policy
   `user_id = current_setting('app.user_id')`. `withUser(userId, fn)` opens a
   transaction, sets `app.user_id`, and switches to the `hopewick_rls` role
   (`migrations/002`). That role cannot log in and has no `BYPASSRLS`, which matters
   because Neon's owner role does bypass RLS. So a query that forgot its `WHERE`
   clause still only sees and writes that one user's rows. Without `app.user_id`
   nothing is visible at all. The live tests check all of this.

## Encryption

* **At rest (Neon):** all Neon storage, backups and branches are encrypted at rest
  (AES-256) and every connection uses TLS (`sslmode=require`, verified). This is on
  by default and needs no setup.
* **App-level (optional, recommended for production):** set `HOPEWICK_DATA_KEY`
  (base64 of 32 random bytes) and the server encrypts journal text, safety-plan text
  and check-in notes with AES-256-GCM **before** they reach the database. A database
  dump, backup or Neon branch alone then does not reveal them. Each value is bound
  to its user and column (GCM associated data), so ciphertext cannot be copied
  between users. Stored as `hwenc:v1:<keyId>:<base64>`; rows record
  `encryption = 'aes-256-gcm-v1'`.

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  * Store the key in Render's environment (secret) **and** in a password manager.
    **If the key is lost, encrypted text cannot be recovered.**
  * Rotation: set the new key as `HOPEWICK_DATA_KEY` with a new
    `HOPEWICK_DATA_KEY_ID` (e.g. `k2`), and the old one as
    `HOPEWICK_DATA_KEY_PREVIOUS=k1:<old base64>`. Old values still decrypt; new
    writes use `k2`. A re-encrypt job can then rewrite old rows before removing the
    previous key.
  * Trade-off: encrypted columns cannot be searched in SQL. That is intended.
  * Length limits on encrypted columns are checked on the plain text in
    `server/db/repo.js`; the SQL caps are sized for ciphertext.
  * **Startup check (Stage 4):** at startup the server logs one line, for
    example `Wellbeing encryption: on (aes-256-gcm-v1, key id k1). Sensitive
    wellbeing text is sealed before it reaches the Postgres store.` It can also say `OFF` when no key is set, or
    `MISCONFIGURED (<reason>)` when the key is malformed. The line never
    includes key material (`encryptionStartupLine` in `server/db/crypto.js`).
    After a deploy, check the Render logs for this line.

## Stage 3 wellbeing data (migrations/003_stage3_core_features.sql)

Stage 3 is the first feature set that **uses** storage for requests. Everything
goes through one interface, `server/wellbeing/index.js` → `createWellbeingStore()`:

| Backend | When | File |
| --- | --- | --- |
| Postgres | `DATABASE_URL` is set | `server/wellbeing/pg-store.js` (uses `withUser()` + RLS) |
| JSON file | `DATABASE_URL` is not set (production today) | `server/wellbeing/json-store.js` → `wellbeing.json` beside `users.json` (or `WELLBEING_STORE`) |

Both backends pass the same contract tests (`server/wellbeing.test.mjs`). The JSON
store uses `server/json-file.js`: atomic writes (temp file + rename + `.bak`) and
fail-loud loading (a corrupt file is never overwritten; `/api/health` returns 503).
Data is keyed by account id, then profile id. When `HOPEWICK_DATA_KEY` is set,
sensitive fields (feelings, triggers, notes, journal text, goal and step text,
plans) are AES-256-GCM encrypted in both backends, bound to the user and field.

Migration 003 (applied to the Neon **dev** branch only, 2026-10-18 14:10 AEST):

* `mood_entries`: feelings, triggers, intensity 0–10, `mood_scale` (v1 = older
  6-label check-ins, v2 = the 5-point scale), encryption metadata.
* `guided_activity_history`: more activity types, `status`
  started/paused/completed, `step_index`, `started_at`, `updated_at`.
* New `personal_goals` (title, detail, category wellbeing/recovery/emotional/other,
  status active/completed/archived, progress 0–100) with FORCE RLS + owner policy.
* `journal_entries`: `kind` (free/prompt/gratitude/recovery), `prompt`, `entry_date`.
* `next_step_items`: reflection, coping tool key, follow-up opt-in (stored only;
  nothing is sent).
* `consent_records`: keys `checkin_ai_share`, `journal_ai`, `next_step_followup`.

API: `/api/me/settings`, `/api/me/checkins`, `/api/me/activities`, `/api/me/goals`,
`/api/me/journal` (+ `/export?format=json|md`, `/import`), `/api/me/plans`
(+ `/import`), `/api/me/next-steps`. All need a signed-in session (401 otherwise),
are scoped to the account and profile, and Plus gates (journal and goal writes,
plan edits) are enforced on the server. Reading, exporting, deleting and
importing your own data stay free. Check-ins and coping are free.

One-time import: on first sign-in with Stage 3, journal entries and plans that
exist only in the browser are offered for upload. Nothing moves without a "Yes";
"No" keeps them on the device and is remembered. The browser copy is never deleted
by the import.

## Free vs Plus model (migrations/004_free_plus_model.sql)

- `journal_entries.pack_id`: the guided series or prompt pack an entry came from, if any.
- `weekly_step_plans`: weekly multi-step plans for Plus members. Each row is per user and per profile, with RLS and a policy
  on `app.user_id` like the other Stage 3 tables. Steps are sealed with the same per-field encryption.
- The safety plan essentials are stored in the existing plans document under `safety`. No new table is needed.
- Plan status never deletes rows. The 7-day free history window is applied when data is read
  (`server/wellbeing/plan-rules.js`).

Migration 004 was applied to the Neon **dev** branch only, on 2026-10-18 AEST, by the db test run. Production needs it
when `DATABASE_URL` is set there, and that needs founder approval.

## Stage 4: recovery tracker and learning modules (migrations/005_recovery_education.sql)

| Table | What it holds | Encrypted columns |
| --- | --- | --- |
| `recovery_goals` | One row per goal: kind (`abstain`, `reduce`, `other`), optional label, target, why, start date, status (`active`, `paused`, `archived`). `UNIQUE (user_id, profile_id, id)`. | `label`, `target`, `why` |
| `recovery_logs` | Craving and lapse logs: goal, date, kind (`craving`, `lapse`), intensity 0 to 10, outcome (`passed`, `used`, `unsure`), triggers, what helped, note. Has a composite FK to `recovery_goals` with `ON DELETE CASCADE`, so deleting a goal deletes its logs. | `triggers`, `helped`, `note` |
| `module_progress` | Learning module progress: PK `(user_id, profile_id, module_id)`, step (0 to 40), completed time, quiz result, and private notes (reflection, values, thought record) as one sealed JSON field. | `notes` (AAD `module_progress.notes`) |

`learning_progress` already exists from 001 (the older pathways), so the new
table is called `module_progress`. All three tables have RLS `ENABLE` and
`FORCE`, owner-only policies on `app.user_id`, and grants to `hopewick_rls`, the
same as 003 and 004. The JSON store (`server/wellbeing/json-store.js`) has the
same methods and seals the same fields. Older JSON files without these fields
load cleanly. Deleting by area (`recovery`, `learning`) and the full export
(`recoveryTracker`, `learning`) cover both backends.

Day counts are kind by design. "Day N" counts from the start date and never
resets. "Days that went to plan" leaves out days with a lapse. A milestone
counts days that went to plan, and once reached it stays reached.

Migration 005 was applied to the Neon **dev** branch only, on 2026-10-18 AEST.
It has not been applied to production. That needs founder approval with the
other production steps below.

## Move & Recover (migrations/006_fitness_protocols.sql)

- Behind `FEATURE_FITNESS_PROTOCOLS` (off by default). See `docs/FITNESS-PROTOCOLS.md`.
- `fitness_profiles` (per user and profile): the safety screen **result only** (never the answers), the pause after a
  reported alcohol or drug use, and level/track preferences. All three are encrypted text.
- `fitness_sessions`: workout, sauna, cold and contrast sessions. `detail` (moods, stopped early, water temperature) is encrypted.
- RLS, `FORCE ROW LEVEL SECURITY`, an owner policy on `app.user_id` and grants to `hopewick_rls`, like 002–004.
- Numbered 006 because the Stage 4 branch uses 005. 006 does not depend on 005; the runner applies pending versions in order.

Migration 006 was applied to the Neon **dev** branch only (`br-wispy-scene-a71x1uld`), on 2026-10-18 AEST.

## Stage 5: safety plan history and preferences (migrations/007_safety_faith_personal.sql)

- `safety_plan_versions` (user_id, profile_id, version): every safety plan save or restore keeps a
  sealed copy (`plan`, AAD `user:safety_plan_versions.plan`), `reason` in (save, restore), `saved_at`.
  The server keeps the last 20 per profile. Deleting the `plans` area clears it.
- `user_preferences` (user_id, profile_id): one sealed JSON document (`prefs`, AAD
  `user:user_preferences.prefs`): preferred name, focus areas, tone, faith opt-in and tradition,
  onboarded and updated times. Nothing is inferred; only what the person chose. Delete area `preferences`.
- Both tables: RLS enabled and forced, owner-only policies as in 002, granted to `hopewick_rls`.
- The JSON store keeps the same data on the profile row (`preferences`, `safetyVersions`), sealed
  with `seal(userId, 'prefs')` and `seal(userId, 'safety.version')`.
- Numbered 007 because 006 is Move & Recover. The runner applies versions in order; neither depends on the other.

Migration 007 was applied to the Neon **dev** branch only (`br-wispy-scene-a71x1uld`), on 2026-10-18 AEST.
It is not applied to `main` or used in production (production runs the JSON store).

## Before production uses this (needs founder approval)

1. Add `DATABASE_URL` (Neon `main` branch, pooled) and `HOPEWICK_DATA_KEY` to Render
   as secrets. Not done.
2. Decide the Neon plan (the free plan suspends compute when idle and has limited
   history/backup retention; a paid plan gives longer point-in-time restore).
3. Consider latency: Render runs in Singapore, the database is in Sydney.
4. Follow `docs/DB-MIGRATION-PLAN.md`.
