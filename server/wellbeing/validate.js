/**
 * Hopewick 2.0 Stage 3: validation for per-user wellbeing data.
 *
 * Shared by both storage backends (JSON fallback and Postgres), so the same
 * rules apply wherever the data lives. Every function returns a clean object
 * or throws a ValidationError (HTTP 400). Nothing here trusts the browser.
 */
import crypto from 'node:crypto';

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = 'invalid';
    if (field) this.field = field;
  }
}
export class NotFoundError extends Error {
  constructor(message = 'That item was not found.') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
    this.code = 'not_found';
  }
}

export const LIMITS = Object.freeze({
  feelings: 1000,
  notes: 2000,
  trigger: 40,
  triggers: 12,
  goalTitle: 120,
  goalDetail: 1000,
  journalTitle: 120,
  journalBody: 20000,
  journalRefined: 20000,
  journalEmotions: 500,
  journalPrompt: 300,
  journalEntries: 1000,
  stepTitle: 140,
  stepDetail: 1000,
  stepReflection: 1000,
  activityNote: 1000,
  activities: 500,
  goals: 200,
  nextSteps: 200,
  checkinDays: 800,
  plansBytes: 100000,
  importItems: 300,
  packId: 64,
  weeklyPlans: 60,
  weeklyTitle: 120,
  weeklySteps: 10,
  weeklyStepTitle: 140,
  safetyItem: 300,
  safetyItems: 10,
});
export const WEEKLY_STATUS = Object.freeze(['active', 'done', 'archived']);

/** 5-point scale from the mockup. Score is the position (1 = Struggling). */
export const MOOD_SCALE = Object.freeze([
  { score: 1, label: 'Struggling' },
  { score: 2, label: 'Low' },
  { score: 3, label: 'Okay' },
  { score: 4, label: 'Good' },
  { score: 5, label: 'Great' },
]);
/** Older check-ins (checkins.json) used six labels. Kept as written; this is only for the trend line. */
export const LEGACY_MOOD_SCORE = Object.freeze({ Great: 5, Good: 4, Okay: 3, Tired: 3, Low: 2, Stressed: 2, Struggling: 1 });
export const CRAVINGS = Object.freeze(['None', 'Mild', 'Moderate', 'Strong']);
export const GOAL_CATEGORIES = Object.freeze(['wellbeing', 'recovery', 'emotional', 'other']);
export const GOAL_STATUS = Object.freeze(['active', 'completed', 'archived']);
export const JOURNAL_KINDS = Object.freeze(['free', 'prompt', 'gratitude', 'recovery']);
export const STEP_STATUS = Object.freeze(['open', 'done', 'dismissed']);
export const ACTIVITY_STATUS = Object.freeze(['started', 'paused', 'completed']);
export const HELPFUL = Object.freeze({ no: 1, somewhat: 3, yes: 5 });

/**
 * Coping toolkit keys -> activity_type in guided_activity_history.
 * Must match app/data/coping-tools.js (tests/stage3-content.test.mjs checks it).
 */
export const COPING_TOOLS = Object.freeze({
  'breathing-box': 'breathing',
  'breathing-calm': 'breathing',
  'grounding-54321': 'grounding',
  'urge-surfing': 'urge_surfing',
  'muscle-relaxation': 'muscle_relaxation',
  'mindful-minute': 'mindfulness',
  'thought-reframe': 'thought_reframe',
  'name-it': 'emotion_regulation',
  'tipp': 'distress_tolerance',
  'stop-skill': 'distress_tolerance',
  'relapse-check': 'relapse_prevention',
  'stress-reset': 'stress_management',
  // Released through server/library/content-releases.json (Plus first, then free).
  'self-compassion': 'mindfulness',
});

/** Settings keys -> consent_preferences keys (Postgres) and their defaults. */
export const SETTINGS = Object.freeze({
  shareCheckinsWithHope: { consentKey: 'checkin_ai_share', kind: 'bool', default: false },
  journalAiAlways: { consentKey: 'journal_ai', kind: 'bool', default: false },
  nextStepFollowUps: { consentKey: 'next_step_followup', kind: 'bool', default: false },
  journalImport: { consentKey: 'journal_sync', kind: 'import', default: 'pending' },
  plansImport: { consentKey: 'safety_plan_sync', kind: 'import', default: 'pending' },
});
export const POLICY_VERSION = 'stage3-2026-10';

const PROFILE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newId() {
  return crypto.randomUUID();
}
export function isId(value) {
  return typeof value === 'string' && (UUID_RE.test(value) || ID_RE.test(value));
}
export function assertId(value, what = 'item') {
  if (!isId(value)) throw new ValidationError(`That ${what} id is not valid.`, 'id');
  return value;
}
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function profileOf(value) {
  const id = value == null || value === '' ? 'main' : String(value);
  if (!PROFILE_RE.test(id)) throw new ValidationError('Choose a profile first.', 'profileId');
  return id;
}

