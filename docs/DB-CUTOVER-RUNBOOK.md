# Database cut-over runbook (JSON files → Neon Postgres)

Status: **prepared and rehearsed on synthetic data only. Not run on production.**
Nothing in this runbook may be done on production without the founder's written go-ahead
(see "Approvals" at the end). Tool: `tools/migrate-json-to-postgres.mjs`.

## What the cut-over changes

Setting `DATABASE_URL` on Render switches exactly two stores to Postgres:

| Store | JSON file (Render disk `/var/data`) | With `DATABASE_URL` | Migrated by the tool |
|---|---|---|---|
| Wellbeing (check-ins v2, coping history, goals, journal, plans, next steps, weekly plans, recovery tracker, modules, preferences incl. the faith answer, safety plan + versions, consent) | `wellbeing.json` | Postgres tables from migrations 001–007 | **Yes**. Wellbeing ciphertext is decrypted in memory and sealed again for Postgres (the AES-GCM associated data differs: `<user>:wb.<field>` vs `<user>:<table>.<column>`), same `HOPEWICK_DATA_KEY`. |
| Move & Recover | `fitness.json` | `fitness_profiles`, `fitness_sessions` | **Yes**, ciphertext copied byte for byte (same associated data in both backends). |
| Accounts, sessions, passwords, Stripe / Google Play billing, trial, founder comp, Hope daily counter | `users.json` | **still `users.json`** | No. Only the account id + created time go into `app_users`. The server reads `users.json` in both modes, so entitlements cannot change. The tool fingerprints the entitlement fields before and after. |
| Saved Hope chats | `chats.json` | still `chats.json` | No (the server reads it in both modes). Titles, message text, the Bible passage and the profile name are AES-256-GCM encrypted at rest (`<user>:chat.<field>`); older plain-text chats are sealed on that account's next chat write. The tool never rewrites `chats.json`: it reports how many chats are still plain text, and every run that connects to Postgres checks `ai_conversations` / `ai_messages` per account (under RLS) and fails NOT CLEAN if any plain-text title or message is there. Those tables are expected to stay empty. |
| Hopewick 1 device-synced moods / gratitude / weekly goals | `checkins.json` | still `checkins.json` | No. |
| Page counter | `visits.json` | still `visits.json` | No (no personal data). |

So after the cut-over the Render disk is still required. Removing it is a later project.

## The tool

```
node tools/migrate-json-to-postgres.mjs --data-dir <COPY of the data folder> \
     --mode dry-run|apply|verify --env-file <private env file> \
     [--confirm-host <db host>] [--state <file>] [--report <file>] [--concurrency 4] [--recheck] [--include-orphans]
```

* `dry-run` (default): reads the copy, decrypts in memory to validate, prints per-table row counts and
  SHA-256 checksums. Writes nothing. With `DATABASE_URL` it also checks (read-only) that migrations
  001–007 are applied and shows the target row counts.
* `apply`: copies each account in its own transaction inside `withUser()` (row level security applies),
  `INSERT … ON CONFLICT DO NOTHING` on the preserved primary keys, then verifies. Needs
  `--confirm-host` equal to the `DATABASE_URL` host. `MIGRATE_FORBID_HOSTS=h1,h2` refuses listed hosts.
* `verify`: read-only. Reads every account back through the app's own Postgres store code and compares
  it with what the JSON store code returns. Per-table counts and checksums must match.
* Idempotent and resumable: `--state` records finished accounts; an interrupted run (Ctrl-C, SIGTERM,
  lost connection) leaves no half-written account and resumes where it stopped. `--recheck` re-runs
  every account (inserts nothing new if it is all there).
* Never destructive: no UPDATE, DELETE or TRUNCATE. The source folder is copied to a private temp
  folder (removed at the end, also on interrupt) and hashed before and after.
* Output: counts, checksums, account counts by plan status. No content, emails, keys or URLs.
* Exit code 0 only when the result line says `clean`.

## Rehearsal (18 Oct 2026, synthetic data only)

* Data: `tools/db/make-synthetic-store.mjs --users 60`, written with the app's own store code and a
  throwaway key (key id `t6`). 60 accounts: free 24, trialing 6, active 12, canceled 6, past_due 6,
  Google Play 6; 30 fake Stripe customers/subscriptions (`cus_TEST…`, `sub_TEST…`). 1,520 rows across
  17 tables, plus chats, legacy check-ins and the page counter.
* Target: Neon project `hopewick` (AWS Sydney), branch **`stage6-migration-rehearsal`**
  (`br-broad-cloud-a7qsxadx`), a child of `dev`. Never `main`.

| Step | Result |
|---|---|
| Dry run, offline and against the branch | clean, nothing written, source files unchanged |
| Apply, interrupted twice (SIGINT after 8 accounts, SIGTERM after 15) | no partial accounts, temp copy removed on SIGTERM, state file kept |
| Resume | found a real bug: 27 accounts refused (goals saved without a status, see QA report M7). Each refused account rolled back cleanly. Fixed, resumed: 60/60, **all 17 tables + settings match by count and SHA-256** |
| Re-run with `--recheck` (idempotency) | 0 rows added, clean |
| Stand-alone `verify` | clean, every account reads back identically |
| Ciphertext check on the branch | journal body 156/156, mood note 125/125, safety plan 47/47, fitness detail 41/41 sealed with the test key; 0 plain text |
| RLS check inside `withUser` | role `hopewick_rls`, sees only its own rows; role reset after commit |
| Guard rails | apply without `--confirm-host` refused; host in `MIGRATE_FORBID_HOSTS` refused |
| Entitlements | `users.json` fingerprint unchanged; source file hashes unchanged |

