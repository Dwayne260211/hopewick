/**
 * Check-ins and weekly SMART goals for a signed-in account.
 * Separate from users.json so a check-in write does not rewrite password hashes.
 * Scoped by account id, then profile id. The browser keeps a copy too.
 * Goals stay free. This file is not a Plus gate.
 * Week is Sunday–Saturday. Halfway is Wednesday–Saturday in Australia/Brisbane.
 */
import fs from 'node:fs';
import path from 'node:path';

const MAX_PROFILES = 12;
export const MAX_MOOD_DAYS = 400;
export const MAX_GRATITUDE_DAYS = 400;
/** Recent Sunday–Saturday weeks. At least 12; 60 matches the device copy. */
export const MAX_GOAL_WEEKS = 60;
const MAX_TEXT = 240;
const MAX_GRAT_ITEM = 120;
const PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOODS = {
  Great: '😄',
  Good: '🙂',
  Okay: '😐',
  Low: '😔',
  Stressed: '😣',
  Tired: '😴',
};
const CRAVINGS = new Set(['None', 'Mild', 'Moderate', 'Strong']);
const MIDWEEK = new Set(['still', 'change', 'letgo']);
const GOAL_KEYS = ['specific', 'measurable', 'achievable', 'relevant', 'timebound'];
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function validProfileId(id) {
  return PROFILE_ID_RE.test(String(id || ''));
}

