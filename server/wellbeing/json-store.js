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
import { RECOVERY_LIMITS, mergeLearning } from './recovery.js';

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
      u.profiles[profileId] = { checkins: {}, activities: [], goals: [], journal: [], plans: null, nextSteps: [], weeklyPlans: [], recoveryGoals: [], recoveryLogs: [], learning: {} };
    }
    const p = u.profiles[profileId];
    if (!Array.isArray(p.weeklyPlans)) p.weeklyPlans = []; // rows saved before weekly plans existed
    if (!Array.isArray(p.recoveryGoals)) p.recoveryGoals = []; // rows saved before Stage 4
    if (!Array.isArray(p.recoveryLogs)) p.recoveryLogs = [];
    if (!p.learning || typeof p.learning !== 'object' || Array.isArray(p.learning)) p.learning = {};
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

  /* ----- Stage 4: recovery tracker and learning (labels, notes and reflections are sealed) ----- */
  const outRGoal = (u, r) => ({ ...r, label: open(u, 'rgoal.label', r.label) || '', target: open(u, 'rgoal.target', r.target) || '', why: open(u, 'rgoal.why', r.why) || '' });
  const sealRGoal = (u, g) => ({ ...g, label: seal(u, 'rgoal.label', g.label), target: seal(u, 'rgoal.target', g.target), why: seal(u, 'rgoal.why', g.why) });
  const outRLog = (u, r) => ({ ...r, triggers: openList(u, 'rlog.triggers', r.triggers), helped: open(u, 'rlog.helped', r.helped) || '', note: open(u, 'rlog.note', r.note) || '' });
  const sealRLog = (u, l) => ({ ...l, triggers: sealList(u, 'rlog.triggers', l.triggers), helped: seal(u, 'rlog.helped', l.helped), note: seal(u, 'rlog.note', l.note) });
  const outLearn = (u, id, r) => {
    let notes = {};
    if (r.notes) { try { notes = JSON.parse(open(u, 'learn.notes', r.notes) || '{}') || {}; } catch { notes = {}; } }
    return { moduleId: id, step: r.step || 0, completedAt: r.completedAt || null, quiz: r.quiz || null, notes, startedAt: r.startedAt, updatedAt: r.updatedAt };
  };
  const sealLearn = (u, r) => ({ step: r.step, completedAt: r.completedAt, quiz: r.quiz, startedAt: r.startedAt, updatedAt: r.updatedAt, notes: Object.keys(r.notes || {}).length ? seal(u, 'learn.notes', JSON.stringify(r.notes)) : null });
  const byDateDesc = (a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1));

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

    async listRecoveryGoals(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return p.recoveryGoals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map((r) => outRGoal(userId, r));
    },
    async createRecoveryGoal(userId, profileId, goal) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        if (p.recoveryGoals.length >= RECOVERY_LIMITS.goals) throw new ValidationError(`You can keep up to ${RECOVERY_LIMITS.goals} recovery goals.`, 'goals');
        const at = iso();
        const row = { id: newId(), kind: goal.kind, label: goal.label || '', target: goal.target || '', why: goal.why || '', startDate: goal.startDate, status: goal.status || 'active', createdAt: at, updatedAt: at };
        p.recoveryGoals.push(sealRGoal(userId, row));
        return row;
      });
    },
    async updateRecoveryGoal(userId, profileId, id, patch) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.recoveryGoals, id);
      const next = { ...outRGoal(userId, p.recoveryGoals[i]), ...patch, updatedAt: iso() };
      return write(() => { p.recoveryGoals[i] = sealRGoal(userId, next); return next; });
    },
    /** Deleting a goal also deletes the lapse and craving logs attached to it. */
    async deleteRecoveryGoal(userId, profileId, id) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.recoveryGoals, id);
      return write(() => { p.recoveryGoals.splice(i, 1); p.recoveryLogs = p.recoveryLogs.filter((l) => l.goalId !== id); return true; });
    },
    async listRecoveryLogs(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return p.recoveryLogs.slice().sort(byDateDesc).map((r) => outRLog(userId, r));
    },
    async createRecoveryLog(userId, profileId, log) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        if (log.goalId && !p.recoveryGoals.some((g) => g.id === log.goalId)) throw new NotFoundError('That recovery goal was not found.');
        if (p.recoveryLogs.length >= RECOVERY_LIMITS.logs) throw new ValidationError('This profile has the most tracker entries Hopewick keeps. Delete some old ones first.', 'logs');
        const at = iso();
        const row = { id: newId(), goalId: log.goalId || null, kind: log.kind, date: log.date, intensity: log.intensity ?? null, triggers: log.triggers || [], outcome: log.outcome || null, helped: log.helped || '', note: log.note || '', createdAt: at, updatedAt: at };
        p.recoveryLogs.push(sealRLog(userId, row));
        return row;
      });
    },
    async updateRecoveryLog(userId, profileId, id, patch) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.recoveryLogs, id);
      if (patch.goalId && !p.recoveryGoals.some((g) => g.id === patch.goalId)) throw new NotFoundError('That recovery goal was not found.');
      const next = { ...outRLog(userId, p.recoveryLogs[i]), ...patch, kind: p.recoveryLogs[i].kind, updatedAt: iso() };
      return write(() => { p.recoveryLogs[i] = sealRLog(userId, next); return next; });
    },
    async deleteRecoveryLog(userId, profileId, id) {
      const p = profRow(userId, profileId, false);
      if (!p) throw new NotFoundError();
      const i = findIn(p.recoveryLogs, id);
      return write(() => { p.recoveryLogs.splice(i, 1); return true; });
    },
    async listLearning(userId, profileId) {
      const p = profRow(userId, profileId, false);
      if (!p) return [];
      return Object.entries(p.learning).map(([id, r]) => outLearn(userId, id, r)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async saveLearning(userId, profileId, moduleId, patch) {
      return write(() => {
        const p = profRow(userId, profileId, true);
        const has = Object.prototype.hasOwnProperty.call(p.learning, moduleId);
        if (!has && Object.keys(p.learning).length >= RECOVERY_LIMITS.modules) throw new ValidationError('Too many modules tracked.', 'moduleId');
        const prev = has ? outLearn(userId, moduleId, p.learning[moduleId]) : null;
        const next = mergeLearning(prev, patch, iso());
        p.learning[moduleId] = sealLearn(userId, next);
        return { ...next, moduleId };
      });
    },
    async deleteLearning(userId, profileId, moduleId) {
      const p = profRow(userId, profileId, false);
      if (!p || !Object.prototype.hasOwnProperty.call(p.learning, moduleId)) throw new NotFoundError();
      return write(() => { delete p.learning[moduleId]; return true; });
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
        recovery: () => { const n = p.recoveryGoals.length + p.recoveryLogs.length; p.recoveryGoals = []; p.recoveryLogs = []; return n; },
        learning: () => { const n = Object.keys(p.learning).length; p.learning = {}; return n; },
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
