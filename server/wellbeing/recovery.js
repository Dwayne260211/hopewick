/**
 * Hopewick 2.0 Stage 4: recovery tracker and learning progress.
 *
 * Validation (shared by both storage backends) and the gentle day counts.
 *
 * Harm reduction framing, on purpose:
 *  - A goal can be to stop, to cut down, or another habit. Labels are optional.
 *  - "Days on this path" counts from the start date and never resets.
 *  - "Days that went to plan" = days on this path minus days with a lapse logged.
 *    A lapse takes one day out of that count, never the whole count.
 *  - Milestones are reached by days that went to plan, and once reached they
 *    stay reached. Nothing here ever says "failed" or "start again".
 */
import { ValidationError, cleanText, validDate, assertDate, assertNotFuture, brisbaneToday, isUuid } from './validate.js';

export const RECOVERY_LIMITS = Object.freeze({
  goals: 20,
  logs: 3000,
  label: 80,
  target: 200,
  why: 500,
  note: 1000,
  helped: 300,
  trigger: 40,
  triggers: 12,
  reflection: 2000,
  values: 12,
  value: 40,
  thoughtField: 600,
  modules: 200,
  stepMax: 40,
});
export const RECOVERY_GOAL_KINDS = Object.freeze(['abstain', 'reduce', 'other']);
export const RECOVERY_GOAL_STATUS = Object.freeze(['active', 'paused', 'archived']);
export const RECOVERY_LOG_KINDS = Object.freeze(['lapse', 'craving']);
export const CRAVING_OUTCOMES = Object.freeze(['passed', 'used', 'unsure']);
export const MILESTONES = Object.freeze([1, 3, 7, 14, 30, 60, 90, 180, 270, 365, 500, 730, 1000, 1095, 1461, 1826]);
export const THOUGHT_FIELDS = Object.freeze(['situation', 'thought', 'feeling', 'helpful', 'unhelpful', 'balanced']);
const MODULE_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

