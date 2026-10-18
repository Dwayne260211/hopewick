/**
 * Wellbeing data in Postgres (used when DATABASE_URL is set).
 * Same interface and output shapes as json-store.js.
 *
 * Every call runs in withUser(userId): row level security limits the
 * transaction to that account, and every query also filters by user_id.
 * Sensitive text is encrypted with HOPEWICK_DATA_KEY when it is set,
 * bound to "<userId>:<table>.<column>".
 */
import { withUser, probeDatabase } from '../db/index.js';
import { encryptText, decryptText, encryptionEnabled, ENC_SCHEME } from '../db/crypto.js';
import { NotFoundError, ValidationError, LIMITS, defaultSettings, SETTINGS, POLICY_VERSION, isUuid, SAFETY_VERSIONS_KEPT } from './validate.js';
import { readPreferences } from './personal.js';
import { RECOVERY_LIMITS, mergeLearning } from './recovery.js';
import { applyActivityPatch, applyGoalPatch, applyStepPatch, applyWeeklyPlanPatch, helpfulToScore, scoreToHelpful } from './model.js';

const iso = (d) => (d == null ? null : new Date(d).toISOString());
const day = (d) => {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  // pg returns DATE as a local-midnight Date; format in local parts so it does not shift.
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export function createPgWellbeingStore({ env = process.env } = {}) {
  const enc = () => (encryptionEnabled(env) ? ENC_SCHEME : 'none');
  const seal = (u, f, v) => (v == null || v === '' ? null : encryptText(String(v), env, `${u}:${f}`));
  const open = (u, f, v) => (v == null ? '' : decryptText(v, env, `${u}:${f}`));
  const run = (userId, fn) => withUser(userId, fn, env);
  const ensureUser = (c, userId) => c.query('INSERT INTO app_users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
  const needUuid = (id) => { if (!isUuid(id)) throw new NotFoundError(); return id; };

  const outCheckin = (u, r) => {
    let triggers = [];
    try { const t = JSON.parse(open(u, 'mood_entries.triggers', r.triggers) || '[]'); if (Array.isArray(t)) triggers = t; } catch { /* keep [] */ }
    return {
      id: r.id, date: day(r.entry_date), mood: r.mood_score, moodLabel: r.mood_label,
      feelings: open(u, 'mood_entries.feelings', r.feelings), triggers, intensity: r.intensity, craving: r.craving_level,
      notes: open(u, 'mood_entries.note', r.note), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    };
  };
  const outActivity = (u, r) => ({
    id: r.id, toolKey: r.activity_key, toolType: r.activity_type, status: r.status, stepIndex: r.step_index,
    startedAt: iso(r.started_at), updatedAt: iso(r.updated_at), completedAt: iso(r.completed_at),
    durationSeconds: r.duration_seconds, helpful: scoreToHelpful(r.helpfulness), note: open(u, 'guided_activity_history.note', r.note),
  });
  const outGoal = (u, r) => ({
    id: r.id, title: open(u, 'personal_goals.title', r.title), detail: open(u, 'personal_goals.detail', r.detail), category: r.category,
    status: r.status, progress: r.progress, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), completedAt: iso(r.completed_at),
  });
  const outJournal = (u, r) => ({
    id: r.id, clientId: r.client_id, kind: r.kind, prompt: r.prompt || '', packId: r.pack_id || null, entryDate: day(r.entry_date),
    title: open(u, 'journal_entries.title', r.title), body: open(u, 'journal_entries.body', r.body),
    refined: open(u, 'journal_entries.refined', r.refined), emotions: open(u, 'journal_entries.emotions_text', r.emotions_text),
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  });
  const outRGoal = (u, r) => ({
    id: r.id, kind: r.kind, label: open(u, 'recovery_goals.label', r.label), target: open(u, 'recovery_goals.target', r.target),
    why: open(u, 'recovery_goals.why', r.why), startDate: day(r.start_date), status: r.status, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  });
  const outRLog = (u, r) => {
    let triggers = [];
    try { const t = JSON.parse(open(u, 'recovery_logs.triggers', r.triggers) || '[]'); if (Array.isArray(t)) triggers = t; } catch { /* keep [] */ }
    return {
      id: r.id, goalId: r.goal_id || null, kind: r.kind, date: day(r.log_date), intensity: r.intensity ?? null, triggers, outcome: r.outcome || null,
      helped: open(u, 'recovery_logs.helped', r.helped), note: open(u, 'recovery_logs.note', r.note), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    };
  };
  const outLearn = (u, r) => {
    let notes = {};
    if (r.notes) { try { notes = JSON.parse(open(u, 'module_progress.notes', r.notes) || '{}') || {}; } catch { notes = {}; } }
    return {
      moduleId: r.module_id, step: r.step, completedAt: iso(r.completed_at), quiz: r.quiz_total ? { correct: r.quiz_correct, total: r.quiz_total } : null,
      notes, startedAt: iso(r.started_at), updatedAt: iso(r.updated_at),
    };
  };
  const outWeekly = (u, r) => {
    let steps = [];
    try { const v = JSON.parse(open(u, 'weekly_step_plans.steps', r.steps) || '[]'); if (Array.isArray(v)) steps = v; } catch { /* keep [] */ }
    return {
      id: r.id, weekStart: day(r.week_start), title: open(u, 'weekly_step_plans.title', r.title), steps, status: r.status,
      createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), completedAt: iso(r.completed_at),
    };
  };
  const outStep = (u, r) => ({
    id: r.id, title: open(u, 'next_step_items.title', r.title), detail: open(u, 'next_step_items.detail', r.detail),
    copingKey: r.coping_key, source: r.source, status: r.status, reflection: open(u, 'next_step_items.reflection', r.reflection),
    followUpOptIn: r.followup_opt_in, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), completedAt: iso(r.completed_at),
  });

  return {
    backend: 'postgres',
    health: () => ({ ok: true, label: 'postgres' }),
    probe: () => probeDatabase(env),

    async getSettings(userId) {
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT consent_key, granted FROM consent_preferences WHERE user_id = $1', [userId]);
        const out = defaultSettings();
        for (const [k, spec] of Object.entries(SETTINGS)) {
          const row = rows.find((r) => r.consent_key === spec.consentKey);
          if (!row) continue;
          out[k] = spec.kind === 'bool' ? row.granted : (row.granted ? 'done' : 'declined');
        }
        return out;
      });
    },
    async updateSettings(userId, patch, { source = 'app' } = {}) {
      await run(userId, async (c) => {
        await ensureUser(c, userId);
        for (const [k, v] of Object.entries(patch)) {
          const spec = SETTINGS[k];
          if (spec.kind === 'import' && v === 'pending') {
            await c.query('DELETE FROM consent_preferences WHERE user_id = $1 AND consent_key = $2', [userId, spec.consentKey]);
            continue;
          }
          const granted = spec.kind === 'bool' ? v : v === 'done';
          const prev = await c.query('SELECT granted FROM consent_preferences WHERE user_id = $1 AND consent_key = $2', [userId, spec.consentKey]);
          if (prev.rows[0] && prev.rows[0].granted === granted) continue;
          await c.query(
            `INSERT INTO consent_preferences (user_id, consent_key, granted, policy_version) VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, consent_key) DO UPDATE SET granted = EXCLUDED.granted, policy_version = EXCLUDED.policy_version, updated_at = now()`,
            [userId, spec.consentKey, granted, POLICY_VERSION]);
          await c.query('INSERT INTO consent_events (user_id, consent_key, granted, policy_version, source) VALUES ($1, $2, $3, $4, $5)',
            [userId, spec.consentKey, granted, POLICY_VERSION, source === 'import' ? 'import' : 'app']);
        }
      });
      return this.getSettings(userId);
    },
    async consentHistory(userId) {
      return run(userId, async (c) => (await c.query(
        'SELECT consent_key AS key, granted AS value, policy_version AS "policyVersion", source, created_at AS at FROM consent_events WHERE user_id = $1 ORDER BY id', [userId])).rows);
    },

    async listCheckins(userId, profileId, { from, to } = {}) {
      return run(userId, async (c) => {
        const { rows } = await c.query(
          `SELECT * FROM mood_entries WHERE user_id = $1 AND profile_id = $2 AND mood_scale = 'v2'
             AND ($3::date IS NULL OR entry_date >= $3::date) AND ($4::date IS NULL OR entry_date <= $4::date)
           ORDER BY entry_date DESC LIMIT ${LIMITS.checkinDays}`, [userId, profileId, from || null, to || null]);
        return rows.map((r) => outCheckin(userId, r));
      });
    },
    async putCheckin(userId, profileId, e) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const { rows } = await c.query(
          `INSERT INTO mood_entries (user_id, profile_id, entry_date, mood_score, mood_label, craving_level, feelings, triggers, intensity, note, mood_scale, encryption)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'v2', $11)
           ON CONFLICT (user_id, profile_id, entry_date) DO UPDATE SET mood_score = EXCLUDED.mood_score, mood_label = EXCLUDED.mood_label,
             craving_level = EXCLUDED.craving_level, feelings = EXCLUDED.feelings, triggers = EXCLUDED.triggers, intensity = EXCLUDED.intensity,
             note = EXCLUDED.note, mood_scale = 'v2', encryption = EXCLUDED.encryption, updated_at = now()
           RETURNING *`,
          [userId, profileId, e.date, e.mood, e.moodLabel, e.craving, seal(userId, 'mood_entries.feelings', e.feelings),
            seal(userId, 'mood_entries.triggers', JSON.stringify(e.triggers || [])), e.intensity, seal(userId, 'mood_entries.note', e.notes), enc()]);
        return outCheckin(userId, rows[0]);
      });
    },
    async deleteCheckin(userId, profileId, date) {
      const n = await run(userId, async (c) => (await c.query(
        "DELETE FROM mood_entries WHERE user_id = $1 AND profile_id = $2 AND entry_date = $3 AND mood_scale = 'v2'", [userId, profileId, date])).rowCount);
      if (!n) throw new NotFoundError('There is no check-in on that day.');
      return true;
    },

    async listActivities(userId, profileId, { limit = 200 } = {}) {
      return run(userId, async (c) => (await c.query(
        'SELECT * FROM guided_activity_history WHERE user_id = $1 AND profile_id = $2 ORDER BY updated_at DESC LIMIT $3',
        [userId, profileId, Math.min(Number(limit) || 200, LIMITS.activities)])).rows.map((r) => outActivity(userId, r)));
    },
    async startActivity(userId, profileId, s) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const { rows } = await c.query(
          `INSERT INTO guided_activity_history (user_id, profile_id, activity_type, activity_key, status, step_index, completed_at, encryption)
           VALUES ($1, $2, $3, $4, 'started', $5, NULL, $6) RETURNING *`, [userId, profileId, s.toolType, s.toolKey, s.stepIndex || 0, enc()]);
        return outActivity(userId, rows[0]);
      });
    },
    async updateActivity(userId, profileId, id, patch) {
      needUuid(id);
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM guided_activity_history WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [userId, profileId, id]);
        if (!rows[0]) throw new NotFoundError();
        const next = applyActivityPatch(outActivity(userId, rows[0]), patch);
        const out = await c.query(
          `UPDATE guided_activity_history SET status = $4, step_index = $5, duration_seconds = $6, helpfulness = $7, note = $8,
             completed_at = $9, updated_at = now(), encryption = $10 WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [userId, profileId, id, next.status, next.stepIndex, next.durationSeconds, helpfulToScore(next.helpful), seal(userId, 'guided_activity_history.note', next.note), next.completedAt, enc()]);
        return outActivity(userId, out.rows[0]);
      });
    },
    async deleteActivity(userId, profileId, id) {
      needUuid(id);
      const n = await run(userId, async (c) => (await c.query('DELETE FROM guided_activity_history WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, id])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },

    async listGoals(userId, profileId) {
      return run(userId, async (c) => (await c.query('SELECT * FROM personal_goals WHERE user_id = $1 AND profile_id = $2 ORDER BY updated_at DESC', [userId, profileId])).rows.map((r) => outGoal(userId, r)));
    },
    async createGoal(userId, profileId, g) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const count = Number((await c.query('SELECT count(*) AS n FROM personal_goals WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rows[0].n);
        if (count >= LIMITS.goals) throw new ValidationError(`You can keep up to ${LIMITS.goals} goals. Delete an old one first.`, 'goals');
        const shaped = applyGoalPatch({ status: 'active', progress: g.progress || 0, completedAt: null }, { status: g.status });
        const { rows } = await c.query(
          `INSERT INTO personal_goals (user_id, profile_id, title, detail, category, status, progress, completed_at, encryption)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [userId, profileId, seal(userId, 'personal_goals.title', g.title), seal(userId, 'personal_goals.detail', g.detail), g.category, shaped.status, shaped.progress, shaped.completedAt, enc()]);
        return outGoal(userId, rows[0]);
      });
    },
    async updateGoal(userId, profileId, id, patch) {
      needUuid(id);
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM personal_goals WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [userId, profileId, id]);
        if (!rows[0]) throw new NotFoundError();
        const n = applyGoalPatch(outGoal(userId, rows[0]), patch);
        const out = await c.query(
          `UPDATE personal_goals SET title = $4, detail = $5, category = $6, status = $7, progress = $8, completed_at = $9, encryption = $10, updated_at = now()
           WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [userId, profileId, id, seal(userId, 'personal_goals.title', n.title), seal(userId, 'personal_goals.detail', n.detail), n.category, n.status, n.progress, n.completedAt, enc()]);
        return outGoal(userId, out.rows[0]);
      });
    },
    async deleteGoal(userId, profileId, id) {
      needUuid(id);
      const n = await run(userId, async (c) => (await c.query('DELETE FROM personal_goals WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, id])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },

    async listJournal(userId, profileId) {
      return run(userId, async (c) => (await c.query(
        `SELECT * FROM journal_entries WHERE user_id = $1 AND profile_id = $2 ORDER BY created_at DESC LIMIT ${LIMITS.journalEntries}`, [userId, profileId])).rows.map((r) => outJournal(userId, r)));
    },
    async createJournal(userId, profileId, e) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        if (e.clientId) {
          const dup = await c.query('SELECT * FROM journal_entries WHERE user_id = $1 AND profile_id = $2 AND client_id = $3', [userId, profileId, e.clientId]);
          if (dup.rows[0]) return outJournal(userId, dup.rows[0]);
        }
        const count = Number((await c.query('SELECT count(*) AS n FROM journal_entries WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rows[0].n);
        if (count >= LIMITS.journalEntries) throw new ValidationError(`The journal keeps up to ${LIMITS.journalEntries} entries. Export and delete older ones first.`, 'journal');
        const { rows } = await c.query(
          `INSERT INTO journal_entries (user_id, profile_id, client_id, title, body, refined, emotions_text, kind, prompt, entry_date, encryption, created_at, updated_at, pack_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12::timestamptz, now()), coalesce($13::timestamptz, now()), $14) RETURNING *`,
          [userId, profileId, e.clientId || null, seal(userId, 'journal_entries.title', e.title), seal(userId, 'journal_entries.body', e.body),
            seal(userId, 'journal_entries.refined', e.refined), seal(userId, 'journal_entries.emotions_text', e.emotions), e.kind, e.prompt || null, e.entryDate, enc(),
            e.createdAt || null, e.updatedAt || null, e.packId || null]);
        return outJournal(userId, rows[0]);
      });
    },
    async updateJournal(userId, profileId, id, patch) {
      needUuid(id);
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM journal_entries WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [userId, profileId, id]);
        if (!rows[0]) throw new NotFoundError();
        const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && !(k === 'entryDate' && v == null)));
        const n = { ...outJournal(userId, rows[0]), ...clean };
        const out = await c.query(
          `UPDATE journal_entries SET title = $4, body = $5, refined = $6, emotions_text = $7, kind = $8, prompt = $9, entry_date = $10, encryption = $11, pack_id = $12, updated_at = now()
           WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [userId, profileId, id, seal(userId, 'journal_entries.title', n.title), seal(userId, 'journal_entries.body', n.body), seal(userId, 'journal_entries.refined', n.refined),
            seal(userId, 'journal_entries.emotions_text', n.emotions), n.kind, n.prompt || null, n.entryDate, enc(), n.packId || null]);
        return outJournal(userId, out.rows[0]);
      });
    },
    async deleteJournal(userId, profileId, id) {
      needUuid(id);
      const n = await run(userId, async (c) => (await c.query('DELETE FROM journal_entries WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, id])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },
    async importJournal(userId, profileId, items) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        let count = Number((await c.query('SELECT count(*) AS n FROM journal_entries WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rows[0].n);
        let imported = 0; let skipped = 0;
        for (const e of items) {
          if (count >= LIMITS.journalEntries) { skipped += 1; continue; }
          const r = await c.query(
            `INSERT INTO journal_entries (user_id, profile_id, client_id, title, body, refined, emotions_text, kind, prompt, entry_date, encryption, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (user_id, profile_id, client_id) DO NOTHING`,
            [userId, profileId, e.clientId, seal(userId, 'journal_entries.title', e.title), seal(userId, 'journal_entries.body', e.body),
              seal(userId, 'journal_entries.refined', e.refined), seal(userId, 'journal_entries.emotions_text', e.emotions), e.kind, e.prompt || null, e.entryDate, enc(), e.createdAt, e.updatedAt]);
          if (r.rowCount) { imported += 1; count += 1; } else skipped += 1;
        }
        return { imported, skipped };
      });
    },

    async getPlans(userId, profileId) {
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT relapse_plan, version, updated_at FROM safety_plans WHERE user_id = $1 AND profile_id = $2', [userId, profileId]);
        if (!rows[0] || rows[0].relapse_plan == null) return null;
        return { ...JSON.parse(open(userId, 'safety_plans.relapse_plan', rows[0].relapse_plan)), updatedAt: iso(rows[0].updated_at), version: rows[0].version };
      });
    },
    async putPlans(userId, profileId, plans) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const { rows } = await c.query(
          `INSERT INTO safety_plans (user_id, profile_id, relapse_plan, encryption) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, profile_id) DO UPDATE SET relapse_plan = EXCLUDED.relapse_plan, encryption = EXCLUDED.encryption,
             version = safety_plans.version + 1, updated_at = now() RETURNING version, updated_at`,
          [userId, profileId, seal(userId, 'safety_plans.relapse_plan', JSON.stringify(plans)), enc()]);
        return { ...plans, updatedAt: iso(rows[0].updated_at), version: rows[0].version };
      });
    },

    async listSteps(userId, profileId) {
      return run(userId, async (c) => (await c.query(
        `SELECT * FROM next_step_items WHERE user_id = $1 AND profile_id = $2 ORDER BY created_at DESC LIMIT ${LIMITS.nextSteps}`, [userId, profileId])).rows.map((r) => outStep(userId, r)));
    },
    async createStep(userId, profileId, s) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const { rows } = await c.query(
          `INSERT INTO next_step_items (user_id, profile_id, title, detail, source, status, coping_key, followup_opt_in, encryption)
           VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8) RETURNING *`,
          [userId, profileId, seal(userId, 'next_step_items.title', s.title), seal(userId, 'next_step_items.detail', s.detail), s.source, s.copingKey, !!s.followUpOptIn, enc()]);
        return outStep(userId, rows[0]);
      });
    },
    async updateStep(userId, profileId, id, patch) {
      needUuid(id);
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM next_step_items WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [userId, profileId, id]);
        if (!rows[0]) throw new NotFoundError();
        const n = applyStepPatch(outStep(userId, rows[0]), patch);
        const out = await c.query(
          `UPDATE next_step_items SET title = $4, detail = $5, coping_key = $6, status = $7, reflection = $8, followup_opt_in = $9, completed_at = $10,
             encryption = $11, updated_at = now() WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [userId, profileId, id, seal(userId, 'next_step_items.title', n.title), seal(userId, 'next_step_items.detail', n.detail), n.copingKey, n.status,
            seal(userId, 'next_step_items.reflection', n.reflection), !!n.followUpOptIn, n.completedAt, enc()]);
        return outStep(userId, out.rows[0]);
      });
    },
    async deleteStep(userId, profileId, id) {
      needUuid(id);
      const n = await run(userId, async (c) => (await c.query('DELETE FROM next_step_items WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, id])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },

    async listWeeklyPlans(userId, profileId) {
      return run(userId, async (c) => (await c.query(
        `SELECT * FROM weekly_step_plans WHERE user_id = $1 AND profile_id = $2 ORDER BY week_start DESC, created_at DESC LIMIT ${LIMITS.weeklyPlans}`, [userId, profileId])).rows.map((r) => outWeekly(userId, r)));
    },
    async createWeeklyPlan(userId, profileId, plan) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const count = Number((await c.query('SELECT count(*) AS n FROM weekly_step_plans WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rows[0].n);
        if (count >= LIMITS.weeklyPlans) throw new ValidationError(`You can keep up to ${LIMITS.weeklyPlans} weekly plans. Delete an old one first.`, 'weeklyPlans');
        const row = applyWeeklyPlanPatch({ weekStart: plan.weekStart, title: plan.title, steps: [], status: 'active', completedAt: null }, { steps: plan.steps, status: plan.status });
        const { rows } = await c.query(
          `INSERT INTO weekly_step_plans (user_id, profile_id, week_start, title, steps, status, completed_at, encryption)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [userId, profileId, row.weekStart, seal(userId, 'weekly_step_plans.title', row.title), seal(userId, 'weekly_step_plans.steps', JSON.stringify(row.steps)),
            row.status, row.completedAt, enc()]);
        return outWeekly(userId, rows[0]);
      });
    },
    async updateWeeklyPlan(userId, profileId, id, patch) {
      needUuid(id);
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM weekly_step_plans WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [userId, profileId, id]);
        if (!rows[0]) throw new NotFoundError();
        const n = applyWeeklyPlanPatch(outWeekly(userId, rows[0]), patch);
        const out = await c.query(
          `UPDATE weekly_step_plans SET week_start = $4, title = $5, steps = $6, status = $7, completed_at = $8, encryption = $9, updated_at = now()
           WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [userId, profileId, id, n.weekStart, seal(userId, 'weekly_step_plans.title', n.title), seal(userId, 'weekly_step_plans.steps', JSON.stringify(n.steps)),
            n.status, n.completedAt, enc()]);
        return outWeekly(userId, out.rows[0]);
      });
    },
    async deleteWeeklyPlan(userId, profileId, id) {
      needUuid(id);
      const n = await run(userId, async (c) => (await c.query('DELETE FROM weekly_step_plans WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, id])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },

    /* ----- Stage 4: recovery tracker ----- */
    async listRecoveryGoals(userId, profileId) {
      return run(userId, async (c) => (await c.query(
        `SELECT * FROM recovery_goals WHERE user_id = $1 AND profile_id = $2 ORDER BY created_at LIMIT ${RECOVERY_LIMITS.goals}`, [userId, profileId])).rows.map((r) => outRGoal(userId, r)));
    },
    async createRecoveryGoal(userId, profileId, g) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const count = Number((await c.query('SELECT count(*) AS n FROM recovery_goals WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rows[0].n);
        if (count >= RECOVERY_LIMITS.goals) throw new ValidationError(`You can keep up to ${RECOVERY_LIMITS.goals} recovery goals.`, 'goals');
        const { rows } = await c.query(
          `INSERT INTO recovery_goals (user_id, profile_id, kind, label, target, why, start_date, status, encryption)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [userId, profileId, g.kind, seal(userId, 'recovery_goals.label', g.label), seal(userId, 'recovery_goals.target', g.target),
            seal(userId, 'recovery_goals.why', g.why), g.startDate, g.status || 'active', enc()]);
        return outRGoal(userId, rows[0]);
      });
    },
    async updateRecoveryGoal(userId, profileId, id, patch) {
      needUuid(id);
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM recovery_goals WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [userId, profileId, id]);
        if (!rows[0]) throw new NotFoundError();
        const n = { ...outRGoal(userId, rows[0]), ...patch };
        const out = await c.query(
          `UPDATE recovery_goals SET kind = $4, label = $5, target = $6, why = $7, start_date = $8, status = $9, encryption = $10, updated_at = now()
           WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [userId, profileId, id, n.kind, seal(userId, 'recovery_goals.label', n.label), seal(userId, 'recovery_goals.target', n.target),
            seal(userId, 'recovery_goals.why', n.why), n.startDate, n.status, enc()]);
        return outRGoal(userId, out.rows[0]);
      });
    },
    /** Deleting a goal also deletes its lapse and craving logs (ON DELETE CASCADE). */
    async deleteRecoveryGoal(userId, profileId, id) {
      needUuid(id);
      const n = await run(userId, async (c) => (await c.query('DELETE FROM recovery_goals WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, id])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },
    async listRecoveryLogs(userId, profileId) {
      return run(userId, async (c) => (await c.query(
        `SELECT * FROM recovery_logs WHERE user_id = $1 AND profile_id = $2 ORDER BY log_date DESC, created_at DESC LIMIT ${RECOVERY_LIMITS.logs}`, [userId, profileId])).rows.map((r) => outRLog(userId, r)));
    },
    async createRecoveryLog(userId, profileId, l) {
      if (l.goalId && !isUuid(l.goalId)) throw new NotFoundError('That recovery goal was not found.');
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        if (l.goalId) {
          const g = await c.query('SELECT 1 FROM recovery_goals WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, l.goalId]);
          if (!g.rows[0]) throw new NotFoundError('That recovery goal was not found.');
        }
        const count = Number((await c.query('SELECT count(*) AS n FROM recovery_logs WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rows[0].n);
        if (count >= RECOVERY_LIMITS.logs) throw new ValidationError('This profile has the most tracker entries Hopewick keeps. Delete some old ones first.', 'logs');
        const { rows } = await c.query(
          `INSERT INTO recovery_logs (user_id, profile_id, goal_id, kind, log_date, intensity, outcome, triggers, helped, note, encryption)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [userId, profileId, l.goalId || null, l.kind, l.date, l.intensity ?? null, l.outcome || null,
            seal(userId, 'recovery_logs.triggers', JSON.stringify(l.triggers || [])), seal(userId, 'recovery_logs.helped', l.helped),
            seal(userId, 'recovery_logs.note', l.note), enc()]);
        return outRLog(userId, rows[0]);
      });
    },
    async updateRecoveryLog(userId, profileId, id, patch) {
      needUuid(id);
      if (patch.goalId && !isUuid(patch.goalId)) throw new NotFoundError('That recovery goal was not found.');
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM recovery_logs WHERE user_id = $1 AND profile_id = $2 AND id = $3 FOR UPDATE', [userId, profileId, id]);
        if (!rows[0]) throw new NotFoundError();
        if (patch.goalId) {
          const g = await c.query('SELECT 1 FROM recovery_goals WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, patch.goalId]);
          if (!g.rows[0]) throw new NotFoundError('That recovery goal was not found.');
        }
        const n = { ...outRLog(userId, rows[0]), ...patch };
        const out = await c.query(
          `UPDATE recovery_logs SET goal_id = $4, log_date = $5, intensity = $6, outcome = $7, triggers = $8, helped = $9, note = $10, encryption = $11, updated_at = now()
           WHERE user_id = $1 AND profile_id = $2 AND id = $3 RETURNING *`,
          [userId, profileId, id, n.goalId || null, n.date, n.intensity ?? null, n.outcome || null,
            seal(userId, 'recovery_logs.triggers', JSON.stringify(n.triggers || [])), seal(userId, 'recovery_logs.helped', n.helped),
            seal(userId, 'recovery_logs.note', n.note), enc()]);
        return outRLog(userId, out.rows[0]);
      });
    },
    async deleteRecoveryLog(userId, profileId, id) {
      needUuid(id);
      const n = await run(userId, async (c) => (await c.query('DELETE FROM recovery_logs WHERE user_id = $1 AND profile_id = $2 AND id = $3', [userId, profileId, id])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },

    /* ----- Stage 4: learning progress ----- */
    async listLearning(userId, profileId) {
      return run(userId, async (c) => (await c.query(
        `SELECT * FROM module_progress WHERE user_id = $1 AND profile_id = $2 ORDER BY updated_at DESC LIMIT ${RECOVERY_LIMITS.modules}`, [userId, profileId])).rows.map((r) => outLearn(userId, r)));
    },
    async saveLearning(userId, profileId, moduleId, patch) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const { rows } = await c.query('SELECT * FROM module_progress WHERE user_id = $1 AND profile_id = $2 AND module_id = $3 FOR UPDATE', [userId, profileId, moduleId]);
        if (!rows[0]) {
          const count = Number((await c.query('SELECT count(*) AS n FROM module_progress WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rows[0].n);
          if (count >= RECOVERY_LIMITS.modules) throw new ValidationError('Too many modules tracked.', 'moduleId');
        }
        const at = new Date().toISOString();
        const n = mergeLearning(rows[0] ? outLearn(userId, rows[0]) : null, patch, at);
        const notes = Object.keys(n.notes || {}).length ? seal(userId, 'module_progress.notes', JSON.stringify(n.notes)) : null;
        const out = await c.query(
          `INSERT INTO module_progress (user_id, profile_id, module_id, step, quiz_correct, quiz_total, notes, encryption, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id, profile_id, module_id) DO UPDATE SET step = EXCLUDED.step, quiz_correct = EXCLUDED.quiz_correct,
             quiz_total = EXCLUDED.quiz_total, notes = EXCLUDED.notes, encryption = EXCLUDED.encryption, completed_at = EXCLUDED.completed_at, updated_at = now()
           RETURNING *`,
          [userId, profileId, moduleId, n.step || 0, n.quiz ? n.quiz.correct : null, n.quiz ? n.quiz.total : null, notes, enc(), n.completedAt]);
        return outLearn(userId, out.rows[0]);
      });
    },
    async deleteLearning(userId, profileId, moduleId) {
      const n = await run(userId, async (c) => (await c.query('DELETE FROM module_progress WHERE user_id = $1 AND profile_id = $2 AND module_id = $3', [userId, profileId, moduleId])).rowCount);
      if (!n) throw new NotFoundError();
      return true;
    },

    /* ----- Stage 5: personal preferences and safety plan history ----- */
    async getPreferences(userId, profileId) {
      return run(userId, async (c) => {
        const { rows } = await c.query('SELECT prefs FROM user_preferences WHERE user_id = $1 AND profile_id = $2', [userId, profileId]);
        if (!rows[0]) return readPreferences(null);
        let doc = null;
        try { doc = JSON.parse(open(userId, 'user_preferences.prefs', rows[0].prefs) || 'null'); } catch { doc = null; }
        return readPreferences(doc);
      });
    },
    async putPreferences(userId, profileId, prefs) {
      const clean = readPreferences(prefs);
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        await c.query(
          `INSERT INTO user_preferences (user_id, profile_id, prefs, encryption) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, profile_id) DO UPDATE SET prefs = EXCLUDED.prefs, encryption = EXCLUDED.encryption, updated_at = now()`,
          [userId, profileId, seal(userId, 'user_preferences.prefs', JSON.stringify(clean)), enc()]);
        return clean;
      });
    },
    async deletePreferences(userId, profileId) {
      return run(userId, async (c) => (await c.query('DELETE FROM user_preferences WHERE user_id = $1 AND profile_id = $2', [userId, profileId])).rowCount > 0);
    },
    async addSafetyVersion(userId, profileId, safety, { reason = 'save' } = {}) {
      return run(userId, async (c) => {
        await ensureUser(c, userId);
        const { rows } = await c.query(
          `INSERT INTO safety_plan_versions (user_id, profile_id, version, reason, plan, encryption)
           VALUES ($1, $2, (SELECT coalesce(max(version), 0) + 1 FROM safety_plan_versions WHERE user_id = $1 AND profile_id = $2), $3, $4, $5)
           RETURNING version, saved_at`,
          [userId, profileId, reason, seal(userId, 'safety_plan_versions.plan', JSON.stringify(safety)), enc()]);
        await c.query(
          `DELETE FROM safety_plan_versions WHERE user_id = $1 AND profile_id = $2 AND version <= $3`,
          [userId, profileId, rows[0].version - SAFETY_VERSIONS_KEPT]);
        return { version: rows[0].version, savedAt: iso(rows[0].saved_at), reason };
      });
    },
    async listSafetyVersions(userId, profileId) {
      return run(userId, async (c) => (await c.query(
        `SELECT version, reason, plan, saved_at FROM safety_plan_versions WHERE user_id = $1 AND profile_id = $2 ORDER BY version DESC LIMIT ${SAFETY_VERSIONS_KEPT}`,
        [userId, profileId])).rows.map((r) => {
        let safety = {};
        try { safety = JSON.parse(open(userId, 'safety_plan_versions.plan', r.plan) || '{}') || {}; } catch { safety = {}; }
        return { version: r.version, savedAt: iso(r.saved_at), reason: r.reason, safety };
      }));
    },

    /** The person asked to delete one kind of data (or all of it) for this profile. Never called because of plan status. */
    async clearArea(userId, profileId, area) {
      const tables = {
        checkins: "DELETE FROM mood_entries WHERE user_id = $1 AND profile_id = $2 AND mood_scale = 'v2'",
        activities: 'DELETE FROM guided_activity_history WHERE user_id = $1 AND profile_id = $2',
        goals: 'DELETE FROM personal_goals WHERE user_id = $1 AND profile_id = $2',
        journal: 'DELETE FROM journal_entries WHERE user_id = $1 AND profile_id = $2',
        plans: ['DELETE FROM safety_plans WHERE user_id = $1 AND profile_id = $2', 'DELETE FROM safety_plan_versions WHERE user_id = $1 AND profile_id = $2'],
        steps: 'DELETE FROM next_step_items WHERE user_id = $1 AND profile_id = $2',
        'weekly-plans': 'DELETE FROM weekly_step_plans WHERE user_id = $1 AND profile_id = $2',
        // recovery_logs first: the goals cascade would also remove them, but logs without a goal need their own delete.
        recovery: ['DELETE FROM recovery_logs WHERE user_id = $1 AND profile_id = $2', 'DELETE FROM recovery_goals WHERE user_id = $1 AND profile_id = $2'],
        learning: 'DELETE FROM module_progress WHERE user_id = $1 AND profile_id = $2',
        preferences: 'DELETE FROM user_preferences WHERE user_id = $1 AND profile_id = $2',
      };
      const list = (area === 'all' ? Object.values(tables) : [tables[area]]).flat();
      return run(userId, async (c) => {
        let n = 0;
        for (const sql of list) n += (await c.query(sql, [userId, profileId])).rowCount;
        return n;
      });
    },

    async profileIds(userId) {
      return run(userId, async (c) => (await c.query(
        `SELECT profile_id FROM mood_entries WHERE user_id = $1 UNION SELECT profile_id FROM guided_activity_history WHERE user_id = $1
         UNION SELECT profile_id FROM personal_goals WHERE user_id = $1 UNION SELECT profile_id FROM journal_entries WHERE user_id = $1
         UNION SELECT profile_id FROM safety_plans WHERE user_id = $1 UNION SELECT profile_id FROM next_step_items WHERE user_id = $1
         UNION SELECT profile_id FROM weekly_step_plans WHERE user_id = $1 UNION SELECT profile_id FROM recovery_goals WHERE user_id = $1
         UNION SELECT profile_id FROM recovery_logs WHERE user_id = $1 UNION SELECT profile_id FROM module_progress WHERE user_id = $1
         UNION SELECT profile_id FROM safety_plan_versions WHERE user_id = $1 UNION SELECT profile_id FROM user_preferences WHERE user_id = $1`, [userId])).rows.map((r) => r.profile_id));
    },
    async forget(userId) {
      return run(userId, async (c) => (await c.query('DELETE FROM app_users WHERE id = $1', [userId])).rowCount > 0);
    },
  };
}
