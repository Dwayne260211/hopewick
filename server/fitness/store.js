/**
 * Move & Recover storage. One interface, two backends, same shapes
 * (contract-tested in server/fitness.test.mjs):
 *
 *   DATABASE_URL set   -> Postgres (migrations/006_fitness_protocols.sql), withUser() + RLS.
 *   DATABASE_URL unset -> fitness.json beside users.json (or FITNESS_STORE), via
 *                         server/json-file.js: atomic writes, fail-loud on a corrupt file.
 *
 * What is stored, per account and profile:
 *   - the safety screen RESULT (outcome per area, dates, doctor's-OK tick). Never the answers.
 *   - the pause time after a reported substance use (lockUntil).
 *   - preferences (level, adapted track).
 *   - session log (kind, plan key, status, times, duration) + detail (moods before/after, stopped early).
 * screen, lockUntil, prefs and detail are AES-256-GCM encrypted with HOPEWICK_DATA_KEY
 * (server/db/crypto.js), bound to "<userId>:fitness.<field>" in both backends.
 */
import { createJsonFile } from '../json-file.js';
import { encryptText, decryptText, encryptionEnabled, ENC_SCHEME } from '../db/crypto.js';
import { withUser, dbEnabled } from '../db/index.js';
import { NotFoundError, ValidationError, newId, isUuid } from '../wellbeing/validate.js';

const MAX_PROFILES = 12;
const MAX_SESSIONS = 2000;
const iso = (d) => (d == null ? null : new Date(d).toISOString());

function sealer(env) {
  const seal = (u, f, v) => (v == null ? null : encryptText(JSON.stringify(v), env, `${u}:fitness.${f}`));
  // Fail loud on a missing key or a tampered value (same as the wellbeing stores).
  const open = (u, f, v) => {
    if (v == null || v === '') return null;
    const text = decryptText(v, env, `${u}:fitness.${f}`);
    try { return JSON.parse(text); } catch { return null; }
  };
  return { seal, open };
}

export function applySessionPatch(prev, patch, now = new Date().toISOString()) {
  const next = { ...prev, detail: { ...(prev.detail || {}) } };
  if (patch.status && patch.status !== prev.status) {
    if (prev.status !== 'started') throw new ValidationError('That session is already finished.', 'status');
    next.status = patch.status;
    next.completedAt = now;
  }
  if (patch.durationSeconds != null) next.durationSeconds = patch.durationSeconds;
  if (patch.detail) Object.assign(next.detail, patch.detail);
  next.updatedAt = now;
  return next;
}

/* ------------------------------ JSON ------------------------------ */
export function createJsonFitnessStore(filePath, { env = process.env } = {}) {
  const file = createJsonFile(filePath, {
    label: 'fitness.json',
    isValid: (p) => Boolean(p) && typeof p === 'object' && Boolean(p.users) && typeof p.users === 'object' && !Array.isArray(p.users),
    empty: () => ({ version: 1, users: {} }),
    serialize: (value) => JSON.stringify(value),
  });
  const data = file.initial;
  const { seal, open } = sealer(env);
  const prof = (u, p, create) => {
    if (!data.users[u]) { if (!create) return null; data.users[u] = { profiles: {} }; }
    const profiles = data.users[u].profiles;
    if (!profiles[p]) {
      if (!create) return null;
      if (Object.keys(profiles).length >= MAX_PROFILES) throw new ValidationError('This account already has the most profiles Hopewick keeps.', 'profileId');
      profiles[p] = { screen: null, lockUntil: null, prefs: null, sessions: [] };
    }
    return profiles[p];
  };
  const write = (fn) => { file.assertWritable(); const out = fn(); file.write(data); return out; };
  const outSession = (u, r) => ({ ...r, detail: open(u, 'detail', r.detail) || {} });

  return {
    backend: 'json',
    health: () => file.health(),
    async getProfile(u, p) {
      const r = prof(u, p, false);
      return { screen: r ? open(u, 'screen', r.screen) : null, lockUntil: r ? open(u, 'lock', r.lockUntil) : null, prefs: (r && open(u, 'prefs', r.prefs)) || { level: 'beginner', track: 'standard' } };
    },
    async saveScreen(u, p, screen) { return write(() => { prof(u, p, true).screen = seal(u, 'screen', screen); return screen; }); },
    async setLock(u, p, until) { return write(() => { prof(u, p, true).lockUntil = until ? seal(u, 'lock', until) : null; return until; }); },
    async savePrefs(u, p, prefs) { return write(() => { prof(u, p, true).prefs = seal(u, 'prefs', prefs); return prefs; }); },
    async createSession(u, p, s) {
      const now = new Date().toISOString();
      const row = { id: newId(), kind: s.kind, planKey: s.planKey, status: 'started', startedAt: now, updatedAt: now, completedAt: null, durationSeconds: 0, detail: s.detail || {} };
      return write(() => {
        const r = prof(u, p, true);
        r.sessions.unshift({ ...row, detail: seal(u, 'detail', row.detail) });
        if (r.sessions.length > MAX_SESSIONS) r.sessions.length = MAX_SESSIONS;
        return row;
      });
    },
    async updateSession(u, p, id, patch) {
      const r = prof(u, p, false);
      if (!r) throw new NotFoundError();
      const i = r.sessions.findIndex((x) => x.id === id);
      if (i < 0) throw new NotFoundError();
      const next = applySessionPatch(outSession(u, r.sessions[i]), patch);
      return write(() => { r.sessions[i] = { ...next, detail: seal(u, 'detail', next.detail) }; return next; });
    },
    async listSessions(u, p, { since } = {}) {
      const r = prof(u, p, false);
      if (!r) return [];
      return r.sessions.filter((x) => !since || x.startedAt >= since).map((x) => outSession(u, x));
    },
    async clear(u, p) {
      const r = prof(u, p, false);
      if (!r) return 0;
      const n = r.sessions.length + (r.screen ? 1 : 0) + (r.prefs ? 1 : 0) + (r.lockUntil ? 1 : 0);
      return write(() => { delete data.users[u].profiles[p]; return n; });
    },
    async forget(u) {
      if (!data.users[u]) return false;
      return write(() => { delete data.users[u]; return true; });
    },
  };
}

