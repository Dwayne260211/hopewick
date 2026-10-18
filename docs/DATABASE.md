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

## Before production uses this (needs founder approval)

1. Add `DATABASE_URL` (Neon `main` branch, pooled) and `HOPEWICK_DATA_KEY` to Render
   as secrets. Not done.
2. Decide the Neon plan (the free plan suspends compute when idle and has limited
   history/backup retention; a paid plan gives longer point-in-time restore).
3. Consider latency: Render runs in Singapore, the database is in Sydney.
4. Follow `docs/DB-MIGRATION-PLAN.md`.
