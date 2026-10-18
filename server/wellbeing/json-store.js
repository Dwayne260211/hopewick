/**
 * Wellbeing data in a JSON file (fallback used while DATABASE_URL is not set,
 * which is production today). Per account id, then per profile id.
 *
 * Uses server/json-file.js, so it is fail-loud (a corrupt file is never treated
 * as empty or overwritten; /api/health returns 503) and every write is atomic
 * (temp file + fsync + rename) with a rolling .bak copy.
 *
 * Sensitive text (check-in feelings/notes/triggers, journal, plans, next-step
 * text, goal text, activity notes) is encrypted with AES-256-GCM when
 * HOPEWICK_DATA_KEY is set (server/db/crypto.js), bound to the user and field.
 */
import { createJsonFile } from '../json-file.js';
import { encryptText, decryptText } from '../db/crypto.js';
import {
  LIMITS, NotFoundError, ValidationError, newId, defaultSettings, SETTINGS, POLICY_VERSION,
} from './validate.js';
import { applyActivityPatch, applyGoalPatch, applyStepPatch, applyWeeklyPlanPatch } from './model.js';

const MAX_PROFILES = 12;

export function createJsonWellbeingStore(filePath, { env = process.env } = {}) {
  const file = createJsonFile(filePath, {
    label: 'wellbeing.json',
    isValid: (p) => Boolean(p) && typeof p === 'object' && Boolean(p.users) && typeof p.users === 'object' && !Array.isArray(p.users),
    empty: () => ({ version: 1, users: {} }),
    serialize: (value) => JSON.stringify(value),
  });
  const data = file.initial;

  const seal = (userId, field, value) => (value == null || value === '' ? value : encryptText(String(value), env, `${userId}:wb.${field}`));
  const open = (userId, field, value) => (value == null || value === '' ? value : decryptText(value, env, `${userId}:wb.${field}`));
  const sealList = (userId, field, list) => seal(userId, field, JSON.stringify(list || []));
  const openList = (userId, field, value) => {
    if (Array.isArray(value)) return value;
    const text = open(userId, field, value);
    try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  };

  function persist() { file.write(data); }
  function userRow(userId, create) {
    if (!data.users[userId]) {
      if (!create) return null;
      data.users[userId] = { settings: {}, consentEvents: [], profiles: {} };
    }
    return data.users[userId];
  }
  function profRow(userId, profileId, create) {
    const u = userRow(userId, create);
    if (!u) return null;
    if (!u.profiles[profileId]) {
      if (!create) return null;
      if (Object.keys(u.profiles).length >= MAX_PROFILES) throw new ValidationError('This account already has the most profiles Hopewick keeps.', 'profileId');
      u.profiles[profileId] = { checkins: {}, activities: [], goals: [], journal: [], plans: null, nextSteps: [], weeklyPlans: [] };
    }
    const p = u.profiles[profileId];
    if (!Array.isArray(p.weeklyPlans)) p.weeklyPlans = []; // rows saved before weekly plans existed
    return p;
  }
  function write(fn) {
    file.assertWritable();
    const out = fn();
    persist();
    return out;
  }
  const iso = () => new Date().toISOString();

  /* ----- checkins ----- */
  const outCheckin = (u, r) => ({
    id: r.id, date: r.date, mood: r.mood, moodLabel: r.moodLabel,
    feelings: open(u, 'checkin.feelings', r.feelings) || '', triggers: openList(u, 'checkin.triggers', r.triggers),
    intensity: r.intensity ?? null, craving: r.craving ?? null, notes: open(u, 'checkin.notes', r.notes) || '',
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  });
  /* ----- activities ----- */
  const outActivity = (u, r) => ({ ...r, note: open(u, 'activity.note', r.note) || '' });
  const outGoal = (u, r) => ({ ...r, title: open(u, 'goal.title', r.title), detail: open(u, 'goal.detail', r.detail) || '' });
  const outJournal = (u, r) => ({
    ...r,
    title: open(u, 'journal.title', r.title) || '', body: open(u, 'journal.body', r.body),
    refined: open(u, 'journal.refined', r.refined) || '', emotions: open(u, 'journal.emotions', r.emotions) || '',
  });
  const sealJournal = (u, e) => ({
    ...e,
    title: seal(u, 'journal.title', e.title), body: seal(u, 'journal.body', e.body),
    refined: seal(u, 'journal.refined', e.refined), emotions: seal(u, 'journal.emotions', e.emotions),
  });
  const outWeekly = (u, r) => ({ ...r, title: open(u, 'weekly.title', r.title), steps: openList(u, 'weekly.steps', r.steps) });
  const sealWeekly = (u, w) => ({ ...w, title: seal(u, 'weekly.title', w.title), steps: sealList(u, 'weekly.steps', w.steps) });
  const outStep = (u, r) => ({
    ...r, title: open(u, 'step.title', r.title), detail: open(u, 'step.detail', r.detail) || '', reflection: open(u, 'step.reflection', r.reflection) || '',
  });
  const sealStep = (u, s) => ({
    ...s,
    ...(s.title !== undefined ? { title: seal(u, 'step.title', s.title) } : {}),
    ...(s.detail !== undefined ? { detail: seal(u, 'step.detail', s.detail) } : {}),
    ...(s.reflection !== undefined ? { reflection: seal(u, 'step.reflection', s.reflection) } : {}),
  });

  function findIn(list, id) {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) throw new NotFoundError();
    return i;
  }

  return {
    backend: 'json',
    health: () => file.health(),

    async getSettings(userId) {
      const u = userRow(userId, false);
      return { ...defaultSettings(), ...(u ? u.settings : {}) };
    },
    async updateSettings(userId, patch, { source = 'app' } = {}) {
      return write(() => {
        const u = userRow(userId, true);
        const at = iso();
        for (const [k, v] of Object.entries(patch)) {
          if (u.settings[k] === v) continue;
          u.settings[k] = v;
          u.consentEvents.push({ key: SETTINGS[k].consentKey, value: v, policyVersion: POLICY_VERSION, source, at });
        }
        if (u.consentEvents.length > 500) u.consentEvents = u.consentEvents.slice(-500);
        return { ...defaultSettings(), ...u.settings };
      });
    },
    async consentHistory(userId) {
      const u = userRow(userId, false);
      return u ? u.consentEvents.slice() : [];
    },

    async listCheckins(userId, profileId, { from, to } = {}) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return Object.values(p.checkins)
        .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((r) => outCheckin(userId, r));
    },
    async putCheckin(userId, profileId, entry) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        const prev = p.checkins[entry.date];
        const at = iso();
        const row = {
          id: prev ? prev.id : newId(), date: entry.date, mood: entry.mood, moodLabel: entry.moodLabel,
          feelings: seal(userId, 'checkin.feelings', entry.feelings), triggers: sealList(userId, 'checkin.triggers', entry.triggers),
          intensity: entry.intensity, craving: entry.craving, notes: seal(userId, 'checkin.notes', entry.notes),
          createdAt: prev ? prev.createdAt : at, updatedAt: at,
        };
        p.checkins[entry.date] = row;
        const dates = Object.keys(p.checkins).sort();
        for (const d of dates.slice(0, Math.max(0, dates.length - LIMITS.checkinDays))) delete p.checkins[d];
        return outCheckin(userId, row);
      });
    },
    async deleteCheckin(userId, profileId, date) {
      const p = profRow(userId, profileId, false);
      if (!p || !p.checkins[date]) throw new NotFoundError('There is no check-in on that day.');
      return write(() => { delete p.checkins[date]; return true; });
    },

    async listActivities(userId, profileId, { limit = 200 } = {}) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return p.activities.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, limit).map((r) => outActivity(userId, r));
    },
    async startActivity(userId, profileId, start) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        const at = iso();
        const row = { id: newId(), toolKey: start.toolKey, toolType: start.toolType, status: 'started', stepIndex: start.stepIndex || 0,
          startedAt: at, updatedAt: at, completedAt: null, durationSeconds: null, helpful: null, note: '' };
        p.activities.push(row);
        if (p.activities.length > LIMITS.activities) p.activities = p.activities.slice(-LIMITS.activities);
        return outActivity(userId, row);
      });
    },
    async updateActivity(userId, profileId, id, patch) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.activities, id);
      const plainPrev = outActivity(userId, p.activities[i]);
      const next = applyActivityPatch(plainPrev, patch);
      return write(() => {
        p.activities[i] = { ...next, note: seal(userId, 'activity.note', next.note) };
        return outActivity(userId, p.activities[i]);
      });
    },
    async deleteActivity(userId, profileId, id) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.activities, id);
      return write(() => { p.activities.splice(i, 1); return true; });
    },

    async listGoals(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return p.goals.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map((r) => outGoal(userId, r));
    },
    async createGoal(userId, profileId, goal) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        if (p.goals.length >= LIMITS.goals) throw new ValidationError(`You can keep up to ${LIMITS.goals} goals. Delete an old one first.`, 'goals');
        const at = iso();
        const row = applyGoalPatch({ id: newId(), title: goal.title, detail: goal.detail, category: goal.category, status: 'active', progress: goal.progress || 0, createdAt: at, updatedAt: at, completedAt: null }, { status: goal.status });
        p.goals.push({ ...row, title: seal(userId, 'goal.title', row.title), detail: seal(userId, 'goal.detail', row.detail) });
        return row;
      });
    },
    async updateGoal(userId, profileId, id, patch) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.goals, id);
      const next = applyGoalPatch(outGoal(userId, p.goals[i]), patch);
      return write(() => {
        p.goals[i] = { ...next, title: seal(userId, 'goal.title', next.title), detail: seal(userId, 'goal.detail', next.detail) };
        return next;
      });
    },
    async deleteGoal(userId, profileId, id) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.goals, id);
      return write(() => { p.goals.splice(i, 1); return true; });
    },

    async listJournal(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return p.journal.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((r) => outJournal(userId, r));
    },
    async createJournal(userId, profileId, entry) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        if (entry.clientId) {
          const dup = p.journal.find((x) => x.clientId === entry.clientId);
          if (dup) return outJournal(userId, dup);
        }
        if (p.journal.length >= LIMITS.journalEntries) throw new ValidationError(`The journal keeps up to ${LIMITS.journalEntries} entries. Export and delete older ones first.`, 'journal');
        const at = iso();
        const row = { id: newId(), clientId: entry.clientId || null, kind: entry.kind, prompt: entry.prompt || '', packId: entry.packId || null, entryDate: entry.entryDate,
          title: entry.title, body: entry.body, refined: entry.refined || '', emotions: entry.emotions || '',
          createdAt: entry.createdAt || at, updatedAt: entry.updatedAt || at };
        p.journal.push(sealJournal(userId, row));
        return row;
      });
    },
    async updateJournal(userId, profileId, id, patch) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.journal, id);
      const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && !(k === 'entryDate' && v == null)));
      const next = { ...outJournal(userId, p.journal[i]), ...clean, updatedAt: iso() };
      return write(() => { p.journal[i] = sealJournal(userId, next); return next; });
    },
    async deleteJournal(userId, profileId, id) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.journal, id);
      return write(() => { p.journal.splice(i, 1); return true; });
    },
    async importJournal(userId, profileId, items) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        let imported = 0; let skipped = 0;
        for (const e of items) {
          if (p.journal.some((x) => x.clientId === e.clientId)) { skipped += 1; continue; }
          if (p.journal.length >= LIMITS.journalEntries) { skipped += 1; continue; }
          p.journal.push(sealJournal(userId, { id: newId(), ...e }));
          imported += 1;
        }
        return { imported, skipped };
      });
    },

    async getPlans(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p || !p.plans) return null;
      return { ...JSON.parse(open(userId, 'plans', p.plans.doc)), updatedAt: p.plans.updatedAt, version: p.plans.version };
    },
    async putPlans(userId, profileId, plans) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        const version = (p.plans ? p.plans.version : 0) + 1;
        const at = iso();
        p.plans = { doc: seal(userId, 'plans', JSON.stringify(plans)), updatedAt: at, version };
        return { ...plans, updatedAt: at, version };
      });
    },

    async listSteps(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return p.nextSteps.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((r) => outStep(userId, r));
    },
    async createStep(userId, profileId, step) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        if (p.nextSteps.length >= LIMITS.nextSteps) p.nextSteps = p.nextSteps.slice(-(LIMITS.nextSteps - 1));
        const at = iso();
        const row = { id: newId(), title: step.title, detail: step.detail || '', copingKey: step.copingKey || null, source: step.source, status: 'open',
          reflection: '', followUpOptIn: !!step.followUpOptIn, createdAt: at, updatedAt: at, completedAt: null };
        p.nextSteps.push(sealStep(userId, row));
        return row;
      });
    },
    async updateStep(userId, profileId, id, patch) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.nextSteps, id);
      const next = applyStepPatch(outStep(userId, p.nextSteps[i]), patch);
      return write(() => { p.nextSteps[i] = sealStep(userId, next); return next; });
    },
    async deleteStep(userId, profileId, id) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.nextSteps, id);
      return write(() => { p.nextSteps.splice(i, 1); return true; });
    },

    async listWeeklyPlans(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return p.weeklyPlans.slice().sort((a, b) => (a.weekStart === b.weekStart ? (a.createdAt < b.createdAt ? 1 : -1) : (a.weekStart < b.weekStart ? 1 : -1))).map((r) => outWeekly(userId, r));
    },
    async createWeeklyPlan(userId, profileId, plan) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        if (p.weeklyPlans.length >= LIMITS.weeklyPlans) throw new ValidationError(`You can keep up to ${LIMITS.weeklyPlans} weekly plans. Delete an old one first.`, 'weeklyPlans');
        const at = iso();
        const row = applyWeeklyPlanPatch({ id: newId(), weekStart: plan.weekStart, title: plan.title, steps: [], status: 'active', createdAt: at, updatedAt: at, completedAt: null }, { steps: plan.steps, status: plan.status }, at);
        p.weeklyPlans.push(sealWeekly(userId, row));
        return row;
      });
    },
    async updateWeeklyPlan(userId, profileId, id, patch) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.weeklyPlans, id);
      const next = applyWeeklyPlanPatch(outWeekly(userId, p.weeklyPlans[i]), patch);
      return write(() => { p.weeklyPlans[i] = sealWeekly(userId, next); return next; });
    },
    async deleteWeeklyPlan(userId, profileId, id) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.weeklyPlans, id);
      return write(() => { p.weeklyPlans.splice(i, 1); return true; });
    },

    /** The person asked to delete one kind of data (or all of it) for this profile. Never called because of plan status. */
    async clearArea(userId, profileId, area) {
      const p = profRow(userId, profileId, false);
      if (!p) return 0;
      const counts = {
        checkins: () => { const n = Object.keys(p.checkins).length; p.checkins = {}; return n; },
        activities: () => { const n = p.activities.length; p.activities = []; return n; },
        goals: () => { const n = p.goals.length; p.goals = []; return n; },
        journal: () => { const n = p.journal.length; p.journal = []; return n; },
        plans: () => { const n = p.plans ? 1 : 0; p.plans = null; return n; },
        steps: () => { const n = p.nextSteps.length; p.nextSteps = []; return n; },
        'weekly-plans': () => { const n = p.weeklyPlans.length; p.weeklyPlans = []; return n; },
      };
      return write(() => {
        if (area === 'all') {
          const n = Object.values(counts).reduce((sum, fn) => sum + fn(), 0);
          delete data.users[userId].profiles[profileId];
          return n;
        }
        return counts[area]();
      });
    },

    async profileIds(userId) {
      const u = userRow(userId, false);
      return u ? Object.keys(u.profiles) : [];
    },
    /** Remove everything for this account (account deletion). */
    async forget(userId) {
      if (!data.users[userId]) return false;
      return write(() => { delete data.users[userId]; return true; });
    },
  };
}
