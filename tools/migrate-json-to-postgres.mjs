#!/usr/bin/env node
/**
 * Hopewick JSON store -> Postgres (Neon) migration. Prepared for the cut-over in
 * docs/DB-CUTOVER-RUNBOOK.md. Rehearsed on SYNTHETIC data only.
 *
 *   node tools/migrate-json-to-postgres.mjs --data-dir <COPY of the data folder> [--mode dry-run|apply|verify]
 *        [--env-file <file with DATABASE_URL / HOPEWICK_DATA_KEY>] [--confirm-host <db host>]
 *        [--state <resume file>] [--report <json file>] [--include-orphans] [--recheck] [--concurrency 1-8, default 4]
 *
 * Modes
 *   dry-run (default)  Reads the JSON files, decrypts in memory to validate, prints per-table counts and
 *                      SHA-256 checksums. Writes NOTHING to the database. If DATABASE_URL is set it also
 *                      checks (read-only) that migrations 001-007 are applied and how many rows exist.
 *   apply              Copies every account inside its own transaction (withUser: RLS applies), then verifies.
 *                      Requires --confirm-host equal to the DATABASE_URL host.
 *   verify             Read-only. Reads every account back through the app's own Postgres store code and
 *                      compares it with what the app's JSON store code returns for the same account.
 *
 * Guarantees
 *   - The source files are never opened for writing. They are copied to a private temp folder first
 *     (the JSON store code refreshes a .bak when it opens a file), hashed before and after, and the
 *     run fails if a hash changed. The temp copy is deleted at the end.
 *   - Idempotent and resumable: inserts use ON CONFLICT DO NOTHING on the preserved primary keys, an
 *     account is all-or-nothing (one transaction), and --state records finished accounts so a re-run
 *     skips them. Nothing is updated, truncated or deleted. A conflicting existing row is left alone
 *     and shows up as a verify mismatch.
 *   - IDs and timestamps are preserved (uuid ids, created/updated/started/completed/saved times).
 *   - Encryption: Move & Recover ciphertext is copied as-is (both backends bind it to
 *     "<user>:fitness.<field>"). Wellbeing ciphertext is bound to "<user>:wb.<field>" in the JSON store
 *     and to "<user>:<table>.<column>" in Postgres (AES-GCM associated data), so it cannot be reused:
 *     it is decrypted in memory and sealed again with the same HOPEWICK_DATA_KEY. Plain text is never
 *     printed or written anywhere except the sealed column.
 *   - What does NOT move: users.json (email, password hash, sessions, Stripe and Google Play billing,
 *     trial, founder comp), chats.json, checkins.json and visits.json. The server reads those files from
 *     the Render disk whether or not DATABASE_URL is set, so they stay authoritative and untouched. Only
 *     the account id and created time go into app_users. The report fingerprints the entitlement fields
 *     so the cut-over can prove they did not change.
 *   - Output is counts, checksums and account counts only. No content, no emails, no keys, no URL.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createJsonWellbeingStore } from '../server/wellbeing/json-store.js';
import { createPgWellbeingStore } from '../server/wellbeing/pg-store.js';
import { createJsonFitnessStore, createPgFitnessStore } from '../server/fitness/store.js';
import { withUser, closePool, databaseHost, dbEnabled, getPool } from '../server/db/index.js';
import { encryptText, encryptionEnabled, encryptionStatus, ENC_SCHEME, isEncrypted } from '../server/db/crypto.js';
import { LIMITS, SETTINGS, isUuid } from '../server/wellbeing/validate.js';
import { helpfulToScore } from '../server/wellbeing/model.js';
import { listMigrations } from '../server/db/migrate.js';

/* ------------------------------- options ------------------------------- */
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const MODE = opt('mode', flag('apply') ? 'apply' : flag('verify') ? 'verify' : 'dry-run');
const DATA = opt('data-dir') ? path.resolve(opt('data-dir')) : '';
if (!['dry-run', 'apply', 'verify'].includes(MODE) || !DATA) {
  console.error('Usage: node tools/migrate-json-to-postgres.mjs --data-dir <copy of data folder> [--mode dry-run|apply|verify] [--env-file f] [--confirm-host h] [--state f] [--report f]');
  process.exit(2);
}
const env = { ...process.env };
if (opt('env-file')) {
  // KEY=VALUE lines. Values are never printed.
  for (const line of fs.readFileSync(opt('env-file'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const log = (...a) => console.log(...a);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const short = (h) => (h ? h.slice(0, 16) : '-');
const USER_RE = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Stable JSON: object keys sorted, so equal data hashes equally whatever the key order. */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v === undefined ? null : v;
}
const sortBy = (list, key) => (Array.isArray(list) ? list.slice().sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : String(a[key]) > String(b[key]) ? 1 : 0)) : list);

/* --------------------------- source snapshot --------------------------- */
const FILES = ['users.json', 'wellbeing.json', 'fitness.json', 'chats.json', 'checkins.json', 'visits.json'];
if (!fs.existsSync(path.join(DATA, 'users.json'))) { console.error(`No users.json in ${DATA}.`); process.exit(2); }
const hashFiles = () => Object.fromEntries(FILES.filter((f) => fs.existsSync(path.join(DATA, f))).map((f) => [f, sha(fs.readFileSync(path.join(DATA, f)))]));
const before = hashFiles();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-migrate-'));
// An interrupted run must not leave a copy of the stores behind. The state file keeps progress, so a re-run resumes.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    process.stderr.write(`\nInterrupted (${sig}). Temporary copy removed. Re-run with the same --state file to resume.\n`);
    process.exit(130);
  });
}
fs.chmodSync(work, 0o700);
for (const f of Object.keys(before)) fs.copyFileSync(path.join(DATA, f), path.join(work, f));
const readRaw = (f, empty) => (fs.existsSync(path.join(work, f)) ? JSON.parse(fs.readFileSync(path.join(work, f), 'utf8')) : empty);
const rawUsers = readRaw('users.json', { users: [] });
const rawWb = readRaw('wellbeing.json', { users: {} });
const rawFit = readRaw('fitness.json', { users: {} });
const rawChats = readRaw('chats.json', { users: {} });
const rawCheckins = readRaw('checkins.json', { users: {} });
const rawVisits = readRaw('visits.json', {});
const jsonWb = createJsonWellbeingStore(path.join(work, 'wellbeing.json'), { env });
const jsonFit = createJsonFitnessStore(path.join(work, 'fitness.json'), { env });