const obj = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
function pickFrom(value, allowed, field, fallback) {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`${field} is required.`, field);
  }
  if (!allowed.includes(value)) throw new ValidationError(`${field} is not one of the allowed values.`, field);
  return value;
}
function textList(value, maxItems, maxLen, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list.`, field);
  if (value.length > maxItems) throw new ValidationError(`Choose up to ${maxItems}.`, field);
  const out = [];
  for (const v of value) {
    const t = cleanText(v, maxLen, { field });
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/* ---------- goals ---------- */
export function normalizeRecoveryGoal(raw, { partial = false, now = new Date() } = {}) {
  const src = obj(raw);
  const out = {};
  if (!partial || src.kind !== undefined) out.kind = pickFrom(src.kind, RECOVERY_GOAL_KINDS, 'kind');
  if (!partial || src.label !== undefined) out.label = cleanText(src.label, RECOVERY_LIMITS.label, { field: 'label' });
  if (!partial || src.target !== undefined) out.target = cleanText(src.target, RECOVERY_LIMITS.target, { field: 'target' });
  if (!partial || src.why !== undefined) out.why = cleanText(src.why, RECOVERY_LIMITS.why, { multiline: true, field: 'why' });
  if (!partial || src.startDate !== undefined) {
    out.startDate = src.startDate == null || src.startDate === '' ? brisbaneToday(now) : assertNotFuture(assertDate(src.startDate, 'startDate'), now);
  }
  if (src.status !== undefined) out.status = pickFrom(src.status, RECOVERY_GOAL_STATUS, 'status');
  else if (!partial) out.status = 'active';
  return out;
}

/* ---------- lapse and craving logs ---------- */
export function normalizeRecoveryLog(raw, { partial = false, now = new Date() } = {}) {
  const src = obj(raw);
  const out = {};
  if (!partial) out.kind = pickFrom(src.kind, RECOVERY_LOG_KINDS, 'kind');
  if (!partial || src.goalId !== undefined) {
    const g = src.goalId == null || src.goalId === '' ? null : String(src.goalId);
    if (g && !isUuid(g) && !/^[A-Za-z0-9_-]{1,64}$/.test(g)) throw new ValidationError('That goal is not valid.', 'goalId');
    out.goalId = g;
  }
  if (!partial || src.date !== undefined) {
    out.date = src.date == null || src.date === '' ? brisbaneToday(now) : assertNotFuture(assertDate(src.date, 'date'), now);
  }
  if (!partial || src.intensity !== undefined) {
    if (src.intensity == null || src.intensity === '') out.intensity = null;
    else {
      const n = Number(src.intensity);
      if (!Number.isInteger(n) || n < 0 || n > 10) throw new ValidationError('How strong it was must be 0 to 10.', 'intensity');
      out.intensity = n;
    }
  }
  if (!partial || src.triggers !== undefined) out.triggers = textList(src.triggers, RECOVERY_LIMITS.triggers, RECOVERY_LIMITS.trigger, 'triggers');
  if (!partial || src.outcome !== undefined) out.outcome = src.outcome == null || src.outcome === '' ? null : pickFrom(src.outcome, CRAVING_OUTCOMES, 'outcome');
  if (!partial || src.helped !== undefined) out.helped = cleanText(src.helped, RECOVERY_LIMITS.helped, { multiline: true, field: 'helped' });
  if (!partial || src.note !== undefined) out.note = cleanText(src.note, RECOVERY_LIMITS.note, { multiline: true, field: 'note' });
  return out;
}

/* ---------- learning progress ---------- */
export function assertModuleId(id) {
  if (!MODULE_RE.test(String(id || ''))) throw new ValidationError('That module id is not valid.', 'moduleId');
  return String(id);
}
/** Progress plus the person's own private notes from a module (encrypted at rest). */
export function normalizeLearning(raw) {
  const src = obj(raw);
  const out = {};
  if (src.step !== undefined) {
    const n = Number(src.step);
    if (!Number.isInteger(n) || n < 0 || n > RECOVERY_LIMITS.stepMax) throw new ValidationError('step is out of range.', 'step');
    out.step = n;
  }
  if (src.completed !== undefined) out.completed = src.completed === true;
  if (src.reflection !== undefined) out.reflection = cleanText(src.reflection, RECOVERY_LIMITS.reflection, { multiline: true, field: 'reflection' });
  if (src.values !== undefined) out.values = textList(src.values, RECOVERY_LIMITS.values, RECOVERY_LIMITS.value, 'values');
  if (src.thoughtRecord !== undefined) {
    if (src.thoughtRecord === null) out.thoughtRecord = null;
    else {
      const tr = obj(src.thoughtRecord);
      out.thoughtRecord = {};
      for (const f of THOUGHT_FIELDS) out.thoughtRecord[f] = cleanText(tr[f], RECOVERY_LIMITS.thoughtField, { multiline: true, field: f });
    }
  }
  if (src.quiz !== undefined) {
    const q = obj(src.quiz);
    const correct = Number(q.correct); const total = Number(q.total);
    if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1 || total > 10 || correct < 0 || correct > total) throw new ValidationError('quiz result is not valid.', 'quiz');
    out.quiz = { correct, total };
  }
  return out;
}
/** Private notes (reflection, values, thought record) live in one encrypted JSON field. */
export const PRIVATE_LEARNING_KEYS = Object.freeze(['reflection', 'values', 'thoughtRecord']);
export function mergeLearning(prev, patch, at = new Date().toISOString()) {
  const base = prev || { step: 0, completedAt: null, quiz: null, notes: {}, startedAt: at };
  const next = { ...base, notes: { ...(base.notes || {}) }, updatedAt: at };
  if (patch.step !== undefined) next.step = Math.max(base.step || 0, patch.step);
  if (patch.completed === true && !base.completedAt) next.completedAt = at;
  if (patch.completed === false) next.completedAt = null;
  if (patch.quiz !== undefined) next.quiz = patch.quiz;
  for (const k of PRIVATE_LEARNING_KEYS) {
    if (patch[k] === undefined) continue;
    if (patch[k] === null || patch[k] === '' || (Array.isArray(patch[k]) && !patch[k].length)) delete next.notes[k];
    else next.notes[k] = patch[k];
  }
  return next;
}

/* ---------- gentle day counts ---------- */
const dayNum = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
/**
 * Day counts for one goal, from its logs. Never negative, never reset to zero by a lapse.
 * Days are inclusive of the start date (start today = day 1).
 */
export function goalStats(goal, logs, today = brisbaneToday()) {
  const start = validDate(goal.startDate) ? goal.startDate : today;
  const daysOnPath = Math.max(0, dayNum(today) - dayNum(start) + 1);
  const mine = logs.filter((l) => l.goalId === goal.id && l.date >= start && l.date <= today);
  const lapseDates = [...new Set(mine.filter((l) => l.kind === 'lapse').map((l) => l.date))].sort();
  const daysToPlan = Math.max(0, daysOnPath - lapseDates.length);
  const last = lapseDates.length ? lapseDates[lapseDates.length - 1] : null;
  const sinceLastLapse = last ? Math.max(0, dayNum(today) - dayNum(last)) : null;
  const cravings = mine.filter((l) => l.kind === 'craving');
  const reached = MILESTONES.filter((m) => daysToPlan >= m);
  const next = MILESTONES.find((m) => daysToPlan < m) || null;
  return {
    daysOnPath, daysToPlan, lapseDays: lapseDates.length, lastLapse: last, sinceLastLapse,
    cravingsLogged: cravings.length, cravingsPassed: cravings.filter((c) => c.outcome === 'passed').length,
    milestones: { reached, next, toNext: next ? next - daysToPlan : null },
  };
}

/** Plus: descriptive trends over the last N days. Describes what was logged; it does not assess anyone. */
export function recoveryInsights(goals, logs, { days = 30, today = brisbaneToday() } = {}) {
  const from = new Date((dayNum(today) - (days - 1)) * 86400000).toISOString().slice(0, 10);
  const inRange = logs.filter((l) => l.date >= from && l.date <= today);
  const cravings = inRange.filter((l) => l.kind === 'craving');
  const lapses = inRange.filter((l) => l.kind === 'lapse');
  const weeks = [];
  for (let w = Math.ceil(days / 7) - 1; w >= 0; w--) {
    const end = new Date((dayNum(today) - w * 7) * 86400000).toISOString().slice(0, 10);
    const startW = new Date((dayNum(end) - 6) * 86400000).toISOString().slice(0, 10);
    const c = cravings.filter((l) => l.date >= startW && l.date <= end);
    const strengths = c.map((x) => x.intensity).filter((n) => Number.isInteger(n));
    weeks.push({
      from: startW, to: end, cravings: c.length, lapses: lapses.filter((l) => l.date >= startW && l.date <= end).length,
      averageStrength: strengths.length ? Math.round((strengths.reduce((a, b) => a + b, 0) / strengths.length) * 10) / 10 : null,
    });
  }
  const triggerCount = {};
  for (const l of inRange) for (const t of l.triggers || []) triggerCount[t] = (triggerCount[t] || 0) + 1;
  const topTriggers = Object.entries(triggerCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count }));
  const passed = cravings.filter((c) => c.outcome === 'passed').length;
  const lines = [];
  if (!inRange.length) lines.push(`Nothing logged in the last ${days} days. Logging a craving takes about a minute whenever it helps.`);
  else {
    lines.push(`You logged ${cravings.length} ${cravings.length === 1 ? 'craving' : 'cravings'} in the last ${days} days.`);
    if (passed) lines.push(`You noted that ${passed} of them passed without using.`);
    if (topTriggers.length) lines.push(`What came up most: ${topTriggers.slice(0, 3).map((t) => `${t.name} (${t.count})`).join(', ')}.`);
    if (lapses.length) lines.push(`You logged ${lapses.length} ${lapses.length === 1 ? 'lapse' : 'lapses'}. Each one is information, not a verdict.`);
  }
  return {
    days, from, to: today, cravings: cravings.length, cravingsPassed: passed, lapses: lapses.length, weeks, topTriggers, lines,
    goals: goals.filter((g) => g.status !== 'archived').map((g) => ({ id: g.id, label: g.label, kind: g.kind, ...goalStats(g, logs, today) })),
    note: 'This describes what you logged. It is not an assessment or a diagnosis. A GP, counsellor or AOD worker can help you make sense of it.',
  };
}