function clip(value, max) {
  const text = String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function validDate(iso) {
  const match = DATE_RE.exec(String(iso || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isSundayIso(iso) {
  if (!validDate(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}

export function addIsoDays(iso, days) {
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Calendar date in Australia/Brisbane. weekday 0 is Sunday. */
export function brisbaneCalendar(date) {
  const when = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(when);
  const get = (type) => parts.find((part) => part.type === type).value;
  const weekday = WEEKDAY_INDEX[get('weekday').slice(0, 3)];
  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    weekday,
  };
}

/**
 * Halfway through a Sunday–Saturday week is Wednesday in Brisbane,
 * and the check stays available through Saturday. Sunday–Tuesday are quiet.
 */
export function halfwayWindow(date = new Date()) {
  const cal = brisbaneCalendar(date);
  const sunday = addIsoDays(cal.iso, -cal.weekday);
  return {
    iso: cal.iso,
    weekday: cal.weekday,
    sunday,
    saturday: addIsoDays(sunday, 6),
    show: cal.weekday >= 3 && cal.weekday <= 6,
  };
}

function stamp(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return 0;
  const max = Date.now() + 5 * 60 * 1000;
  const clipped = time > max ? max : time;
  return Math.floor(clipped);
}

function entryTime(row) {
  if (!row) return 0;
  return stamp(row.updated) || stamp(row.ts) || 0;
}

export function normalizeMood(raw) {
  if (!raw || typeof raw !== 'object' || !validDate(raw.date)) return null;
  const mood = {};
  const label = clip(raw.mood && raw.mood.l, 24);
  if (MOODS[label]) mood.mood = { e: MOODS[label], l: label };
  else mood.mood = null;
  const craving = clip(raw.craving, 24);
  mood.craving = CRAVINGS.has(craving) ? craving : null;
  mood.date = raw.date;
  mood.updated = entryTime(raw);
  if (!mood.mood && !mood.craving && !mood.updated) return null;
  return mood;
}

export function normalizeGratitude(raw) {
  if (!raw || typeof raw !== 'object' || !validDate(raw.date)) return null;
  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => clip(item, MAX_GRAT_ITEM)).filter(Boolean).slice(0, 3)
    : [];
  const updated = entryTime(raw);
  if (!items.length && !updated) return null;
  return { date: raw.date, items, ts: updated, updated };
}

function normalizeOneGoal(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const goal = { done: src.done === true };
  for (const key of GOAL_KEYS) goal[key] = clip(src[key], MAX_TEXT);
  return goal;
}

function goalHasText(goal) {
  return GOAL_KEYS.some((key) => goal && goal[key]);
}

export function normalizeMidweek(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(src.answers) ? src.answers : [];
  const answers = [0, 1].map((index) => (MIDWEEK.has(list[index]) ? list[index] : ''));
  const updated = stamp(src.updated);
  if (!answers[0] && !answers[1] && !updated) return null;
  return { answers, updated };
}

export function normalizeWeek(key, raw) {
  if (!isSundayIso(key) || !raw || typeof raw !== 'object') return null;
  const list = Array.isArray(raw.goals) ? raw.goals : [];
  const week = {
    goals: [0, 1].map((index) => normalizeOneGoal(list[index])),
    updated: stamp(raw.updated),
  };
  const midweek = normalizeMidweek(raw.midweek);
  if (midweek) week.midweek = midweek;
  const meaningful = week.updated || midweek || week.goals.some(goalHasText);
  return meaningful ? week : null;
}

function preferRow(a, b) {
  const au = entryTime(a);
  const bu = entryTime(b);
  if (au !== bu) return bu > au ? b : a;
  return a;
}

function rowAlive(row, kind) {
  if (!row) return false;
  if (kind === 'mood') return !!(row.mood || row.craving);
  return Array.isArray(row.items) && row.items.length > 0;
}

/** Same calendar day: the later save wins. A later empty save clears the day. */
export function mergeByDate(localList, remoteList, kind) {
  const normalize = kind === 'mood' ? normalizeMood : normalizeGratitude;
  const map = new Map();
  const take = (list) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const row = normalize(raw);
      if (!row) continue;
      const prev = map.get(row.date);
      const winner = prev ? preferRow(prev, row) : row;
      if (!rowAlive(winner, kind)) map.delete(row.date);
      else map.set(row.date, winner);
    }
  };
  take(remoteList);
  take(localList);
  const cap = kind === 'mood' ? MAX_MOOD_DAYS : MAX_GRATITUDE_DAYS;
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-cap);
}

function preferMidweek(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return (Number(b.updated) || 0) >= (Number(a.updated) || 0) ? b : a;
}

function mergeWeek(remote, local) {
  if (!remote) return local;
  if (!local) return remote;
  const winner = (Number(local.updated) || 0) >= (Number(remote.updated) || 0) ? local : remote;
  const midweek = preferMidweek(remote.midweek, local.midweek);
  const week = {
    goals: winner.goals,
    updated: Math.max(Number(remote.updated) || 0, Number(local.updated) || 0),
  };
  if (midweek) week.midweek = midweek;
  return week;
}

export function mergeWeeks(localWeeks, remoteWeeks) {
  const local = localWeeks && typeof localWeeks === 'object' ? localWeeks : {};
  const remote = remoteWeeks && typeof remoteWeeks === 'object' ? remoteWeeks : {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const merged = {};
  for (const key of keys) {
    const week = mergeWeek(normalizeWeek(key, remote[key]), normalizeWeek(key, local[key]));
    if (week) merged[key] = week;
  }
  const sorted = Object.keys(merged).sort();
  const keep = sorted.slice(-MAX_GOAL_WEEKS);
  return Object.fromEntries(keep.map((key) => [key, merged[key]]));
}

function fresh(row, clearedAt, kind) {
  if (!clearedAt) return true;
  const time = kind === 'week' ? (Number(row.updated) || 0) : entryTime(row);
  return time >= clearedAt;
}

function dropCleared(moods, gratitude, weeks, clearedAt) {
  if (!clearedAt) return { moods, gratitude, weeks };
  return {
    moods: moods.filter((row) => fresh(row, clearedAt, 'day')),
    gratitude: gratitude.filter((row) => fresh(row, clearedAt, 'day')),
    weeks: Object.fromEntries(Object.entries(weeks).filter(([, week]) => fresh(week, clearedAt, 'week'))),
  };
}

function publicProfile(id, row) {
  return {
    id,
    name: row.name || '',
    updated: row.updated || 0,
    clearedAt: row.clearedAt || 0,
    moods: Array.isArray(row.moods) ? row.moods : [],
    gratitude: Array.isArray(row.gratitude) ? row.gratitude : [],
    goals: { weeks: row.goals && row.goals.weeks ? row.goals.weeks : {} },
  };
}

export function createCheckinStore(filePath) {
  let data = { users: {} };

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && parsed.users && typeof parsed.users === 'object') data = parsed;
    } catch {
      data = { users: {} };
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  load();

  function userRow(userId) {
    if (!data.users[userId]) data.users[userId] = { profiles: {} };
    if (!data.users[userId].profiles || typeof data.users[userId].profiles !== 'object') {
      data.users[userId].profiles = {};
    }
    return data.users[userId];
  }

  return {
    list(userId) {
      const row = data.users[userId];
      if (!row || !row.profiles) return [];
      return Object.entries(row.profiles)
        .map(([id, profile]) => publicProfile(id, profile))
        .sort((a, b) => (b.updated || 0) - (a.updated || 0))
        .slice(0, MAX_PROFILES);
    },
    merge(userId, profileId, incoming) {
      if (!validProfileId(profileId)) {
        const err = new Error('That profile id is not valid.');
        err.status = 400;
        throw err;
      }
      const row = userRow(userId);
      const prev = row.profiles[profileId] || {
        moods: [],
        gratitude: [],
        goals: { weeks: {} },
        name: '',
        updated: 0,
        clearedAt: 0,
      };
      const clearedAt = Math.max(stamp(prev.clearedAt), stamp(incoming && incoming.clearedAt));
      let moods = mergeByDate(incoming && incoming.moods, prev.moods, 'mood');
      let gratitude = mergeByDate(incoming && incoming.gratitude, prev.gratitude, 'grat');
      const incomingWeeks = incoming && incoming.goals && incoming.goals.weeks;
      let weeks = mergeWeeks(incomingWeeks, prev.goals && prev.goals.weeks);
      ({ moods, gratitude, weeks } = dropCleared(moods, gratitude, weeks, clearedAt));
      const saved = {
        name: clip((incoming && incoming.name) || prev.name || '', 40),
        moods,
        gratitude,
        goals: { weeks },
        clearedAt,
        updated: Date.now(),
      };
      row.profiles[profileId] = saved;
      const ids = Object.entries(row.profiles).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
      if (ids.length > MAX_PROFILES) row.profiles = Object.fromEntries(ids.slice(0, MAX_PROFILES));
      persist();
      return publicProfile(profileId, row.profiles[profileId]);
    },
    /** Drop this account's check-ins and goals. Other accounts are left as they are. */
    forget(userId) {
      if (userId == null || userId === '') return false;
      const key = String(userId);
      if (!Object.prototype.hasOwnProperty.call(data.users, key)) return false;
      delete data.users[key];
      persist();
      return true;
    },
  };
}