let exitCode = 0;
const problems = [];
const report = { mode: MODE, at: new Date().toISOString(), encryption: encryptionStatus(env).state, tables: {}, accounts: {}, notMigrated: {}, sourceFiles: {} };

/* ------------------------------ accounts ------------------------------ */
const accountIds = new Set(rawUsers.users.map((u) => u.id));
const dataIds = new Set([...Object.keys(rawWb.users || {}), ...Object.keys(rawFit.users || {})]);
const orphans = [...dataIds].filter((id) => !accountIds.has(id));
const includeOrphans = flag('include-orphans');
const userIds = [...accountIds, ...(includeOrphans ? orphans : [])].filter((id) => USER_RE.test(id)).sort();
const badIds = [...accountIds].filter((id) => !USER_RE.test(id));
if (badIds.length) problems.push(`${badIds.length} account id(s) in users.json do not match the app_users id format and were skipped.`);
const createdAt = new Map(rawUsers.users.map((u) => [u.id, u.createdAt || null]));

// Entitlements stay in users.json. Fingerprint them so the cut-over can show they did not change.
const ENT = ['id', 'subscriptionStatus', 'stripeCustomerId', 'stripeSubscriptionId', 'currentPeriodEnd', 'cancelAtPeriodEnd', 'billingProvider', 'playPurchaseToken', 'trialEnd', 'createdAt'];
const entRows = rawUsers.users.map((u) => ENT.map((k) => (u[k] === undefined ? null : u[k]))).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const byStatus = {};
for (const u of rawUsers.users) {
  const k = `${u.billingProvider === 'google_play' ? 'play:' : ''}${u.subscriptionStatus || 'none'}`;
  byStatus[k] = (byStatus[k] || 0) + 1;
}
report.accounts = {
  usersJson: rawUsers.users.length, withStripeCustomer: rawUsers.users.filter((u) => u.stripeCustomerId).length,
  withStripeSubscription: rawUsers.users.filter((u) => u.stripeSubscriptionId).length, byStatus,
  entitlementFingerprint: sha(JSON.stringify(entRows)), orphanDataAccounts: orphans.length, includeOrphans,
};