export function validDate(iso) {
  const m = DATE_RE.exec(String(iso || ''));
  if (!m) return false;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
export function assertDate(iso, field = 'date') {
  if (!validDate(iso)) throw new ValidationError('Use a real date (YYYY-MM-DD).', field);
  return String(iso);
}

/** Today in Australia/Brisbane as YYYY-MM-DD. */
export function brisbaneToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}
/** Allow a day of slack for people in other Australian time zones. */
export function assertNotFuture(iso, now = new Date()) {
  const limit = new Date(now.getTime() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (iso > limit) throw new ValidationError('That date is in the future.', 'date');
  return iso;
}

/** Strip control characters (keep newlines and tabs in long text), trim, cap. */
export function cleanText(value, max, { multiline = false, field = 'text', required = false } = {}) {
  if (value == null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') throw new ValidationError(`${field} must be text.`, field);
  let text = String(value);
  text = multiline ? text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n') : text.replace(/[\u0000-\u001f\u007f]/g, ' ');
  text = text.trim();
  if (required && !text) throw new ValidationError(`${field} is required.`, field);
  if (text.length > max) throw new ValidationError(`${field} is longer than ${max} characters.`, field);
  return text;
}
function optText(value, max, opts) {
  const t = cleanText(value, max, opts);
  return t || null;
}
function pick(value, allowed, field, fallback) {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`${field} is required.`, field);
  }
  if (!allowed.includes(value)) throw new ValidationError(`${field} is not one of the allowed values.`, field);
  return value;
}
function intIn(value, min, max, field, { nullable = true } = {}) {
  if (value == null || value === '') {
    if (nullable) return null;
    throw new ValidationError(`${field} is required.`, field);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${field} must be a whole number from ${min} to ${max}.`, field);
  return n;
}
function bool(value) {
  return value === true;
}

/* ---------- check-in ---------- */
export function normalizeCheckin(raw, { date } = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const day = assertNotFuture(assertDate(date || src.date));
  const mood = intIn(src.mood, 1, 5, 'mood', { nullable: false });
  let triggers = [];
  if (src.triggers != null) {
    if (!Array.isArray(src.triggers)) throw new ValidationError('triggers must be a list.', 'triggers');
    const seen = new Set();
    for (const t of src.triggers) {
      const item = cleanText(t, LIMITS.trigger, { field: 'trigger' });
      const key = item.toLowerCase();
      if (item && !seen.has(key)) { seen.add(key); triggers.push(item); }
    }
    if (triggers.length > LIMITS.triggers) throw new ValidationError(`Choose up to ${LIMITS.triggers} triggers.`, 'triggers');
  }
  const craving = src.craving == null || src.craving === '' ? null : pick(src.craving, CRAVINGS, 'craving');
  return {
    date: day,
    mood,
    moodLabel: MOOD_SCALE[mood - 1].label,
    feelings: cleanText(src.feelings, LIMITS.feelings, { multiline: true, field: 'feelings' }),
    triggers,
    intensity: intIn(src.intensity, 0, 10, 'intensity'),
    craving,
    notes: cleanText(src.notes, LIMITS.notes, { multiline: true, field: 'notes' }),
  };
}

/* ---------- coping activity ---------- */
export function normalizeActivityStart(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toolKey = String(src.toolKey || '');
  if (!Object.prototype.hasOwnProperty.call(COPING_TOOLS, toolKey)) throw new ValidationError('That coping tool is not in the toolkit.', 'toolKey');
  return { toolKey, toolType: COPING_TOOLS[toolKey], status: 'started', stepIndex: intIn(src.stepIndex, 0, 100, 'stepIndex') ?? 0 };
}
export function normalizeActivityPatch(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (src.status != null) out.status = pick(src.status, ACTIVITY_STATUS, 'status');
  if (src.stepIndex != null) out.stepIndex = intIn(src.stepIndex, 0, 100, 'stepIndex');
  if (src.durationSeconds != null) out.durationSeconds = intIn(src.durationSeconds, 0, 86400, 'durationSeconds');
  if (src.helpful !== undefined) out.helpful = src.helpful == null || src.helpful === '' ? null : pick(src.helpful, Object.keys(HELPFUL), 'helpful');
  if (src.note !== undefined) out.note = cleanText(src.note, LIMITS.activityNote, { multiline: true, field: 'note' });
  return out;
}

/* ---------- personal goals ---------- */
export function normalizeGoal(raw, { partial = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (!partial || src.title !== undefined) out.title = cleanText(src.title, LIMITS.goalTitle, { field: 'title', required: true });
  if (!partial || src.detail !== undefined) out.detail = cleanText(src.detail, LIMITS.goalDetail, { multiline: true, field: 'detail' });
  if (!partial || src.category !== undefined) out.category = pick(src.category, GOAL_CATEGORIES, 'category', partial ? undefined : 'wellbeing');
  if (src.status !== undefined) out.status = pick(src.status, GOAL_STATUS, 'status');
  else if (!partial) out.status = 'active';
  if (!partial || src.progress !== undefined) out.progress = intIn(src.progress, 0, 100, 'progress') ?? 0;
  return out;
}

/* ---------- journal ---------- */
export function normalizeJournal(raw, { partial = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (!partial || src.body !== undefined) out.body = cleanText(src.body, LIMITS.journalBody, { multiline: true, field: 'body', required: true });
  if (!partial || src.title !== undefined) out.title = cleanText(src.title, LIMITS.journalTitle, { field: 'title' });
  if (!partial || src.kind !== undefined) out.kind = pick(src.kind, JOURNAL_KINDS, 'kind', 'free');
  if (!partial || src.prompt !== undefined) out.prompt = cleanText(src.prompt, LIMITS.journalPrompt, { field: 'prompt' });
  if (!partial || src.refined !== undefined) out.refined = cleanText(src.refined, LIMITS.journalRefined, { multiline: true, field: 'refined' });
  if (!partial || src.emotions !== undefined) out.emotions = cleanText(Array.isArray(src.emotions) ? src.emotions.join(', ') : src.emotions, LIMITS.journalEmotions, { field: 'emotions' });
  if (!partial || src.entryDate !== undefined) {
    out.entryDate = src.entryDate ? assertNotFuture(assertDate(src.entryDate, 'entryDate')) : (partial ? null : brisbaneToday());
  }
  if (!partial || src.packId !== undefined) {
    const pack = src.packId == null || src.packId === '' ? null : String(src.packId);
    if (pack && !/^[a-z0-9][a-z0-9-]{1,63}$/.test(pack)) throw new ValidationError('packId is not valid.', 'packId');
    out.packId = pack;
  }
  if (!partial && src.clientId != null && src.clientId !== '') {
    if (!ID_RE.test(String(src.clientId))) throw new ValidationError('clientId is not valid.', 'clientId');
    out.clientId = String(src.clientId);
  }
  return out;
}

/** An entry from the browser's old journal (localStorage) for the one-time import. */
export function normalizeLegacyJournal(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const created = Number(src.created) > 0 ? Number(src.created) : Date.now();
  const clientId = String(src.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (!clientId) throw new ValidationError('A journal entry without an id cannot be imported.', 'id');
  const body = cleanText(src.body, LIMITS.journalBody, { multiline: true, field: 'body' });
  if (!body) return null;
  return {
    clientId,
    title: cleanText(String(src.title || '').slice(0, LIMITS.journalTitle), LIMITS.journalTitle, { field: 'title' }),
    body,
    refined: cleanText(String(src.refined || '').slice(0, LIMITS.journalRefined), LIMITS.journalRefined, { multiline: true, field: 'refined' }),
    emotions: cleanText(String(src.emotions || '').slice(0, LIMITS.journalEmotions), LIMITS.journalEmotions, { field: 'emotions' }),
    kind: JOURNAL_KINDS.includes(src.kind) ? src.kind : 'free',
    prompt: cleanText(String(src.prompt || '').slice(0, LIMITS.journalPrompt), LIMITS.journalPrompt, { field: 'prompt' }),
    entryDate: validDate(src.entryDate) ? src.entryDate : brisbaneToday(new Date(created)),
    createdAt: new Date(Math.min(created, Date.now())).toISOString(),
    updatedAt: new Date(Math.min(Number(src.updated) > 0 ? Number(src.updated) : created, Date.now())).toISOString(),
  };
}

/* ---------- relapse and exit plans (the app's Plans, kept as one JSON document) ---------- */
export function normalizePlans(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Send the plans as an object.', 'plans');
  const keep = { relapse: raw.relapse, exits: raw.exits, custom: raw.custom };
  if (keep.relapse != null && (typeof keep.relapse !== 'object' || Array.isArray(keep.relapse))) throw new ValidationError('relapse must be an object.', 'relapse');
  if (keep.exits != null && (typeof keep.exits !== 'object' || Array.isArray(keep.exits))) throw new ValidationError('exits must be an object.', 'exits');
  if (keep.custom != null && !Array.isArray(keep.custom)) throw new ValidationError('custom must be a list.', 'custom');
  const text = JSON.stringify({ relapse: keep.relapse || null, exits: keep.exits || {}, custom: keep.custom || [] });
  if (Buffer.byteLength(text, 'utf8') > LIMITS.plansBytes) throw new ValidationError('Those plans are too long to save.', 'plans');
  if (/"(?:number|cvc|cvv|card|cardNumber)"\s*:/i.test(text)) throw new ValidationError('Card details are not stored here.', 'plans');
  return JSON.parse(text);
}

/* ---------- My Next Step ---------- */
export function normalizeStep(raw, { partial = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (!partial || src.title !== undefined) out.title = cleanText(src.title, LIMITS.stepTitle, { field: 'title', required: true });
  if (!partial || src.detail !== undefined) out.detail = cleanText(src.detail, LIMITS.stepDetail, { multiline: true, field: 'detail' });
  if (!partial || src.copingKey !== undefined) {
    const key = src.copingKey == null || src.copingKey === '' ? null : String(src.copingKey);
    if (key && !Object.prototype.hasOwnProperty.call(COPING_TOOLS, key)) throw new ValidationError('That coping tool is not in the toolkit.', 'copingKey');
    out.copingKey = key;
  }
  if (!partial) out.source = src.source === 'hope' ? 'hope' : 'user';
  if (src.status !== undefined) out.status = pick(src.status, STEP_STATUS, 'status');
  else if (!partial) out.status = 'open';
  if (src.reflection !== undefined) out.reflection = cleanText(src.reflection, LIMITS.stepReflection, { multiline: true, field: 'reflection' });
  if (src.followUpOptIn !== undefined) out.followUpOptIn = bool(src.followUpOptIn);
  else if (!partial) out.followUpOptIn = false;
  return out;
}

/* ---------- settings / consent ---------- */
export function defaultSettings() {
  const out = {};
  for (const [k, spec] of Object.entries(SETTINGS)) out[k] = spec.default;
  return out;
}
export function normalizeSettingsPatch(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [k, spec] of Object.entries(SETTINGS)) {
    if (src[k] === undefined) continue;
    if (spec.kind === 'bool') {
      if (typeof src[k] !== 'boolean') throw new ValidationError(`${k} must be true or false.`, k);
      out[k] = src[k];
    } else {
      out[k] = pick(src[k], ['pending', 'done', 'declined'], k);
    }
  }
  return out;
}

export { optText };

/* ---------- Weekly multi-step plans (My Next Step, Plus) ---------- */
function isSunday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}
/** Sunday that starts this Brisbane week (Sunday to Saturday, like SMART goals). */
export function brisbaneWeekStart(now = new Date()) {
  const today = brisbaneToday(now);
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}
export function normalizeWeeklyPlan(raw, { partial = false } = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  if (!partial || src.title !== undefined) out.title = cleanText(src.title, LIMITS.weeklyTitle, { field: 'title', required: true });
  if (!partial || src.weekStart !== undefined) {
    const w = src.weekStart ? assertDate(src.weekStart, 'weekStart') : brisbaneWeekStart();
    if (!isSunday(w)) throw new ValidationError('weekStart must be a Sunday (weeks run Sunday to Saturday).', 'weekStart');
    out.weekStart = w;
  }
  if (!partial || src.steps !== undefined) {
    const steps = src.steps == null ? [] : src.steps;
    if (!Array.isArray(steps)) throw new ValidationError('steps must be a list.', 'steps');
    if (steps.length > LIMITS.weeklySteps) throw new ValidationError(`A weekly plan has up to ${LIMITS.weeklySteps} steps.`, 'steps');
    const seen = new Set();
    out.steps = steps.map((st, i) => {
      const s = st && typeof st === 'object' ? st : { title: st };
      let id = s.id == null || s.id === '' ? `s${i + 1}` : String(s.id);
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new ValidationError('A step id is not valid.', 'steps');
      if (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      return {
        id,
        title: cleanText(s.title, LIMITS.weeklyStepTitle, { field: 'step', required: true }),
        day: intIn(s.day, 0, 6, 'day'),
        done: bool(s.done),
      };
    });
    if (!partial && !out.steps.length) throw new ValidationError('Add at least one step.', 'steps');
  }
  if (src.status !== undefined) out.status = pick(src.status, WEEKLY_STATUS, 'status');
  return out;
}

/* ---------- Safety plan essentials (always free) ---------- */
export const SAFETY_FIELDS = Object.freeze(['warningSigns', 'copingThings', 'people', 'safePlaces', 'reasons']);
export function normalizeSafety(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const f of SAFETY_FIELDS) {
    const v = src[f] == null ? [] : src[f];
    if (!Array.isArray(v)) throw new ValidationError(`${f} must be a list.`, f);
    if (v.length > LIMITS.safetyItems) throw new ValidationError(`Keep up to ${LIMITS.safetyItems} items in each part.`, f);
    out[f] = v.map((x) => cleanText(x, LIMITS.safetyItem, { field: f })).filter(Boolean);
  }
  out.updatedAt = new Date().toISOString();
  return out;
}
