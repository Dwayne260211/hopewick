# JSON → Postgres migration plan

Status: **plan only. No production data has been moved.** Production keeps the JSON
files on the Render disk until every step below has been rehearsed on a Neon
development branch and the founder approves the cut-over.

## What moves, and what does not

| Today (Render disk / browser) | Postgres table | Notes |
|---|---|---|
| `users.json` account id | `app_users.id` | Only the id. Email, password hash, sessions, Stripe and Google Play billing, trial and founder comp **stay in `users.json`**. Subscription logic (AU$20/month, 7-day trial, 15 free Hope messages a day, founder comp) is unchanged. |
| `chats.json` (account → profile → conversations) | `ai_conversations`, `ai_messages` | Keep the 24-month retention rule (`CHAT_RETENTION_MS`, by `updated`) and "free accounts open the latest chat" (`FREE_HISTORY_KEEP`). Expired chats are not imported. |
| `checkins.json` moods + gratitude | `mood_entries` | Labels Great/Good/Okay/Low/Stressed/Tired → `mood_label` (+ `mood_score` 6..1). Cravings None/Mild/Moderate/Strong unchanged. ≤3 gratitude items. |
| `checkins.json` weekly SMART goals | `goals` | `week_start` is the Sunday; `timebound` → `time_bound`; midweek answer still/change/letgo. |
| Browser-only data (journal, plans, clean time, memories, step work) | `journal_entries`, `safety_plans`, `recovery_milestones`, `learning_progress`, ... | Never on our server today. Only uploaded later, from the person's own device, **after they opt in** (`consent_preferences`: `journal_sync`, `safety_plan_sync`). No bulk import exists for these. |
| `visits.json` | not migrated | Page counter only, no personal data. |

## Steps

1. **Rehearse on a branch.** Create a Neon branch from `main` (e.g. `import-rehearsal`),
   run `npm run db:migrate` against it, then run the importer (below) against a **copy**
   of the JSON files. Never against the live disk files in place.
2. **Importer (to be written, `tools/db/import-json.mjs`).**
   * Reads copies of `users.json`, `chats.json`, `checkins.json`.
   * For each account, runs inside `withUser(id)`, so RLS applies during the import too.
   * Idempotent: upserts on natural keys (`(user_id, profile_id, entry_date)` for moods,
     `(user_id, profile_id, week_start, position)` for goals,
     `(user_id, profile_id, client_id)` for chats). Re-running gives the same result.
   * Encrypts sensitive text with `HOPEWICK_DATA_KEY` if set.
   * Writes a summary only (counts per table). It never prints content.
3. **Verify** (script output kept with the release notes):
   * Row counts per table = counts computed from the JSON copy (after dropping
     expired chats).
   * Per account: a SHA-256 over a canonical JSON of that account's check-ins, goals and
     chats, computed from the JSON copy and from Postgres (after decrypting). All
     hashes must match.
   * Spot-check five consenting test accounts in the app (founder's own included).
   * `npm run test:db` against the branch.
4. **Dual-write (behind a flag, e.g. `DB_DUAL_WRITE=1`).** The server keeps reading
   JSON and also writes each check-in/goal/chat change to Postgres. A nightly
   compare job reports mismatches. Run for at least two weeks with zero mismatches.
5. **Read switch (flag `DB_READ=1`).** Reads come from Postgres; JSON writes continue
   for one more release as a fallback copy.
6. **Stop JSON writes.** Keep the final JSON files read-only on the disk for 30 days.

## Rollback

* Steps 1-4: turn the flag off and redeploy. JSON is still the source of truth; the
  Postgres copy can be dropped and re-imported at any time.
* Step 5: set `DB_READ=0`. JSON files are still being written, so nothing is lost.
* Step 6: re-run the importer in reverse (Postgres → JSON export, same verification
  hashes) from the 30-day window, or restore Neon to a point in time
  (Neon branch restore / `restore_snapshot`) and replay.
* Schema: migrations only move forward. A bad migration is fixed by a new migration;
  for an emergency, restore the Neon branch to the time before the migration.

## Restore drill (before step 4, then every quarter)

1. Create a branch from `main` at a past timestamp.
2. Run `npm run db:migrate:status` and the verification script against it.
3. Record the time taken. Delete the drill branch.

## Approvals needed before step 1 on production

* `DATABASE_URL` and `HOPEWICK_DATA_KEY` added to Render (secrets).
* Neon plan choice (backup / point-in-time retention).
* Privacy policy and data page updated to say where data is stored (Neon, AWS Sydney)
  before any production writes.