/* --------------------- what the JSON store holds --------------------- */
const TABLES = ['app_users', 'consent_preferences', 'consent_events', 'mood_entries', 'guided_activity_history', 'personal_goals', 'journal_entries',
  'safety_plans', 'next_step_items', 'weekly_step_plans', 'recovery_goals', 'recovery_logs', 'module_progress', 'user_preferences',
  'safety_plan_versions', 'fitness_profiles', 'fitness_sessions'];
const PART = { // snapshot key -> table
  checkins: 'mood_entries', activities: 'guided_activity_history', goals: 'personal_goals', journal: 'journal_entries', plans: 'safety_plans',
  steps: 'next_step_items', weeklyPlans: 'weekly_step_plans', recoveryGoals: 'recovery_goals', recoveryLogs: 'recovery_logs', learning: 'module_progress',
  preferences: 'user_preferences', safetyVersions: 'safety_plan_versions', fitnessProfile: 'fitness_profiles', fitnessSessions: 'fitness_sessions',
};
const profilesOf = (u) => [...new Set([...Object.keys(rawWb.users?.[u]?.profiles || {}), ...Object.keys(rawFit.users?.[u]?.profiles || {})])].sort();
const consentRows = (u) => {
  const s = rawWb.users?.[u]?.settings || {};
  return Object.entries(s).filter(([k, v]) => SETTINGS[k] && !(SETTINGS[k].kind === 'import' && v === 'pending'))
    .map(([k, v]) => ({ key: SETTINGS[k].consentKey, granted: SETTINGS[k].kind === 'bool' ? v === true : v === 'done' }));
};
const consentEvents = (u) => (rawWb.users?.[u]?.consentEvents || []).filter((e) => e && e.value !== 'pending');

/** One account as the app sees it, read through a store (JSON or Postgres). Lists sorted for hashing. */
const normalised = {};
async function snapshot(u, W, F, { source }) {
  const out = { settings: await W.getSettings(u), profiles: {} };
  for (const p of profilesOf(u)) {
    const rp = rawWb.users?.[u]?.profiles?.[p];
    const fp = rawFit.users?.[u]?.profiles?.[p];
    const s = {};
    if (rp) {
      s.checkins = sortBy(await W.listCheckins(u, p), 'id');
      s.activities = sortBy(await W.listActivities(u, p, { limit: LIMITS.activities }), 'id');
      s.goals = sortBy(await W.listGoals(u, p), 'id');
      // A goal saved without a status is shown as active by the app; Postgres requires the value.
      if (source) for (const g of s.goals) if (!g.status) { g.status = 'active'; normalised.goalStatus = (normalised.goalStatus || 0) + 1; }
      s.journal = sortBy(await W.listJournal(u, p), 'id');
      s.plans = await W.getPlans(u, p);
      s.steps = sortBy(await W.listSteps(u, p), 'id');
      s.weeklyPlans = sortBy(await W.listWeeklyPlans(u, p), 'id');
      s.recoveryGoals = sortBy(await W.listRecoveryGoals(u, p), 'id');
      s.recoveryLogs = sortBy(await W.listRecoveryLogs(u, p), 'id');
      s.learning = sortBy(await W.listLearning(u, p), 'moduleId');
      s.preferences = rp.preferences ? await W.getPreferences(u, p) : null;
      s.safetyVersions = sortBy(await W.listSafetyVersions(u, p), 'version');
    }
    if (fp) {
      s.fitnessProfile = await F.getProfile(u, p);
      s.fitnessSessions = sortBy(await F.listSessions(u, p), 'id');
    }
    out.profiles[p] = s;
  }
  if (source) out.consent = { prefs: consentRows(u).length, events: consentEvents(u).length };
  return out;
}
const countOf = (key, v) => (v == null ? 0 : Array.isArray(v) ? v.length : 1);
function tally(snap, u, into) {
  const add = (t, n, rows) => { into[t] = into[t] || { count: 0, parts: [] }; into[t].count += n; if (rows !== undefined) into[t].parts.push([u, rows]); };
  add('app_users', 1, [u]);
  for (const [p, s] of Object.entries(snap.profiles)) {
    for (const [k, t] of Object.entries(PART)) if (k in s) add(t, countOf(k, s[k]), [p, s[k]]);
  }
  add('settings', 0, snap.settings);
}
const digest = (parts) => sha(JSON.stringify(canon(parts.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)))));

