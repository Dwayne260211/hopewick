/**
 * Hopewick 2.0 Stage 5: personal preferences and the optional faith layer.
 *
 * Preferences belong to one profile on one account. Every field is optional and
 * chosen by the person. Hopewick never infers a focus area, a faith or any other
 * sensitive trait: only what is saved here is used, and only on the server.
 *
 * The faith layer is strictly OFF by default. It turns on only when the person
 * switches it on (faithOptIn === true). When it is off the server sends no faith
 * content anywhere: no reflections, no faith modules, and Hope is told to keep
 * everything secular.
 */
import { ValidationError } from './validate.js';

export const FOCUS_AREAS = Object.freeze(['mood', 'anxiety', 'aod', 'sleep']);
export const FOCUS_LABELS = Object.freeze({ mood: 'mood', anxiety: 'anxiety and worry', aod: 'alcohol and other drug recovery', sleep: 'sleep' });
export const TONES = Object.freeze(['gentle', 'direct']);
/** Traditions Hope already knows (server/hope-prompts.js FAITH_TEXT), minus "none". */
export const FAITH_TRADITIONS = Object.freeze(['christian', 'catholic', 'general', 'islamic', 'jewish', 'buddhist', 'hindu', 'sikh', 'indigenous']);
/** The Stage 5 faith content (scripture reflections, prayers, faith modules) is Christian. */
export const CHRISTIAN_TRADITIONS = Object.freeze(['christian', 'catholic']);
export const PREFERRED_NAME_MAX = 40;

export function defaultPreferences() {
  return { preferredName: '', focusAreas: [], tone: 'gentle', faithOptIn: false, faithTradition: 'christian', onboardedAt: null, updatedAt: null };
}

function oneLine(value, max, field) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text.`, field);
  const t = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > max) throw new ValidationError(`Keep ${field} to ${max} characters.`, field);
  return t;
}

/** A partial update. Unknown keys are ignored; wrong types are a 400. */
export function normalizePreferencesPatch(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  if (src.preferredName !== undefined) out.preferredName = oneLine(src.preferredName, PREFERRED_NAME_MAX, 'preferredName');
  if (src.focusAreas !== undefined) {
    if (!Array.isArray(src.focusAreas)) throw new ValidationError('focusAreas must be a list.', 'focusAreas');
    for (const f of src.focusAreas) if (!FOCUS_AREAS.includes(f)) throw new ValidationError(`Choose focus areas from: ${FOCUS_AREAS.join(', ')}.`, 'focusAreas');
    out.focusAreas = FOCUS_AREAS.filter((f) => src.focusAreas.includes(f));
  }
  if (src.tone !== undefined) {
    if (!TONES.includes(src.tone)) throw new ValidationError('tone must be gentle or direct.', 'tone');
    out.tone = src.tone;
  }
  if (src.faithOptIn !== undefined) {
    if (typeof src.faithOptIn !== 'boolean') throw new ValidationError('faithOptIn must be true or false.', 'faithOptIn');
    out.faithOptIn = src.faithOptIn;
  }
  if (src.faithTradition !== undefined) {
    if (!FAITH_TRADITIONS.includes(src.faithTradition)) throw new ValidationError('That faith tradition is not one Hopewick offers.', 'faithTradition');
    out.faithTradition = src.faithTradition;
  }
  if (src.onboarded !== undefined) {
    if (typeof src.onboarded !== 'boolean') throw new ValidationError('onboarded must be true or false.', 'onboarded');
    out.onboarded = src.onboarded;
  }
  return out;
}

/** Apply a validated patch to stored preferences. */
export function mergePreferences(prev, patch, now = new Date()) {
  const base = { ...defaultPreferences(), ...(prev || {}) };
  const next = { ...base };
  for (const k of ['preferredName', 'focusAreas', 'tone', 'faithOptIn', 'faithTradition']) if (patch[k] !== undefined) next[k] = patch[k];
  if (patch.onboarded === true && !next.onboardedAt) next.onboardedAt = now.toISOString();
  if (patch.onboarded === false) next.onboardedAt = null;
  next.updatedAt = now.toISOString();
  return next;
}

/** Stored -> clean shape (tolerates older or partial rows). */
export function readPreferences(stored) {
  const d = defaultPreferences();
  if (!stored || typeof stored !== 'object') return d;
  return {
    preferredName: typeof stored.preferredName === 'string' ? stored.preferredName.slice(0, PREFERRED_NAME_MAX) : '',
    focusAreas: Array.isArray(stored.focusAreas) ? FOCUS_AREAS.filter((f) => stored.focusAreas.includes(f)) : [],
    tone: TONES.includes(stored.tone) ? stored.tone : d.tone,
    faithOptIn: stored.faithOptIn === true,
    faithTradition: FAITH_TRADITIONS.includes(stored.faithTradition) ? stored.faithTradition : d.faithTradition,
    onboardedAt: stored.onboardedAt || null,
    updatedAt: stored.updatedAt || null,
  };
}

/** True only when the person switched faith content on. */
export function faithOn(prefs) {
  return !!(prefs && prefs.faithOptIn === true);
}
/** The Christian faith layer (scripture reflections, prayers, faith modules). */
export function christianLayerOn(prefs) {
  return faithOn(prefs) && CHRISTIAN_TRADITIONS.includes(prefs.faithTradition);
}

/* ---------- Faith reflections (server/library/faith-content.json) ---------- */
export const FAITH_CONTEXTS = Object.freeze(['home', 'checkin', 'coping', 'journal']);

export function normalizeFaithContent(doc) {
  if (!doc || !Array.isArray(doc.items)) throw new Error('faith-content.json needs an items list.');
  const ids = new Set();
  return doc.items.map((it, i) => {
    const where = `faith item ${i + 1}`;
    if (!/^[a-z0-9-]{3,60}$/.test(String(it.id || ''))) throw new Error(`${where}: bad id`);
    if (ids.has(it.id)) throw new Error(`${where}: duplicate id ${it.id}`);
    ids.add(it.id);
    if (!Array.isArray(it.contexts) || !it.contexts.length || it.contexts.some((c) => !FAITH_CONTEXTS.includes(c))) throw new Error(`${where}: contexts`);
    const sc = it.scripture || {};
    if (!sc.ref || !sc.text || !['WEB', 'KJV'].includes(sc.translation)) throw new Error(`${where}: scripture needs ref, text and a public-domain translation (WEB or KJV)`);
    for (const f of ['title', 'reflection', 'prayer']) if (typeof it[f] !== 'string' || !it[f].trim()) throw new Error(`${where}: ${f}`);
    if (it.reflection.length > 700 || it.prayer.length > 400) throw new Error(`${where}: keep it short`);
    return { id: it.id, title: it.title, contexts: it.contexts, scripture: { ref: sc.ref, text: sc.text, translation: sc.translation }, reflection: it.reflection, prayer: it.prayer, review: 'pending' };
  });
}

/** Same item all day for everyone (Brisbane date), different across days. */
export function pickForDay(items, isoDay) {
  if (!items.length) return null;
  const n = [...String(isoDay)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return items[n % items.length];
}
