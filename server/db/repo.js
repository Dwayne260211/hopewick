// Per-user repository functions over Postgres. Not wired to routes yet.
//
// Every function takes the signed-in user's id first, runs inside withUser()
// (row level security scoped to that id) AND filters by user_id explicitly.
// Never pass a user id that came from the request body: use the session's id.
import { withUser, assertUserId } from './index.js';
import { encryptText, decryptText, encryptionEnabled, ENC_SCHEME } from './crypto.js';

const PROFILE_RE = /^[A-Za-z0-9_-]{1,64}$/;
function profileOf(p) {
  const id = p == null || p === '' ? 'main' : String(p);
  if (!PROFILE_RE.test(id)) throw new Error('Invalid profile id.');
  return id;
}
const aad = (userId, field) => `${userId}:${field}`;

/** Plain-text length limits (the DB caps are sized for ciphertext, see 001_init.sql). */
function limit(value, max, field, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new Error(`${field} is required.`);
    return value ?? null;
  }
  const text = String(value);
  if (text.length > max) throw new Error(`${field} is longer than ${max} characters.`);
  return text;
}

async function ensureUser(client, userId) {
  await client.query('INSERT INTO app_users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
}

/* ---------- profiles ---------- */
export async function upsertProfile(userId, profileId, fields = {}, env = process.env) {
  const pid = profileOf(profileId);
  return withUser(userId, async (c) => {
    await ensureUser(c, userId);
    const { rows } = await c.query(
      `INSERT INTO user_profiles (user_id, profile_id, display_name, companion_mode, faith, faith_level, theme, timezone)
       VALUES ($1, $2, $3, coalesce($4, 'counsellor'), coalesce($5, 'general'), coalesce($6, 'ask'), coalesce($7, 'system'), coalesce($8, 'Australia/Brisbane'))
       ON CONFLICT (user_id, profile_id) DO UPDATE SET
         display_name = EXCLUDED.display_name, companion_mode = EXCLUDED.companion_mode, faith = EXCLUDED.faith,
         faith_level = EXCLUDED.faith_level, theme = EXCLUDED.theme, timezone = EXCLUDED.timezone, updated_at = now()
       RETURNING *`,
      [userId, pid, fields.displayName ?? null, fields.companionMode ?? null, fields.faith ?? null, fields.faithLevel ?? null, fields.theme ?? null, fields.timezone ?? null],
    );
    return rows[0];
  }, env);
}
export async function getProfile(userId, profileId, env = process.env) {
  const pid = profileOf(profileId);
  return withUser(userId, async (c) => {
    const { rows } = await c.query('SELECT * FROM user_profiles WHERE user_id = $1 AND profile_id = $2', [userId, pid]);
    return rows[0] || null;
  }, env);
}

/* ---------- consent ---------- */
export async function setConsent(userId, consentKey, granted, policyVersion, source = 'app', env = process.env) {
  return withUser(userId, async (c) => {
    await ensureUser(c, userId);
    await c.query(
      `INSERT INTO consent_preferences (user_id, consent_key, granted, policy_version) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, consent_key) DO UPDATE SET granted = EXCLUDED.granted, policy_version = EXCLUDED.policy_version, updated_at = now()`,
      [userId, consentKey, Boolean(granted), policyVersion],
    );
    await c.query('INSERT INTO consent_events (user_id, consent_key, granted, policy_version, source) VALUES ($1, $2, $3, $4, $5)',
      [userId, consentKey, Boolean(granted), policyVersion, source]);
  }, env);
}
export async function listConsents(userId, env = process.env) {
  return withUser(userId, async (c) => (await c.query('SELECT consent_key, granted, policy_version, updated_at FROM consent_preferences WHERE user_id = $1 ORDER BY consent_key', [userId])).rows, env);
}

/* ---------- mood / check-ins ---------- */
export async function upsertMood(userId, entry, env = process.env) {
  const pid = profileOf(entry.profileId);
  return withUser(userId, async (c) => {
    await ensureUser(c, userId);
    const note = entry.note == null ? null : encryptText(limit(entry.note, 20000, 'note'), env, aad(userId, 'mood_entries.note'));
    const { rows } = await c.query(
      `INSERT INTO mood_entries (user_id, profile_id, entry_date, mood_score, mood_label, craving_level, gratitude, note)
       VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, '{}'::text[]), $8)
       ON CONFLICT (user_id, profile_id, entry_date) DO UPDATE SET
         mood_score = EXCLUDED.mood_score, mood_label = EXCLUDED.mood_label, craving_level = EXCLUDED.craving_level,
         gratitude = EXCLUDED.gratitude, note = EXCLUDED.note, updated_at = now()
       RETURNING id`,
      [userId, pid, entry.date, entry.moodScore ?? null, entry.moodLabel ?? null, entry.craving ?? null, entry.gratitude ?? null, note],
    );
    return rows[0].id;
  }, env);
}
export async function listMoods(userId, { profileId, sinceDate } = {}, env = process.env) {
  const pid = profileOf(profileId);
  return withUser(userId, async (c) => {
    const { rows } = await c.query(
      `SELECT entry_date, mood_score, mood_label, craving_level, gratitude, note FROM mood_entries
       WHERE user_id = $1 AND profile_id = $2 AND ($3::date IS NULL OR entry_date >= $3::date) ORDER BY entry_date DESC LIMIT 400`,
      [userId, pid, sinceDate ?? null],
    );
    return rows.map((r) => ({ ...r, note: r.note == null ? null : decryptText(r.note, env, aad(userId, 'mood_entries.note')) }));
  }, env);
}

/* ---------- journal ---------- */
export async function createJournalEntry(userId, entry, env = process.env) {
  const pid = profileOf(entry.profileId);
  const enc = encryptionEnabled(env);
  const seal = (v, f) => (v == null ? null : encryptText(v, env, aad(userId, `journal_entries.${f}`)));
  return withUser(userId, async (c) => {
    await ensureUser(c, userId);
    const { rows } = await c.query(
      `INSERT INTO journal_entries (user_id, profile_id, client_id, title, body, refined, emotions, encryption)
       VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, '{}'::text[]), $8)
       ON CONFLICT (user_id, profile_id, client_id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
         refined = EXCLUDED.refined, emotions = EXCLUDED.emotions, encryption = EXCLUDED.encryption, updated_at = now()
       RETURNING id`,
      [userId, pid, entry.clientId ?? null, seal(limit(entry.title, 1000, 'title'), 'title'), seal(limit(entry.body, 200000, 'body', { required: true }), 'body'), seal(limit(entry.refined, 200000, 'refined'), 'refined'), entry.emotions ?? null, enc ? ENC_SCHEME : 'none'],
    );
    return rows[0].id;
  }, env);
}
export async function listJournalEntries(userId, { profileId } = {}, env = process.env) {
  const pid = profileOf(profileId);
  const open = (v, f) => (v == null ? null : decryptText(v, env, aad(userId, `journal_entries.${f}`)));
  return withUser(userId, async (c) => {
    const { rows } = await c.query(
      'SELECT id, client_id, title, body, refined, emotions, created_at, updated_at FROM journal_entries WHERE user_id = $1 AND profile_id = $2 ORDER BY created_at DESC',
      [userId, pid],
    );
    return rows.map((r) => ({ ...r, title: open(r.title, 'title'), body: open(r.body, 'body'), refined: open(r.refined, 'refined') }));
  }, env);
}
export async function deleteJournalEntry(userId, id, env = process.env) {
  return withUser(userId, async (c) => (await c.query('DELETE FROM journal_entries WHERE user_id = $1 AND id = $2', [userId, id])).rowCount, env);
}

/* ---------- safety plan ---------- */
const PLAN_FIELDS = ['warning_signs', 'coping_strategies', 'distraction_people', 'support_contacts', 'professional_contacts', 'safe_environment', 'reasons_for_living', 'relapse_plan'];
export async function saveSafetyPlan(userId, profileId, plan, env = process.env) {
  const pid = profileOf(profileId);
  const values = PLAN_FIELDS.map((f) => (plan[f] == null || plan[f] === '' ? null : encryptText(limit(plan[f], f === 'relapse_plan' ? 100000 : 20000, f), env, aad(userId, `safety_plans.${f}`))));
  return withUser(userId, async (c) => {
    await ensureUser(c, userId);
    const cols = PLAN_FIELDS.join(', ');
    const params = PLAN_FIELDS.map((_, i) => `$${i + 3}`).join(', ');
    const updates = PLAN_FIELDS.map((f) => `${f} = EXCLUDED.${f}`).join(', ');
    const { rows } = await c.query(
      `INSERT INTO safety_plans (user_id, profile_id, ${cols}, encryption) VALUES ($1, $2, ${params}, $${PLAN_FIELDS.length + 3})
       ON CONFLICT (user_id, profile_id) DO UPDATE SET ${updates}, encryption = EXCLUDED.encryption,
         version = safety_plans.version + 1, updated_at = now()
       RETURNING version`,
      [userId, pid, ...values, encryptionEnabled(env) ? ENC_SCHEME : 'none'],
    );
    return rows[0].version;
  }, env);
}
export async function getSafetyPlan(userId, profileId, env = process.env) {
  const pid = profileOf(profileId);
  return withUser(userId, async (c) => {
    const { rows } = await c.query('SELECT * FROM safety_plans WHERE user_id = $1 AND profile_id = $2', [userId, pid]);
    if (!rows[0]) return null;
    const out = { version: rows[0].version, updatedAt: rows[0].updated_at };
    for (const f of PLAN_FIELDS) out[f] = rows[0][f] == null ? null : decryptText(rows[0][f], env, aad(userId, `safety_plans.${f}`));
    return out;
  }, env);
}

/* ---------- account deletion ---------- */
/** Removes every row for this user (FK cascade from app_users). */
export async function deleteAllUserData(userId, env = process.env) {
  assertUserId(userId);
  return withUser(userId, async (c) => (await c.query('DELETE FROM app_users WHERE id = $1', [userId])).rowCount, env);
}