Timing from the build box (~210 ms per round trip to Sydney): apply ~4 s per account with
concurrency 4, verify ~3.7 s per account. From a machine in Australia expect several times faster.

Reports (counts and checksums only): `/workspace/hopewick-2.0/stage6-rehearsal/` on the build box.
The rehearsal branch can be deleted once the founder has seen the results (needs approval).

## Cut-over steps (production, only after approval)

Times in AEST. Pick a quiet window (for example 9:00–10:00 pm on a weeknight). Expect 30–60 minutes.

1. **Before the day**
   * Founder decisions made: Neon plan, Neon region/project, privacy pages updated (see release checklist).
   * Production branch prepared: `npm run db:migrate` against it with a private env file, then
     `npm run db:migrate:status` shows 001–007.
   * Dry run against a **copy** of a fresh backup (step 3) with `--mode dry-run` and the production
     `DATABASE_URL` in the env file: must say clean and show 0 target rows.
2. **Announce** a short maintenance window on the site (banner) 24 hours ahead.
3. **Back up the JSON files** (Render shell, read-only on the originals):
   ```
   cd /var/data && ts=$(date +%Y%m%d-%H%M) && mkdir -p /var/data/backup-$ts && cp -p *.json /var/data/backup-$ts/ && sha256sum /var/data/backup-$ts/*.json > /var/data/backup-$ts/SHA256SUMS
   ```
   Download the backup folder to the founder's encrypted storage. These files are real personal data:
   they never go to the build box, chat, email or a ticket.
4. **Freeze writes.** Turn on Render maintenance mode for the service (Settings → Maintenance mode),
   so nobody writes to the JSON files while they are copied. Crisis numbers stay on the static pages
   and in every app screen cached on the device.
5. **Copy the frozen files** to a working folder (`cp -p /var/data/*.json /var/data/cutover-copy/`) and run
   the tool **on the Render shell** (the image already contains `tools/` and `pg`, and the production
   `HOPEWICK_DATA_KEY` is already in the service environment, so the key never leaves Render). Put only
   `DATABASE_URL` in a private env file (`umask 077`, delete it afterwards); leave `DATABASE_DRIVER` unset.
   The service has 512 MB RAM; the tool holds the stores in memory, which is fine for the current size
   (check `du -sh /var/data/*.json` first; above ~100 MB, run it from a trusted machine instead):
   ```
   node tools/migrate-json-to-postgres.mjs --data-dir /var/data/cutover-copy --mode dry-run --env-file /tmp/prod.env
   node tools/migrate-json-to-postgres.mjs --data-dir /var/data/cutover-copy --mode apply \
        --env-file /tmp/prod.env --confirm-host <production db host> --state /var/data/cutover-state.json \
        --report /var/data/cutover-report.json
   node tools/migrate-json-to-postgres.mjs --data-dir /var/data/cutover-copy --mode verify --env-file /tmp/prod.env
   ```
   If it stops, re-run the same apply command (it resumes). Any `NOT CLEAN` result: stop, keep the
   site on JSON (skip to "Abort").
6. **Switch.** In Render → Environment, add `DATABASE_URL` (the pooled `-pooler` host, `sslmode=require`).
   Do not set `DATABASE_DRIVER` in production. Saving redeploys.
7. **Verify on the live site** (founder's own account and two consenting test accounts):
   * `/api/health` ok; the start-up log says Postgres reachable and encryption on `k1`.
   * Check-in history, journal, safety plan + history, recovery tracker, modules, preferences (faith
     answer unchanged), Move & Recover sessions all show the same data as before.
   * Plan badges unchanged (free / trial / Plus / founder), Hope daily counter unchanged.
   * Save one new check-in, edit it, delete it.
8. **Lift maintenance mode.** Watch Render logs and Neon monitoring for 30 minutes.
9. **Keep** the frozen JSON copy and the backup read-only for at least 30 days.

## Abort (before step 6)

Turn maintenance mode off. Nothing changed for users: the JSON files were never written by the tool.
Postgres rows from the failed attempt can stay (re-running is safe) or the production branch can be
reset by Neon restore.

## Rollback (after step 6)

1. Remove `DATABASE_URL` in Render → Environment (saving redeploys). The server goes back to the JSON
   files exactly as they were frozen in step 4.
2. **Know the cost:** wellbeing and Move & Recover changes made between step 6 and the rollback live
   only in Postgres. They are not lost (the database is untouched), but they are not visible on JSON.
   Before rolling back after more than a few minutes, export them: each person can download their data
   in the app (My data → Export); a Postgres → JSON back-fill tool does not exist yet (follow-up item).
3. Accounts, billing, chats and the Hope counter are unaffected either way (they never left `users.json`
   and `chats.json`).

## Approvals needed (founder)

* Go-ahead for the production cut-over and the date.
* Neon plan and production project/region (see `docs/STAGE6-QA-REPORT.md`, "Neon recommendation").
* `DATABASE_URL` added to Render (an env change).
* Privacy policy and data page updated for Postgres, AWS region and the Stage 3–5 data before step 6.
* Handling of the JSON backup (who keeps it, where, for how long).
