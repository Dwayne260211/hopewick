/**
 * GET /api/admin/stats: read-only aggregate counts for the daily report.
 * Off (404) unless HOPEWICK_STATS_TOKEN is set (min 32 chars).
 * Auth: Authorization: Bearer <token>, constant-time compare. No CORS.
 * Counts only. Never names, emails or ids.
 */
import crypto from 'node:crypto';
import { brisbaneDay, lastDays } from './visit-stats.js';

export const TEST_ACCOUNT_RE = /^admin\+[^@]*@bridge-bite-co\.com$/i;

export function isTestAccount(email) {
  return TEST_ACCOUNT_RE.test(String(email || '').trim());
}

export function statsToken() {
  const t = String(process.env.HOPEWICK_STATS_TOKEN || '').trim();
  return t.length >= 32 ? t : '';
}

export function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function accountStats(users, { days = 30, now = new Date() } = {}) {
  const window = lastDays(days, now);
  const perDay = Object.fromEntries(window.map((d) => [d, 0]));
  let total = 0;
  let excluded = 0;
  let excludedToday = 0;
  const today = brisbaneDay(now);
  const plus = { stripe: { paid: 0, trial: 0 }, googlePlay: { paid: 0, trial: 0 }, pastDue: 0 };
  for (const u of users) {
    const created = u && u.createdAt ? new Date(u.createdAt) : null;
    const day = created && !Number.isNaN(created.getTime()) ? brisbaneDay(created) : null;
    if (isTestAccount(u && u.email)) {
      excluded += 1;
      if (day === today) excludedToday += 1;
      continue;
    }
    total += 1;
    if (day && day in perDay) perDay[day] += 1;
    const status = u.subscriptionStatus || 'none';
    const bucket = u.billingProvider === 'google_play' ? plus.googlePlay : plus.stripe;
    if (status === 'active') bucket.paid += 1;
    else if (status === 'trialing') bucket.trial += 1;
    else if (status === 'past_due') plus.pastDue += 1;
  }
  return {
    totalAccounts: total,
    testAccountsExcluded: excluded,
    testAccountsExcludedCreatedToday: excludedToday,
    testAccountRule: 'admin+*@bridge-bite-co.com',
    signupsPerDay: window.map((day) => ({ day, count: perDay[day] })),
    plus,
  };
}
