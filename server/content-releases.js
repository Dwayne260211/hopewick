/**
 * Content release schedule (Hopewick Plus early access).
 *
 * Every item in server/library/content-releases.json has a plusReleaseDate and
 * a freeReleaseDate. Plus accounts see an item from its Plus date; free
 * accounts from its free date. The free date defaults to the Plus date plus
 * 6 months and may be set anywhere from 6 to 12 months after it. Items marked
 * "core" are part of the always-free launch set (for example the 12 coping
 * tools) and are free from day one.
 *
 * The file lives under server/ so it is never served as a static file: a free
 * account only ever receives the title and teaser of an item it cannot open
 * yet, and nobody receives anything about an item before its Plus date.
 * See docs/CONTENT-RELEASES.md for how to add a weekly Plus drop.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brisbaneToday, validDate, COPING_TOOLS } from './wellbeing/validate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RELEASES_PATH = path.join(HERE, 'library', 'content-releases.json');
export const DEFAULT_FREE_DELAY_MONTHS = 6;
export const MIN_FREE_DELAY_MONTHS = 6;
export const MAX_FREE_DELAY_MONTHS = 12;
/** "New for Plus this week": within this many days of the Plus date. */
export const NEW_FOR_PLUS_DAYS = 7;
export const RELEASE_KINDS = Object.freeze(['coping', 'journal-pack']);
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Calendar months after an ISO date, clamped to the end of a short month (31 Aug + 6 = 28/29 Feb). */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export function monthLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Validates the whole schedule. Throws with a clear message naming the item, so a bad edit fails tests and startup, not users. */
export function normalizeReleases(doc) {
  if (!doc || !Array.isArray(doc.items)) throw new Error('content-releases.json needs an "items" list.');
  const seen = new Set();
  return doc.items.map((raw, i) => {
    const where = `content-releases.json item ${i + 1}${raw && raw.id ? ` (${raw.id})` : ''}`;
    if (!raw || typeof raw !== 'object') throw new Error(`${where} is not an object.`);
    const { id, kind, key, title, teaser } = raw;
    if (!ID_RE.test(String(id || ''))) throw new Error(`${where}: id must be lowercase letters, numbers and dashes.`);
    if (seen.has(id)) throw new Error(`${where}: id is used twice.`);
    seen.add(id);
    if (!RELEASE_KINDS.includes(kind)) throw new Error(`${where}: kind must be one of ${RELEASE_KINDS.join(', ')}.`);
    if (kind === 'coping' && !Object.prototype.hasOwnProperty.call(COPING_TOOLS, key)) throw new Error(`${where}: coping key "${key}" is not in COPING_TOOLS (server/wellbeing/validate.js).`);
    if (!title || typeof title !== 'string' || title.length > 120) throw new Error(`${where}: title is required (up to 120 characters).`);
    if (!teaser || typeof teaser !== 'string' || teaser.length > 280) throw new Error(`${where}: teaser is required (up to 280 characters).`);
    if (!validDate(raw.plusReleaseDate)) throw new Error(`${where}: plusReleaseDate must be YYYY-MM-DD.`);
    const core = raw.core === true;
    let freeReleaseDate;
    if (core) {
      freeReleaseDate = raw.plusReleaseDate;
      if (raw.freeReleaseDate && raw.freeReleaseDate !== raw.plusReleaseDate) throw new Error(`${where}: a core (always free) item is free from its first day.`);
    } else {
      freeReleaseDate = raw.freeReleaseDate || addMonths(raw.plusReleaseDate, DEFAULT_FREE_DELAY_MONTHS);
      if (!validDate(freeReleaseDate)) throw new Error(`${where}: freeReleaseDate must be YYYY-MM-DD.`);
      const min = addMonths(raw.plusReleaseDate, MIN_FREE_DELAY_MONTHS);
      const max = addMonths(raw.plusReleaseDate, MAX_FREE_DELAY_MONTHS);
      if (freeReleaseDate < min || freeReleaseDate > max) {
        throw new Error(`${where}: freeReleaseDate must be 6 to 12 months after the Plus date (${min} to ${max}).`);
      }
    }
    if (!core && (!raw.content || typeof raw.content !== 'object')) throw new Error(`${where}: content is required.`);
    if (kind === 'journal-pack' && raw.content && !(Array.isArray(raw.content.prompts) && raw.content.prompts.length)) throw new Error(`${where}: a journal pack needs content.prompts.`);
    if (kind === 'coping' && raw.content && !(Array.isArray(raw.content.steps) && raw.content.steps.length >= 2)) throw new Error(`${where}: a coping tool needs at least two steps.`);
    return { id, kind, key: key || id, title, teaser, plusReleaseDate: raw.plusReleaseDate, freeReleaseDate, core, content: raw.content || null };
  });
}

export function loadReleases(file = process.env.HOPEWICK_RELEASES_PATH || RELEASES_PATH) {
  return normalizeReleases(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** Where an item stands for one account on one day. */
export function statusFor(item, { plus = false, today = brisbaneToday() } = {}) {
  const plusOpen = today >= item.plusReleaseDate;
  const freeOpen = today >= item.freeReleaseDate;
  const available = plus ? plusOpen : freeOpen;
  return {
    visible: plusOpen, // nobody hears about an item before its Plus date
    available,
    plusOnly: plusOpen && !freeOpen,
    newForPlus: !item.core && plusOpen && daysBetween(item.plusReleaseDate, today) < NEW_FOR_PLUS_DAYS,
    comingToFree: !item.core && plusOpen && !freeOpen ? monthLabel(item.freeReleaseDate) : null,
  };
}

/** What the API returns for one item. Locked items carry only a title and teaser. */
export function publicItem(item, opts) {
  const s = statusFor(item, opts);
  if (!s.visible) return null;
  const out = {
    id: item.id, kind: item.kind, key: item.key, title: item.title, teaser: item.teaser,
    core: item.core, available: s.available, plusOnly: s.plusOnly,
    badges: { newForPlus: s.newForPlus, comingToFree: s.comingToFree },
  };
  if (!item.core) out.freeReleaseDate = item.freeReleaseDate;
  if (s.available && item.content) out.content = item.content;
  return out;
}

export function createReleaseCatalog({ file, items } = {}) {
  let cache = items ? normalizeReleases({ items }) : null;
  const all = () => {
    if (!cache) cache = loadReleases(file);
    return cache;
  };
  return {
    all,
    list(opts) { return all().map((it) => publicItem(it, opts)).filter(Boolean); },
    find(id) { return all().find((it) => it.id === id) || null; },
    /** For server gates: can this account use a coping tool / journal pack? Tools not in the schedule are core. */
    allows(kind, key, opts) {
      const it = all().find((x) => x.kind === kind && x.key === key);
      if (!it) return kind === 'coping';
      return statusFor(it, opts).available;
    },
  };
}
