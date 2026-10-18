#!/usr/bin/env node
/**
 * Build SYNTHETIC Hopewick JSON store files for rehearsing the JSON -> Postgres
 * migration. Nothing here reads production data. Every person, email and word is
 * made up. Files are written with the app's own store code, so the shapes and the
 * encrypted fields match production exactly (encrypted with a TEST key you pass in).
 *
 *   HOPEWICK_DATA_KEY=<test key> node tools/db/make-synthetic-store.mjs --out /tmp/hw-synth --users 40
 *
 * Writes users.json, wellbeing.json, fitness.json, chats.json, checkins.json, visits.json.
 * Never point --out at the real data directory: the script refuses if the folder already
 * contains a users.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createJsonWellbeingStore } from '../../server/wellbeing/json-store.js';
import { createJsonFitnessStore } from '../../server/fitness/store.js';
import { createStore } from '../../server/store.js';
import { encryptionEnabled } from '../../server/db/crypto.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const out = path.resolve(opt('out', ''));
const N = Math.max(1, Math.min(2000, Number(opt('users', 40))));
const seed = Number(opt('seed', 20261018));
if (!opt('out')) { console.error('Pass --out <empty folder>.'); process.exit(2); }
if (fs.existsSync(path.join(out, 'users.json'))) { console.error(`Refusing: ${out} already has a users.json. Use an empty folder.`); process.exit(2); }
if (!encryptionEnabled(process.env)) console.warn('Note: HOPEWICK_DATA_KEY is not set, so sensitive fields are written as plain text. Set a TEST key to rehearse encrypted data.');
fs.mkdirSync(out, { recursive: true });

// Small deterministic PRNG so a rehearsal can be repeated exactly.
let s = seed >>> 0;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const NOW = Date.parse('2026-10-18T09:00:00Z');
const isoAgo = (days, extraMs = 0) => new Date(NOW - days * 86400000 + extraMs).toISOString();
const dateAgo = (days) => isoAgo(days).slice(0, 10);

const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Riley', 'Casey', 'Morgan', 'Jamie', 'Quinn', 'Charlie', 'Avery', 'Harper'];
const FEEL = ['tired but okay', 'a bit flat', 'hopeful today', 'restless after work', 'proud of getting through', 'anxious about the weekend'];
const TRIG = ['payday', 'boredom', 'stress', 'friends', 'tired', 'lonely', 'pub'];
const WORDS = 'walked the dog called my sister made a cuppa wrote things down had an early night went to the meeting cooked dinner'.split(' ');
const sentence = (n = int(6, 18)) => Array.from({ length: n }, () => pick(WORDS)).join(' ').replace(/^./, (c) => c.toUpperCase()) + '.';

// Entitlement mix like production: free, trialing, paid, lapsed, past due, Google Play, founder comp.
const PLANS = ['none', 'none', 'none', 'trialing', 'active', 'active', 'canceled', 'past_due', 'play', 'founder'];

const users = createStore(path.join(out, 'users.json'));
const wb = createJsonWellbeingStore(path.join(out, 'wellbeing.json'));
const fit = createJsonFitnessStore(path.join(out, 'fitness.json'));
const chats = { version: 1, users: {} };
const legacy = { users: {} };
const ids = [];

for (let n = 0; n < N; n += 1) {
  const plan = PLANS[n % PLANS.length];
  const email = plan === 'founder' ? `founder-test-${n}@example.test` : `synthetic-${n}@example.test`;
  const u = users.createUser(email);
  const age = int(5, 400);
  u.createdAt = isoAgo(age);
  u.name = pick(FIRST);
  if (plan === 'founder') { u.subscriptionStatus = 'none'; } // founder comp comes from FOUNDER_PLUS_EMAILS, not a stored field
  else if (plan === 'play') { u.billingProvider = 'google_play'; u.playPurchaseToken = `synthetic-play-${crypto.randomBytes(6).toString('hex')}`; u.subscriptionStatus = 'active'; u.currentPeriodEnd = isoAgo(-20); }
  else if (plan !== 'none') {
    u.stripeCustomerId = `cus_TEST${crypto.randomBytes(5).toString('hex')}`;
    u.stripeSubscriptionId = `sub_TEST${crypto.randomBytes(6).toString('hex')}`;
    u.subscriptionStatus = plan;
    u.currentPeriodEnd = plan === 'canceled' ? isoAgo(10) : isoAgo(-int(1, 28));
    u.cancelAtPeriodEnd = plan === 'canceled';
    if (plan === 'trialing') u.trialEnd = isoAgo(-int(1, 7));
  }
  if (rnd() < 0.5) u.passwordHash = `scrypt$synthetic$${crypto.randomBytes(16).toString('hex')}`;
  if (rnd() < 0.3) u.googleSub = `synthetic-google-${n}`;
  users.save(u);
  ids.push(u.id);
}
for (let n = 0; n < ids.length; n += 1) {
  const u = ids[n];
  if (n % 7 === 6) continue; // some accounts never used the wellbeing features
  await wb.updateSettings(u, { shareCheckinsWithHope: rnd() < 0.4, journalImport: pick(['done', 'declined', 'pending']), plansImport: pick(['done', 'declined']) });
  const profiles = n % 9 === 0 ? ['main', 'kid-1'] : ['main'];
  for (const p of profiles) {
    for (let d = 0; d < int(0, 25); d += 1) {
      const mood = int(1, 5);
      await wb.putCheckin(u, p, { date: dateAgo(d * int(1, 3)), mood, moodLabel: ['Struggling', 'Low', 'Okay', 'Good', 'Great'][mood - 1],
        feelings: rnd() < 0.7 ? pick(FEEL) : '', triggers: rnd() < 0.5 ? [pick(TRIG), pick(TRIG)] : [], intensity: rnd() < 0.6 ? int(0, 10) : null,
        craving: pick([null, 'None', 'Mild', 'Moderate', 'Strong']), notes: rnd() < 0.5 ? sentence() : '' });
    }
    for (let i = 0; i < int(0, 6); i += 1) {
      const a = await wb.startActivity(u, p, { toolKey: pick(['breathing-box', 'grounding-54321', 'urge-surfing', 'muscle-relaxation']), toolType: pick(['breathing', 'grounding', 'urge_surfing', 'muscle_relaxation']), stepIndex: 0 });
      if (rnd() < 0.7) await wb.updateActivity(u, p, a.id, { status: 'completed', durationSeconds: int(60, 900), helpful: pick(['yes', 'somewhat', 'no']), note: rnd() < 0.5 ? sentence() : '' });
    }
    for (let i = 0; i < int(0, 3); i += 1) {
      const g = await wb.createGoal(u, p, { title: `Goal: ${sentence(4)}`, detail: sentence(), category: pick(['wellbeing', 'recovery', 'emotional', 'other']), progress: int(0, 90) });
      if (rnd() < 0.3) await wb.updateGoal(u, p, g.id, { status: 'completed' });
    }
    for (let i = 0; i < int(0, 8); i += 1) {
      await wb.createJournal(u, p, { kind: pick(['free', 'prompt', 'gratitude', 'recovery']), prompt: rnd() < 0.4 ? 'What helped today?' : '', entryDate: dateAgo(int(0, 60)),
        title: rnd() < 0.6 ? sentence(3) : '', body: `${sentence()} ${sentence()}`, refined: '', emotions: rnd() < 0.5 ? 'calm, tired' : '', clientId: rnd() < 0.3 ? `local-${n}-${i}` : null,
        packId: rnd() < 0.2 ? 'first-week' : null });
    }
    if (rnd() < 0.7) {
      const safety = { warningSigns: [sentence(4)], copingThings: [sentence(3)], safePlaces: ['the park'], people: [{ name: pick(FIRST), phone: '0400 000 000' }],
        professionals: [{ name: 'GP clinic', phone: '07 0000 0000' }], safeEnvironment: [sentence(4)], reasons: [sentence(3)] };
      await wb.putPlans(u, p, { safety, relapse: { triggers: [pick(TRIG)], steps: [sentence(4)] }, exit: { people: [pick(FIRST)] } });
      for (let v = 0; v < int(1, 4); v += 1) await wb.addSafetyVersion(u, p, safety, { reason: v === 3 ? 'restore' : 'save' });
    }
    for (let i = 0; i < int(0, 4); i += 1) {
      const st = await wb.createStep(u, p, { title: `Next step: ${sentence(4)}`, detail: rnd() < 0.5 ? sentence() : '', source: pick(['user', 'suggested', 'hope']), copingKey: rnd() < 0.3 ? 'breathing-box' : null, followUpOptIn: rnd() < 0.2 });
      if (rnd() < 0.4) await wb.updateStep(u, p, st.id, { status: 'done', reflection: sentence() });
    }
    if (rnd() < 0.3) {
      // Weekly plans start on a Sunday.
      const sun = new Date(NOW); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay() - 7 * int(0, 4));
      await wb.createWeeklyPlan(u, p, { weekStart: sun.toISOString().slice(0, 10), title: `Week plan ${sentence(3)}`, steps: [{ id: crypto.randomUUID(), text: sentence(4), done: rnd() < 0.5 }], status: 'active' });
    }
    if (rnd() < 0.6) {
      const g = await wb.createRecoveryGoal(u, p, { kind: pick(['abstain', 'reduce', 'other']), label: pick(['alcohol', 'gambling', 'cannabis', '']), target: rnd() < 0.5 ? 'Weeknights off' : '', why: sentence(), startDate: dateAgo(int(5, 120)), status: 'active' });
      for (let i = 0; i < int(0, 10); i += 1) {
        const kind = rnd() < 0.8 ? 'craving' : 'lapse';
        await wb.createRecoveryLog(u, p, { goalId: rnd() < 0.85 ? g.id : null, kind, date: dateAgo(int(0, 40)), intensity: int(0, 10), triggers: [pick(TRIG)], outcome: kind === 'craving' ? pick(['passed', 'used', 'unsure']) : null, helped: rnd() < 0.6 ? sentence(4) : '', note: rnd() < 0.4 ? sentence() : '' });
      }
    }
    for (const m of ['cravings-triggers', 'sleep-basics', 'stress-anxiety', 'faith-hope-hard-days'].slice(0, int(0, 4))) {
      await wb.saveLearning(u, p, m, { step: int(1, 6), completed: rnd() < 0.4, quiz: rnd() < 0.5 ? { correct: int(0, 3), total: 3 } : undefined, reflection: rnd() < 0.5 ? sentence() : undefined });
    }
    if (rnd() < 0.6) {
      const answer = pick(['yes', 'no', 'later', null]);
      await wb.putPreferences(u, p, { preferredName: rnd() < 0.5 ? pick(FIRST) : '', focusAreas: [pick(['mood', 'anxiety', 'aod', 'sleep'])], tone: pick(['gentle', 'direct']),
        faithOptIn: answer === 'yes', faithTradition: 'christian', faithAnswer: answer, faithAskedAt: answer ? isoAgo(int(0, 20)) : null, faithLaterCount: answer === 'later' ? 1 : 0,
        onboardedAt: isoAgo(int(1, 30)), updatedAt: isoAgo(int(0, 5)) });
    }
    if (rnd() < 0.35) {
      await fit.saveScreen(u, p, { outcome: { general: 'ok', heat: pick(['ok', 'doctor']), cold: pick(['ok', 'avoid']) }, doneAt: isoAgo(int(1, 30)), doctorOk: rnd() < 0.3 });
      await fit.savePrefs(u, p, { level: pick(['beginner', 'intermediate']), track: pick(['standard', 'adapted']) });
      if (rnd() < 0.2) await fit.setLock(u, p, isoAgo(-1));
      for (let i = 0; i < int(0, 6); i += 1) {
        const sess = await fit.createSession(u, p, { kind: pick(['workout', 'sauna', 'cold', 'contrast']), planKey: pick(['move-30-a', 'sauna-15', 'cold-2']), detail: { moodBefore: int(1, 5) } });
        if (rnd() < 0.8) await fit.updateSession(u, p, sess.id, { status: pick(['completed', 'stopped']), durationSeconds: int(300, 1800), detail: { moodAfter: int(1, 5), stoppedEarly: rnd() < 0.2 } });
      }
    }
  }
  // Legacy files that stay on disk (not migrated): saved chats and the old check-in file.
  if (rnd() < 0.6) chats.users[u] = { profiles: { main: { conversations: [{ id: `c-${n}`, title: 'A chat', updated: NOW - int(1, 90) * 86400000, messages: [{ role: 'user', content: sentence() }, { role: 'assistant', content: sentence() }] }] } } };
  if (rnd() < 0.4) legacy.users[u] = { profiles: { main: { moods: { [dateAgo(3)]: { mood: 'Good', craving: 'Mild' } }, gratitude: {}, goals: {} } } };
}

// Spread the store-written timestamps over the past months so the rehearsal proves
// timestamps are preserved (they are not encrypted).
const shift = (iso, days) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(iso) ? new Date(Date.parse(iso) - days * 86400000).toISOString() : iso);
const wbFile = path.join(out, 'wellbeing.json');
const w = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
for (const row of Object.values(w.users)) {
  for (const p of Object.values(row.profiles)) {
    const back = int(1, 90);
    for (const list of [Object.values(p.checkins), p.activities, p.goals, p.journal, p.nextSteps, p.weeklyPlans, p.recoveryGoals, p.recoveryLogs, Object.values(p.learning), p.safetyVersions]) {
      for (const r of list) for (const k of ['createdAt', 'updatedAt', 'startedAt', 'completedAt', 'savedAt']) if (r[k]) r[k] = shift(r[k], back);
    }
    if (p.plans) p.plans.updatedAt = shift(p.plans.updatedAt, back);
  }
}
fs.writeFileSync(wbFile, JSON.stringify(w), { mode: 0o600 });
fs.writeFileSync(path.join(out, 'chats.json'), JSON.stringify(chats), { mode: 0o600 });
fs.writeFileSync(path.join(out, 'checkins.json'), JSON.stringify(legacy), { mode: 0o600 });
fs.writeFileSync(path.join(out, 'visits.json'), JSON.stringify({ visits: 1234 }), { mode: 0o600 });
for (const f of fs.readdirSync(out)) if (f.endsWith('.bak')) fs.rmSync(path.join(out, f));
console.log(`Synthetic store written to ${out}: ${ids.length} accounts, encryption ${encryptionEnabled(process.env) ? 'ON (test key)' : 'OFF'}.`);