/* ------------------------------ writing ------------------------------ */
function rowsInvalid(snap) {
  const bad = [];
  for (const [p, s] of Object.entries(snap.profiles)) {
    if (!PROFILE_RE.test(p)) bad.push(`profile id format`);
    for (const k of ['checkins', 'activities', 'goals', 'journal', 'steps', 'weeklyPlans', 'recoveryGoals', 'recoveryLogs', 'fitnessSessions']) {
      for (const r of s[k] || []) if (!isUuid(r.id)) bad.push(`${k} id is not a uuid`);
    }
  }
  return [...new Set(bad)];
}

async function writeAccount(u, snap) {
  const enc = encryptionEnabled(env) ? ENC_SCHEME : 'none';
  const seal = (field, v) => (v == null || v === '' ? null : encryptText(String(v), env, `${u}:${field}`));
  const encOf = (...vals) => (vals.some((v) => isEncrypted(v)) ? ENC_SCHEME : 'none');
  // Rows are queued per table and written as multi-row INSERTs (one round trip per table and chunk), in TABLES order
  // so parents land before children. ON CONFLICT DO NOTHING keeps re-runs harmless.
  const batches = new Map();
  const queue = (table, cols, vals) => {
    if (!batches.has(table)) batches.set(table, { cols, rows: [] });
    batches.get(table).rows.push(vals);
  };
  const flush = async (c) => {
    for (const t of TABLES) {
      const b = batches.get(t);
      if (!b) continue;
      const per = Math.max(1, Math.floor(30000 / b.cols.length));
      for (let i = 0; i < b.rows.length; i += per) {
        const chunk = b.rows.slice(i, i + per);
        const ph = chunk.map((r, j) => `(${r.map((_, k) => `$${j * b.cols.length + k + 1}`).join(', ')})`).join(', ');
        bump(t, (await c.query(`INSERT INTO ${t} (${b.cols.join(', ')}) VALUES ${ph} ON CONFLICT DO NOTHING`, chunk.flat())).rowCount);
      }
    }
  };
  const added = {};
  const bump = (t, n) => { added[t] = (added[t] || 0) + n; };
  await withUser(u, async (c) => {
    bump('app_users', (await c.query('INSERT INTO app_users (id, created_at) VALUES ($1, coalesce($2::timestamptz, now())) ON CONFLICT (id) DO NOTHING', [u, createdAt.get(u) || null])).rowCount);
    const events = consentEvents(u);
    const lastAt = (key) => events.filter((e) => e.key === key).map((e) => e.at).sort().pop() || null;
    for (const r of consentRows(u)) {
      bump('consent_preferences', (await c.query(`INSERT INTO consent_preferences (user_id, consent_key, granted, policy_version, updated_at)
        VALUES ($1, $2, $3, $4, coalesce($5::timestamptz, now())) ON CONFLICT DO NOTHING`,
      [u, r.key, r.granted, (events.find((e) => e.key === r.key) || {}).policyVersion || 'stage3-2026-10', lastAt(r.key)])).rowCount);
    }
    // consent_events has no natural key: copy the history once, only into an account that has none.
    const have = Number((await c.query('SELECT count(*)::int AS n FROM consent_events WHERE user_id = $1', [u])).rows[0].n);
    if (!have) {
      for (const e of events) {
        queue('consent_events', ['user_id', 'consent_key', 'granted', 'policy_version', 'source', 'created_at'],
          [u, e.key, e.value === true || e.value === 'done', e.policyVersion || 'stage3-2026-10', e.source === 'import' ? 'import' : 'app', e.at || new Date().toISOString()]);
      }
    }
    for (const [p, s] of Object.entries(snap.profiles)) {
      for (const r of s.checkins || []) {
        queue('mood_entries', ['id', 'user_id', 'profile_id', 'entry_date', 'mood_score', 'mood_label', 'craving_level', 'feelings', 'triggers', 'intensity', 'note', 'mood_scale', 'encryption', 'created_at', 'updated_at'],
          [r.id, u, p, r.date, r.mood ?? null, r.moodLabel ?? null, r.craving ?? null, seal('mood_entries.feelings', r.feelings), seal('mood_entries.triggers', JSON.stringify(r.triggers || [])),
            r.intensity ?? null, seal('mood_entries.note', r.notes), 'v2', enc, r.createdAt, r.updatedAt]);
      }
      for (const r of s.activities || []) {
        queue('guided_activity_history', ['id', 'user_id', 'profile_id', 'activity_type', 'activity_key', 'status', 'step_index', 'started_at', 'updated_at', 'completed_at', 'duration_seconds', 'helpfulness', 'note', 'encryption'],
          [r.id, u, p, r.toolType, r.toolKey, r.status, r.stepIndex || 0, r.startedAt, r.updatedAt, r.completedAt, r.durationSeconds ?? null, helpfulToScore(r.helpful), seal('guided_activity_history.note', r.note), enc]);
      }
      for (const r of s.goals || []) {
        queue('personal_goals', ['id', 'user_id', 'profile_id', 'title', 'detail', 'category', 'status', 'progress', 'encryption', 'created_at', 'updated_at', 'completed_at'],
          [r.id, u, p, seal('personal_goals.title', r.title), seal('personal_goals.detail', r.detail), r.category, r.status, r.progress || 0, enc, r.createdAt, r.updatedAt, r.completedAt]);
      }
      for (const r of s.journal || []) {
        queue('journal_entries', ['id', 'user_id', 'profile_id', 'client_id', 'title', 'body', 'refined', 'emotions_text', 'kind', 'prompt', 'entry_date', 'pack_id', 'encryption', 'created_at', 'updated_at'],
          [r.id, u, p, r.clientId || null, seal('journal_entries.title', r.title), seal('journal_entries.body', r.body), seal('journal_entries.refined', r.refined), seal('journal_entries.emotions_text', r.emotions),
            r.kind, r.prompt || null, r.entryDate || null, r.packId || null, enc, r.createdAt, r.updatedAt]);
      }
      if (s.plans) {
        const { updatedAt, version, ...doc } = s.plans;
        queue('safety_plans', ['user_id', 'profile_id', 'relapse_plan', 'version', 'encryption', 'created_at', 'updated_at'],
          [u, p, seal('safety_plans.relapse_plan', JSON.stringify(doc)), version || 1, enc, updatedAt, updatedAt]);
      }
      for (const r of s.steps || []) {
        queue('next_step_items', ['id', 'user_id', 'profile_id', 'title', 'detail', 'source', 'status', 'coping_key', 'followup_opt_in', 'reflection', 'encryption', 'created_at', 'updated_at', 'completed_at'],
          [r.id, u, p, seal('next_step_items.title', r.title), seal('next_step_items.detail', r.detail), r.source, r.status, r.copingKey || null, !!r.followUpOptIn, seal('next_step_items.reflection', r.reflection), enc, r.createdAt, r.updatedAt, r.completedAt]);
      }
      for (const r of s.weeklyPlans || []) {
        queue('weekly_step_plans', ['id', 'user_id', 'profile_id', 'week_start', 'title', 'steps', 'status', 'encryption', 'created_at', 'updated_at', 'completed_at'],
          [r.id, u, p, r.weekStart, seal('weekly_step_plans.title', r.title), seal('weekly_step_plans.steps', JSON.stringify(r.steps || [])), r.status, enc, r.createdAt, r.updatedAt, r.completedAt]);
      }
      for (const r of s.recoveryGoals || []) {
        queue('recovery_goals', ['id', 'user_id', 'profile_id', 'kind', 'label', 'target', 'why', 'start_date', 'status', 'encryption', 'created_at', 'updated_at'],
          [r.id, u, p, r.kind, seal('recovery_goals.label', r.label), seal('recovery_goals.target', r.target), seal('recovery_goals.why', r.why), r.startDate, r.status, enc, r.createdAt, r.updatedAt]);
      }
      for (const r of s.recoveryLogs || []) {
        queue('recovery_logs', ['id', 'user_id', 'profile_id', 'goal_id', 'kind', 'log_date', 'intensity', 'outcome', 'triggers', 'helped', 'note', 'encryption', 'created_at', 'updated_at'],
          [r.id, u, p, r.goalId || null, r.kind, r.date, r.intensity ?? null, r.outcome || null, seal('recovery_logs.triggers', JSON.stringify(r.triggers || [])), seal('recovery_logs.helped', r.helped), seal('recovery_logs.note', r.note), enc, r.createdAt, r.updatedAt]);
      }
      for (const r of s.learning || []) {
        const notes = Object.keys(r.notes || {}).length ? seal('module_progress.notes', JSON.stringify(r.notes)) : null;
        queue('module_progress', ['user_id', 'profile_id', 'module_id', 'step', 'quiz_correct', 'quiz_total', 'notes', 'encryption', 'started_at', 'updated_at', 'completed_at'],
          [u, p, r.moduleId, r.step || 0, r.quiz ? r.quiz.correct : null, r.quiz ? r.quiz.total : null, notes, enc, r.startedAt || r.updatedAt, r.updatedAt, r.completedAt]);
      }
      if (s.preferences) {
        const at = rawWb.users[u].profiles[p].preferences.updatedAt || s.preferences.updatedAt || null;
        queue('user_preferences', ['user_id', 'profile_id', 'prefs', 'encryption', 'created_at', 'updated_at'],
          [u, p, seal('user_preferences.prefs', JSON.stringify(s.preferences)), enc, s.preferences.onboardedAt || at || new Date().toISOString(), at || new Date().toISOString()]);
      }
      for (const r of s.safetyVersions || []) {
        queue('safety_plan_versions', ['user_id', 'profile_id', 'version', 'reason', 'plan', 'encryption', 'saved_at'],
          [u, p, r.version, r.reason || 'save', seal('safety_plan_versions.plan', JSON.stringify(r.safety || {})), enc, r.savedAt]);
      }
      const fp = rawFit.users?.[u]?.profiles?.[p];
      if (fp) {
        // Same associated data in both backends: copy the stored (sealed) values byte for byte.
        queue('fitness_profiles', ['user_id', 'profile_id', 'screen', 'lock_until', 'prefs', 'encryption'],
          [u, p, fp.screen ?? null, fp.lockUntil ?? null, fp.prefs ?? null, encOf(fp.screen, fp.lockUntil, fp.prefs)]);
        for (const r of fp.sessions || []) {
          queue('fitness_sessions', ['id', 'user_id', 'profile_id', 'kind', 'plan_key', 'status', 'started_at', 'updated_at', 'completed_at', 'duration_seconds', 'detail', 'encryption'],
            [r.id, u, p, r.kind, r.planKey, r.status, r.startedAt, r.updatedAt, r.completedAt, r.durationSeconds || 0, r.detail ?? null, encOf(r.detail)]);
        }
      }
    }
    await flush(c);
  }, env);
  return added;
}

