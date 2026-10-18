/**
 * Hopewick 2.0 Stage 4: learning modules (education pathways).
 *
 * Module text lives in server/library/learning-modules.json (never served as a
 * static file). When each module opens, and for whom, is set by the content
 * release schedule (content-releases.json, kind "module"). A free account only
 * receives the title and teaser of a module it cannot open yet.
 *
 * Every module is original Hopewick wording, general information only, and is
 * marked "pending clinical review" until a qualified clinician signs it off.
 * See docs/CONTENT-SOURCES.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPING_TOOLS } from './wellbeing/validate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MODULES_PATH = path.join(HERE, 'library', 'learning-modules.json');
export const STEP_TYPES = Object.freeze(['cards', 'quiz', 'reflect', 'try', 'defusion', 'timer', 'values', 'thought-record']);
export const REVIEW_STATUS = 'pending';
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function checkStep(st, where) {
  if (!st || typeof st !== 'object') throw new Error(`${where} is not an object.`);
  if (!STEP_TYPES.includes(st.type)) throw new Error(`${where}: type must be one of ${STEP_TYPES.join(', ')}.`);
  if (!str(st.title, 120)) throw new Error(`${where}: title is required.`);
  switch (st.type) {
    case 'cards':
      if (!Array.isArray(st.cards) || st.cards.length < 2 || st.cards.length > 8) throw new Error(`${where}: cards needs 2 to 8 cards.`);
      st.cards.forEach((c, i) => { if (!str(c.title, 80) || !str(c.body, 600)) throw new Error(`${where} card ${i + 1}: title and body are required.`); });
      break;
    case 'quiz':
      if (!Array.isArray(st.questions) || st.questions.length < 2 || st.questions.length > 3) throw new Error(`${where}: a quiz has 2 or 3 questions.`);
      st.questions.forEach((q, i) => {
        const w = `${where} question ${i + 1}`;
        if (!str(q.q, 300) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) throw new Error(`${w}: needs q and 2 to 4 options.`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) throw new Error(`${w}: answer must point at an option.`);
        if (!str(q.right, 300) || !str(q.wrong, 300)) throw new Error(`${w}: needs kind "right" and "wrong" feedback.`);
      });
      break;
    case 'reflect':
      if (!str(st.prompt, 300)) throw new Error(`${where}: prompt is required.`);
      break;
    case 'try':
      if (!st.step || !str(st.step.title, 140)) throw new Error(`${where}: step.title is required.`);
      if (st.step.detail != null && !str(st.step.detail, 1000)) throw new Error(`${where}: step.detail is too long.`);
      if (st.step.copingKey != null && !Object.prototype.hasOwnProperty.call(COPING_TOOLS, st.step.copingKey)) throw new Error(`${where}: copingKey is not in COPING_TOOLS.`);
      break;
    case 'defusion':
      if (!str(st.intro, 400) || !str(st.prompt, 120)) throw new Error(`${where}: intro and prompt are required.`);
      break;
    case 'timer':
      if (!Array.isArray(st.phases) || st.phases.length < 1 || st.phases.length > 8) throw new Error(`${where}: timer needs 1 to 8 phases.`);
      st.phases.forEach((p, i) => { if (!str(p.label, 40) || !str(p.text, 300) || !Number.isInteger(p.seconds) || p.seconds < 2 || p.seconds > 60) throw new Error(`${where} phase ${i + 1}: label, text and 2 to 60 seconds are required.`); });
      if (!Number.isInteger(st.repeat) || st.repeat < 1 || st.repeat > 12) throw new Error(`${where}: repeat must be 1 to 12.`);
      if (st.phases.reduce((a, p) => a + p.seconds, 0) * st.repeat > 180) throw new Error(`${where}: keep a timer under 3 minutes.`);
      break;
    case 'values':
      if (!Array.isArray(st.items) || st.items.length < 4 || st.items.length > 20 || !st.items.every((x) => str(x, 40))) throw new Error(`${where}: values needs 4 to 20 short items.`);
      if (st.bins != null && !(Array.isArray(st.bins) && st.bins.length === 3 && st.bins.every((x) => str(x, 30)))) throw new Error(`${where}: bins must be 3 short labels.`);
      if (st.saveAs != null && st.saveAs !== 'values') throw new Error(`${where}: saveAs can only be "values".`);
      break;
    case 'thought-record':
      if (!str(st.intro, 400)) throw new Error(`${where}: intro is required.`);
      break;
    default:
  }
}

/** Validates every module. Throws with a clear message so a bad edit fails tests and startup, not users. */
export function normalizeModules(doc) {
  if (!doc || !Array.isArray(doc.modules)) throw new Error('learning-modules.json needs a "modules" list.');
  const out = {};
  doc.modules.forEach((m, i) => {
    const where = `learning-modules.json module ${i + 1}${m && m.id ? ` (${m.id})` : ''}`;
    if (!m || !ID_RE.test(String(m.id || ''))) throw new Error(`${where}: id must be lowercase letters, numbers and dashes.`);
    if (out[m.id]) throw new Error(`${where}: id is used twice.`);
    if (!str(m.title, 120) || !str(m.summary, 280) || !str(m.topic, 40)) throw new Error(`${where}: title, summary and topic are required.`);
    if (!Number.isInteger(m.minutes) || m.minutes < 2 || m.minutes > 8) throw new Error(`${where}: modules are short: minutes must be 2 to 8.`);
    if (!Array.isArray(m.steps) || m.steps.length < 3 || m.steps.length > 8) throw new Error(`${where}: a module has 3 to 8 steps.`);
    m.steps.forEach((st, j) => checkStep(st, `${where} step ${j + 1}`));
    if (!m.steps.some((s) => s.type === 'try')) throw new Error(`${where}: every module ends with one practical "try this today" step.`);
    if (!Array.isArray(m.sources) || !m.sources.length) throw new Error(`${where}: list at least one source.`);
    m.sources.forEach((s, j) => {
      if (!str(s.org, 120) || !str(s.title, 200)) throw new Error(`${where} source ${j + 1}: org and title are required.`);
      if (s.url != null && !/^https:\/\/[^\s"<>]+$/.test(s.url)) throw new Error(`${where} source ${j + 1}: url must be https.`);
    });
    out[m.id] = {
      id: m.id, title: m.title, summary: m.summary, topic: m.topic, minutes: m.minutes, approach: m.approach || null,
      review: REVIEW_STATUS, note: m.note || null, steps: m.steps, sources: m.sources,
    };
  });
  return out;
}

export function loadModules(file = process.env.HOPEWICK_MODULES_PATH || MODULES_PATH) {
  return normalizeModules(JSON.parse(fs.readFileSync(file, 'utf8')));
}