/* ---------------------------- Postgres ---------------------------- */
export function createPgFitnessStore({ env = process.env } = {}) {
  const { seal, open } = sealer(env);
  const enc = () => (encryptionEnabled(env) ? ENC_SCHEME : 'none');
  const run = (u, fn) => withUser(u, fn, env);
  const ensure = async (c, u, p) => {
    await c.query('INSERT INTO app_users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [u]);
    await c.query('INSERT INTO fitness_profiles (user_id, profile_id) VALUES ($1, $2) ON CONFLICT (user_id, profile_id) DO NOTHING', [u, p]);
  };
  const setCol = (col, field) => async (u, p, value) => run(u, async (c) => {
    await ensure(c, u, p);
    await c.query(`UPDATE fitness_profiles SET ${col} = $3, encryption = $4, updated_at = now() WHERE user_id = $1 AND profile_id = $2`, [u, p, value == null ? null : seal(u, field, value), enc()]);
    return value;
  });
  const outSession = (u, r) => ({
    id: r.id, kind: r.kind, planKey: r.plan_key, status: r.status, startedAt: iso(r.started_at), updatedAt: iso(r.updated_at),
    completedAt: iso(r.completed_at), durationSeconds: r.duration_seconds, detail: open(u, 'detail', r.detail) || {},
  });
  const needUuid = (id) => { if (!isUuid(id)) throw new NotFoundError(); return id; };

  return {
    backend: 'postgres',
    health: () => ({ ok: true, label: 'postgres' }),
    async getProfile(u, p) {
      return run(u, async (c) => {
        const { rows } = await c.query('SELECT screen, lock_until, prefs FROM fitness_profiles WHERE user_id = $1 AND profile_id = $2', [u, p]);
        const r = rows[0];
        return { screen: r ? open(u, 'screen', r.screen) : null, lockUntil: r ? open(u, 'lock', r.lock_until) : null, prefs: (r && open(u, 'prefs', r.prefs)) || { level: 'beginner', track: 'standard' } };
      });
    },
    saveScreen: setCol('screen', 'screen'),
    setLock: setCol('lock_until', 'lock'),
    savePrefs: setCol('prefs', 'prefs'),
    async createSession(u, p, s) {
      return run(u, async (c) => {
        await ensure(c, u, p);
        const { rows } = await c.query(
          `INSERT INTO fitness_sessions (user_id, profile_id, kind, plan_key, status, detail, encryption)
           VALUES ($1, $2, $3, $4, 'started', $5, $6) RETURNING *`, [u, p, s.kind, s.planKey, seal(u, 'detail', s.detail || {}), enc()]);
        return outSession(u, rows[0]);
      });
    },
    async updateSession(u, p, id, patch) {
      needUuid(id);
      return run(u, async (c) => {
        const { rows } = await c.query('SELECT * FROM fitness_sessions WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [u, p, id]);
        if (!rows[0]) throw new NotFoundError();
        const next = applySessionPatch(outSession(u, rows[0]), patch);
        const upd = await c.query(
          `UPDATE fitness_sessions SET status = $4, completed_at = $5, duration_seconds = $6, detail = $7, encryption = $8, updated_at = now()
           WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [u, p, id, next.status, next.completedAt, next.durationSeconds, seal(u, 'detail', next.detail), enc()]);
        return outSession(u, upd.rows[0]);
      });
    },
    async listSessions(u, p, { since } = {}) {
      return run(u, async (c) => (await c.query(
        `SELECT * FROM fitness_sessions WHERE user_id = $1 AND profile_id = $2 AND ($3::timestamptz IS NULL OR started_at >= $3)
         ORDER BY started_at DESC LIMIT ${MAX_SESSIONS}`, [u, p, since || null])).rows.map((r) => outSession(u, r)));
    },
    async clear(u, p) {
      return run(u, async (c) => {
        const a = await c.query('DELETE FROM fitness_sessions WHERE user_id = $1 AND profile_id = $2', [u, p]);
        const b = await c.query('DELETE FROM fitness_profiles WHERE user_id = $1 AND profile_id = $2', [u, p]);
        return a.rowCount + b.rowCount;
      });
    },
    async forget(u) {
      return run(u, async (c) => {
        const a = await c.query('DELETE FROM fitness_sessions WHERE user_id = $1', [u]);
        const b = await c.query('DELETE FROM fitness_profiles WHERE user_id = $1', [u]);
        return a.rowCount + b.rowCount > 0;
      });
    },
  };
}

export function createFitnessStore({ filePath, env = process.env, backend } = {}) {
  const which = backend || (dbEnabled(env) ? 'postgres' : 'json');
  if (which === 'postgres') return createPgFitnessStore({ env });
  if (!filePath) throw new Error('createFitnessStore needs filePath for the JSON backend.');
  return createJsonFitnessStore(filePath, { env });
}