async function targetCounts(u) {
  return withUser(u, async (c) => {
    // One round trip per account: Neon latency dominates otherwise.
    const sql = TABLES.map((t) => `SELECT '${t}' AS t, count(*)::int AS n FROM ${t} WHERE ${t === 'app_users' ? 'id' : 'user_id'} = $1`).join(' UNION ALL ');
    const out = Object.fromEntries(TABLES.map((t) => [t, 0]));
    for (const r of (await c.query(sql, [u])).rows) out[r.t] = Number(r.n);
    return out;
  }, env);
}

/* --------------------------------- run --------------------------------- */
// Accounts are independent, so a few run at once: on a high-latency link the round trips dominate.
const CONCURRENCY = Math.max(1, Math.min(8, Number(opt('concurrency') || 4)));
env.DATABASE_POOL_MAX = String(Math.max(Number(env.DATABASE_POOL_MAX || 0), CONCURRENCY + 1));
async function eachLimit(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); }
  }));
}
const statePath = opt('state') ? path.resolve(opt('state')) : '';
const loadState = () => (statePath && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { host: null, done: {} });
const saveState = (st) => { if (!statePath) return; const tmp = `${statePath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(st, null, 1), { mode: 0o600 }); fs.renameSync(tmp, statePath); };

async function main() {
  log(`Hopewick JSON -> Postgres migration (${MODE}). Source: ${DATA}`);
  log(`Wellbeing encryption key: ${report.encryption}${report.encryption === 'on' ? ` (key id ${encryptionStatus(env).keyId})` : ''}.`);
  if (report.encryption === 'misconfigured') throw new Error('HOPEWICK_DATA_KEY is misconfigured. Stopping before reading encrypted data.');
  const useDb = dbEnabled(env);
  if (MODE !== 'dry-run' && !useDb) throw new Error(`--mode ${MODE} needs DATABASE_URL (pass --env-file).`);
  let host = null;
  if (useDb) {
    host = databaseHost(env);
    log(`Target database host: ${host}`);
    const forbid = String(env.MIGRATE_FORBID_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (forbid.includes(host)) throw new Error('That host is listed in MIGRATE_FORBID_HOSTS. Stopping.');
    if (MODE === 'apply' && opt('confirm-host') !== host) throw new Error('--mode apply needs --confirm-host <the DATABASE_URL host> so the target is chosen on purpose.');
    const pool = await getPool(env);
    const applied = (await pool.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => Number(r.version));
    const need = listMigrations().map((m) => m.version);
    const missing = need.filter((v) => !applied.includes(v));
    log(`Schema: migrations applied ${applied.join(', ') || 'none'}${missing.length ? `; MISSING ${missing.join(', ')}` : ' (all present)'}.`);
    report.schema = { applied, missing };
    if (missing.length && MODE !== 'dry-run') throw new Error('Run npm run db:migrate on the target first (it only adds tables).');
  }

  // 1. What the JSON store holds (always).
  const expected = {};
  const snaps = new Map();
  const invalid = new Map();
  for (const u of userIds) {
    const snap = await snapshot(u, jsonWb, jsonFit, { source: true });
    snaps.set(u, snap);
    const bad = rowsInvalid(snap);
    if (bad.length) invalid.set(u, bad);
    tally(snap, u, expected);
    expected.consent_preferences = expected.consent_preferences || { count: 0, parts: [] };
    expected.consent_preferences.count += snap.consent.prefs;
    expected.consent_events = expected.consent_events || { count: 0, parts: [] };
    expected.consent_events.count += snap.consent.events;
  }
  if (invalid.size) problems.push(`${invalid.size} account(s) have rows that cannot be stored as-is (${[...new Set([...invalid.values()].flat())].join('; ')}). They are skipped by apply.`);

  // 2. Apply.
  const st = loadState();
  if (MODE === 'apply') {
    if (st.host && st.host !== host) throw new Error('The --state file belongs to a different database host.');
    st.host = host;
    let doneNow = 0; let skipped = 0; let failed = 0;
    await eachLimit(userIds, async (u) => {
      if (invalid.has(u)) { failed += 1; return; }
      if (st.done[u] && !flag('recheck')) { skipped += 1; return; }
      try {
        const added = await writeAccount(u, snaps.get(u));
        st.done[u] = { at: new Date().toISOString(), added: Object.values(added).reduce((a, b) => a + b, 0) };
        saveState(st);
        doneNow += 1;
      } catch (err) {
        failed += 1;
        problems.push(`account ${u.slice(0, 6)}…: ${String(err.message || err).slice(0, 160)}`); // message only, never the row
      }
    });
    log(`Apply: ${doneNow} account(s) copied, ${skipped} already done (state file), ${failed} not copied.`);
    report.apply = { copied: doneNow, alreadyDone: skipped, failed };
  }

  // 3. Verify (after apply, or on its own).
  const actual = {};
  const actualCounts = {};
  if (MODE !== 'dry-run' || useDb) {
    const pgWb = createPgWellbeingStore({ env });
    const pgFit = createPgFitnessStore({ env });
    let mismatched = 0;
    await eachLimit(userIds, async (u) => {
      const counts = await targetCounts(u);
      for (const [t, n] of Object.entries(counts)) actualCounts[t] = (actualCounts[t] || 0) + n;
      if (MODE === 'dry-run') return;
      if (!counts.app_users) { mismatched += 1; return; }
      const snap = await snapshot(u, pgWb, pgFit, { source: false });
      tally(snap, u, actual);
      if (JSON.stringify(canon(snap.profiles)) !== JSON.stringify(canon(snaps.get(u).profiles)) || JSON.stringify(canon(snap.settings)) !== JSON.stringify(canon(snaps.get(u).settings))) mismatched += 1;
    });
    if (MODE !== 'dry-run') {
      report.verify = { accounts: userIds.length, mismatchedAccounts: mismatched };
      if (mismatched) problems.push(`${mismatched} account(s) read back differently from the JSON store.`);
    }
  }

  // 4. Report.
  log('');
  log('table                       source rows   target rows   source sha256      target sha256      ok');
  for (const t of [...TABLES, 'settings']) {
    const e = expected[t] || { count: 0, parts: [] };
    const a = actual[t];
    const eh = e.parts.length ? digest(e.parts) : null;
    const ah = a && a.parts.length ? digest(a.parts) : (a ? null : undefined);
    const tc = t === 'settings' ? '' : (actualCounts[t] ?? '');
    let ok = '';
    if (MODE !== 'dry-run') {
      const countOk = t === 'settings' || t === 'consent_preferences' || t === 'consent_events' ? (t === 'settings' ? true : actualCounts[t] === e.count) : actualCounts[t] === e.count;
      const hashOk = ['consent_preferences', 'consent_events'].includes(t) ? true : eh === (ah === undefined ? null : ah);
      ok = countOk && hashOk ? 'yes' : 'NO';
      if (ok === 'NO') problems.push(t === 'settings' ? 'settings: checksum differs.' : `${t}: source ${e.count} / target ${actualCounts[t] ?? 0}${hashOk ? '' : ', checksum differs'}.`);
    }
    report.tables[t] = { source: t === 'settings' ? undefined : e.count, target: tc === '' ? undefined : tc, sourceSha256: eh, targetSha256: ah ?? null, ok: ok || undefined };
    log(`${t.padEnd(28)}${String(t === 'settings' ? '' : e.count).padStart(11)}   ${String(tc).padStart(11)}   ${short(eh).padEnd(17)}  ${short(ah ?? null).padEnd(17)}  ${ok}`);
  }
  const conv = Object.values(rawChats.users || {}).flatMap((r) => Object.values(r.profiles || r || {})).flatMap((p) => (Array.isArray(p) ? p : (p && p.conversations) || []));
  report.notMigrated = {
    'users.json': { accounts: rawUsers.users.length, note: 'stays on disk: email, password hash, sessions, Stripe/Google Play billing, trial, founder comp' },
    'chats.json': { accounts: Object.keys(rawChats.users || {}).length, conversations: conv.length, note: 'stays on disk (the server reads it in both modes)' },
    'checkins.json': { accounts: Object.keys(rawCheckins.users || {}).length, note: 'legacy Hopewick 1 check-ins, stays on disk' },
    'visits.json': { note: 'page counter, no personal data, stays on disk', keys: Object.keys(rawVisits || {}).length },
  };
  report.normalised = normalised;
  if (Object.keys(normalised).length) log(`\nNormalised while copying (the app already treats these the same way): ${JSON.stringify(normalised)}.`);
  log('');
  log(`Accounts in users.json: ${report.accounts.usersJson} (by status ${JSON.stringify(byStatus)}); Stripe customers ${report.accounts.withStripeCustomer}, subscriptions ${report.accounts.withStripeSubscription}.`);
  log(`Entitlement fingerprint (users.json, not migrated): ${short(report.accounts.entitlementFingerprint)}…  Orphan data accounts: ${orphans.length}${includeOrphans ? ' (included)' : ' (skipped)'}.`);
  log(`Not migrated, stay on disk: chats.json ${report.notMigrated['chats.json'].accounts} accounts / ${conv.length} chats; checkins.json ${report.notMigrated['checkins.json'].accounts} accounts; visits.json.`);
}

try {
  await main();
} catch (err) {
  problems.push(String(err.message || err));
  exitCode = 1;
} finally {
  await closePool().catch(() => {});
  const after = hashFiles();
  const changed = Object.keys(before).filter((f) => before[f] !== after[f]);
  report.sourceFiles = Object.fromEntries(Object.entries(before).map(([f, h]) => [f, { sha256: h, unchanged: after[f] === h }]));
  if (changed.length) problems.push(`SOURCE FILES CHANGED DURING THE RUN: ${changed.join(', ')}. Investigate before any cut-over.`);
  log(`Source files unchanged: ${changed.length ? 'NO' : 'yes'} (${Object.keys(before).join(', ')}).`);
  fs.rmSync(work, { recursive: true, force: true });
  report.problems = problems;
  if (opt('report')) fs.writeFileSync(path.resolve(opt('report')), JSON.stringify(report, null, 2), { mode: 0o600 });
  if (problems.length) { exitCode = exitCode || 1; log(`\nProblems (${problems.length}):`); for (const p of problems) log(`  - ${p}`); }
  log(problems.length ? '\nRESULT: NOT CLEAN. Do not cut over.' : `\nRESULT: ${MODE === 'dry-run' ? 'dry run clean (nothing written)' : 'clean: every account reads back identically'}.`);
  process.exit(exitCode);
}
