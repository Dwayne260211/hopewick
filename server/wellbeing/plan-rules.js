/**
 * Free vs Hopewick Plus rules for saved wellbeing data.
 *
 * The history window is a VIEW rule, not a storage rule:
 * - Free accounts keep everything they save. In-app lists, trends and charts
 *   show the last HISTORY_WINDOW_DAYS days; older items are counted, never
 *   deleted, locked or hidden from export. Export and delete always cover
 *   everything.
 * - Plus (paid, trial or founder comp) sees full history.
 * - Nothing here ever deletes data because of plan status, including when
 *   Plus lapses.
 */
import { addIsoDays } from '../checkins.js';
import { brisbaneToday } from './validate.js';

/** Days of history shown in the app on the free plan (today counts as day 1). */
export const HISTORY_WINDOW_DAYS = 7;

/** Journal kinds anyone can write. The rest are Plus refinements. */
export const FREE_JOURNAL_KINDS = Object.freeze(['free', 'prompt']);

export function windowStart(today = brisbaneToday(), days = HISTORY_WINDOW_DAYS) {
  return addIsoDays(today, -(days - 1));
}
/** Brisbane calendar date of an ISO timestamp. */
export function brisbaneDateOf(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : brisbaneToday(d);
}

/**
 * Splits a list into what the app shows and how many older items are kept
 * but outside the free window. keep(item) returns true for items that are
 * always shown (for example an activity still in progress).
 */
export function applyWindow(list, { plus, dateOf, keep, today = brisbaneToday(), days = HISTORY_WINDOW_DAYS }) {
  if (plus) return { items: list, window: { limited: false, days: null, hiddenCount: 0, from: null } };
  const from = windowStart(today, days);
  const items = [];
  let hiddenCount = 0;
  for (const it of list) {
    if ((keep && keep(it)) || (dateOf(it) || '') >= from) items.push(it);
    else hiddenCount += 1;
  }
  return { items, window: { limited: true, days, hiddenCount, from } };
}

export const checkinDate = (c) => c.date;
export const journalDate = (e) => e.entryDate || brisbaneDateOf(e.createdAt);
export const activityDate = (a) => brisbaneDateOf(a.completedAt || a.updatedAt || a.startedAt);
export const stepDate = (s) => brisbaneDateOf(s.completedAt || s.updatedAt || s.createdAt);
