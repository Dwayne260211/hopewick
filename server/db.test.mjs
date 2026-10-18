// Postgres layer against a real database. Runs only when DATABASE_URL is set
// (environment, or the untracked local .env); skipped otherwise.
// Point it at a development branch only (Neon 'dev'), never production: it
// creates and deletes throwaway users named dbtest_*.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadLocalEnv, migrate, migrationStatus } from './db/migrate.js';

loadLocalEnv();
const enabled = Boolean(String(process.env.DATABASE_URL || '').trim());
const skip = enabled ? false : 'DATABASE_URL not set; Postgres tests skipped';

const run = crypto.randomBytes(4).toString('hex');
const A = `dbtest_${run}_a`;
const B = `dbtest_${run}_b`;
let db, repo;

test('database layer', { skip, concurrency: false }, async (t) => {
  db = await import('./db/index.js');
  repo = await import('./db/repo.js');
  const noKey = { ...process.env, HOPEWICK_DATA_KEY: '', HOPEWICK_DATA_KEY_PREVIOUS: '' };
  const withKey = { ...process.env, HOPEWICK_DATA_KEY: crypto.randomBytes(32).toString('base64'), HOPEWICK_DATA_KEY_ID: 'test1' };

  try {
    await t.test('migrations are applied and re-running is a no-op', async () => {
      const again = await migrate({ log: () => {} });
      assert.deepEqual(again, []);
      const status = await migrationStatus();
      assert.ok(status.length >= 2);
      assert.ok(status.every((s) => s.applied && !s.drift));
      const probe = await db.probeDatabase();
      assert.equal(probe.ok, true);
      assert.equal(probe.schemaVersion, status.length);
    });

    await t.test('profiles and mood entries round trip; one check-in per day', async () => {
      await repo.upsertProfile(A, 'main', { displayName: 'Ana', theme: 'dark' }, noKey);
      const p = await repo.getProfile(A, 'main', noKey);
      assert.equal(p.display_name, 'Ana');
      assert.equal(p.theme, 'dark');
      await repo.upsertMood(A, { date: '2026-10-12', moodScore: 4, moodLabel: 'Okay', craving: 'Mild', gratitude: ['tea'] }, noKey);
      await repo.upsertMood(A, { date: '2026-10-12', moodScore: 5, moodLabel: 'Good', craving: 'None' }, noKey);
      const moods = await repo.listMoods(A, {}, noKey);
      assert.equal(moods.length, 1);
      assert.equal(moods[0].mood_score, 5);
    });

    await t.test('constraints reject invalid data', async () => {
      await assert.rejects(() => repo.upsertMood(A, { date: '2026-10-13', moodScore: 9 }, noKey), /check constraint/i);
      await assert.rejects(() => repo.upsertMood(A, { date: '2026-10-13', craving: 'Extreme' }, noKey), /check constraint/i);
      await assert.rejects(() => repo.upsertMood(A, { date: '2026-10-13' }, noKey), /check constraint/i); // empty check-in
      await assert.rejects(() => repo.upsertProfile(A, 'main', { theme: 'neon' }, noKey), /check constraint/i);
      await assert.rejects(() => db.withUser(A, (c) => c.query(
        "INSERT INTO goals (user_id, week_start, position, specific) VALUES ($1, '2026-10-13', 0, 'walk')", [A]), noKey), /check constraint/i); // Tuesday
      await assert.rejects(() => repo.createJournalEntry(A, { body: '' }, noKey), /required/);
      await assert.rejects(() => repo.upsertProfile("x'; drop", 'main', {}, noKey), /valid signed-in user id/);
    });

    await t.test('row level security: users cannot read or write each other\'s rows', async () => {
      await repo.upsertMood(B, { date: '2026-10-12', moodScore: 2 }, noKey);
      await repo.createJournalEntry(B, { body: 'B private words' }, noKey);
      // A query with no WHERE clause, run as A, still only sees A's rows.
      const seen = await db.withUser(A, async (c) => (await c.query('SELECT user_id FROM mood_entries')).rows, noKey);
      assert.ok(seen.length >= 1);
      assert.ok(seen.every((r) => r.user_id === A));
      const journals = await db.withUser(A, async (c) => (await c.query('SELECT body FROM journal_entries')).rows, noKey);
      assert.ok(!journals.some((r) => r.body === 'B private words'));
      // A cannot insert rows for B, nor update or delete B's rows.
      await assert.rejects(() => db.withUser(A, (c) => c.query(
        "INSERT INTO mood_entries (user_id, entry_date, mood_score) VALUES ($1, '2026-10-14', 3)", [B]), noKey), /row-level security/i);
      const upd = await db.withUser(A, (c) => c.query('UPDATE mood_entries SET mood_score = 1 WHERE user_id = $1', [B]), noKey);
      assert.equal(upd.rowCount, 0);
      const del = await db.withUser(A, (c) => c.query('DELETE FROM journal_entries WHERE user_id = $1', [B]), noKey);
      assert.equal(del.rowCount, 0);
      assert.equal((await repo.listJournalEntries(B, {}, noKey)).length, 1);
      // A message cannot be attached to someone else's conversation.
      const conv = await db.withUser(B, async (c) => (await c.query(
        "INSERT INTO ai_conversations (user_id, client_id, title) VALUES ($1, 'c1', 'chat') RETURNING id", [B])).rows[0].id, noKey);
      await assert.rejects(() => db.withUser(A, (c) => c.query(
        "INSERT INTO ai_messages (conversation_id, user_id, role, content) VALUES ($1, $2, 'user', 'hi')", [conv, A]), noKey));
    });

    await t.test('without app.user_id nothing is visible', async () => {
      const pool = await db.getPool();
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE hopewick_rls');
        const { rows } = await c.query('SELECT count(*)::int AS n FROM mood_entries');
        assert.equal(rows[0].n, 0);
        await c.query('ROLLBACK');
      } finally { c.release(); }
    });

    await t.test('journal and safety plan text is encrypted at rest when a key is set', async () => {
      await repo.createJournalEntry(A, { clientId: 'j1', title: 'Sunday', body: 'I felt the urge and rang Lifeline.' }, withKey);
      const raw = await db.withUser(A, async (c) => (await c.query("SELECT title, body, encryption FROM journal_entries WHERE user_id = $1 AND client_id = 'j1'", [A])).rows[0], withKey);
      assert.equal(raw.encryption, 'aes-256-gcm-v1');
      assert.ok(raw.body.startsWith('hwenc:v1:test1:'));
      assert.ok(!raw.body.includes('Lifeline'));
      const list = await repo.listJournalEntries(A, {}, withKey);
      assert.equal(list.find((e) => e.client_id === 'j1').body, 'I felt the urge and rang Lifeline.');

      const v1 = await repo.saveSafetyPlan(A, 'main', { warning_signs: 'not sleeping', support_contacts: 'Mum 0400 000 000' }, withKey);
      const v2 = await repo.saveSafetyPlan(A, 'main', { warning_signs: 'not sleeping, skipping meals', support_contacts: 'Mum 0400 000 000' }, withKey);
      assert.equal(v2, v1 + 1);
      const rawPlan = await db.withUser(A, async (c) => (await c.query('SELECT support_contacts FROM safety_plans WHERE user_id = $1', [A])).rows[0], withKey);
      assert.ok(rawPlan.support_contacts.startsWith('hwenc:v1:'));
      const plan = await repo.getSafetyPlan(A, 'main', withKey);
      assert.equal(plan.warning_signs, 'not sleeping, skipping meals');
      assert.equal(plan.support_contacts, 'Mum 0400 000 000');
      await assert.rejects(() => repo.getSafetyPlan(A, 'main', noKey), /No key loaded/);
    });

    await t.test('consent changes are kept as current value plus history', async () => {
      await repo.setConsent(A, 'journal_sync', true, '2026-10', 'app', noKey);
      await repo.setConsent(A, 'journal_sync', false, '2026-10', 'app', noKey);
      const current = await repo.listConsents(A, noKey);
      assert.equal(current.find((r) => r.consent_key === 'journal_sync').granted, false);
      const history = await db.withUser(A, async (c) => (await c.query("SELECT count(*)::int AS n FROM consent_events WHERE user_id = $1", [A])).rows[0].n, noKey);
      assert.equal(history, 2);
    });

    await t.test('deleting a user removes every row (cascade)', async () => {
      assert.equal(await repo.deleteAllUserData(A, noKey), 1);
      const left = await db.withUser(A, async (c) => {
        const out = {};
        for (const tbl of ['user_profiles', 'mood_entries', 'journal_entries', 'safety_plans', 'consent_preferences', 'consent_events']) {
          out[tbl] = (await c.query(`SELECT count(*)::int AS n FROM ${tbl}`)).rows[0].n;
        }
        return out;
      }, noKey);
      assert.ok(Object.values(left).every((n) => n === 0), JSON.stringify(left));
      assert.equal((await repo.listJournalEntries(B, {}, noKey)).length, 1, 'other users are untouched');
    });
  } finally {
    try { await repo.deleteAllUserData(A, noKey); } catch { /* already gone */ }
    try { await repo.deleteAllUserData(B, noKey); } catch { /* already gone */ }
    await db.closePool();
  }
});
