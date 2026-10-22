/**
 * Daily, aggregate-only visit counts for the daily report.
 * Stored in visits-daily.json beside visits.json. Per Australia/Brisbane day:
 *   total, pages { "/index.html": n }, utm { "source|medium|campaign": n }.
 * No IPs, cookies, user agents, names, emails or any per-person data.
 * Counted server-side when a public HTML page is served (GET, 200, not a bot).
 * Kept for 400 days. Writes are batched (at most one every few seconds).
 */
import path from 'node:path';
import { createJsonFile } from './json-file.js';

export const REPORT_TZ = 'Australia/Brisbane';
const KEEP_DAYS = 400;
const MAX_UTM_KEYS_PER_DAY = 200;
const MAX_PAGES_PER_DAY = 300;
const BOT_UA = /bot|crawl|spider|slurp|preview|monitor|uptime|lighthouse|curl|wget|python-requests|httpclient|facebookexternalhit|embedly|go-http-client/i;

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** YYYY-MM-DD in Australia/Brisbane. */
export function brisbaneDay(date = new Date()) {
  return dayFmt.format(date);
}

export function lastDays(n, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(brisbaneDay(new Date(now.getTime() - i * 86_400_000)));
  return [...new Set(out)];
}

function cleanUtm(v) {
  const s = String(v || '').trim().toLowerCase().slice(0, 64);
  return s.replace(/[^a-z0-9._\-]/g, '_');
}

export function utmKey(searchParams) {
  if (!searchParams) return '';
  const s = cleanUtm(searchParams.get('utm_source'));
  const m = cleanUtm(searchParams.get('utm_medium'));
  const c = cleanUtm(searchParams.get('utm_campaign'));
  if (!s && !m && !c) return '';
  return `${s}|${m}|${c}`;
}

export function isBot(userAgent) {
  return !userAgent || BOT_UA.test(String(userAgent));
}

export function dailyVisitsPathBeside(visitsPath) {
  return path.join(path.dirname(visitsPath), 'visits-daily.json');
}

export function createDailyVisits(filePath, { flushMs = 3000 } = {}) {
  const file = createJsonFile(filePath, {
    label: 'visits-daily.json',
    isValid: (p) => Boolean(p) && typeof p === 'object' && !Array.isArray(p) && p.days && typeof p.days === 'object',
    empty: () => ({ days: {} }),
    serialize: (v) => `${JSON.stringify(v)}\n`,
  });
  const data = file.failed ? { days: {} } : file.initial;
  let timer = null;

  function prune() {
    const keep = new Set(lastDays(KEEP_DAYS));
    for (const d of Object.keys(data.days)) if (!keep.has(d)) delete data.days[d];
  }
  function flush() {
    timer = null;
    if (file.failed) return;
    try { prune(); file.write(data); } catch (err) { console.error('visits-daily.json write failed', err.message); }
  }
  function schedule() {
    if (flushMs <= 0) return flush();
    if (timer) return;
    timer = setTimeout(flush, flushMs);
    if (timer.unref) timer.unref();
  }

  return {
    filePath,
    health: () => file.health(),
    flush() { if (timer) clearTimeout(timer); flush(); },
    /** Record one page view. page must already be a known public page path. */
    record(page, searchParams, now = new Date()) {
      if (file.failed) return;
      const day = brisbaneDay(now);
      const d = (data.days[day] ||= { total: 0, pages: {}, utm: {} });
      d.total += 1;
      if (page in d.pages || Object.keys(d.pages).length < MAX_PAGES_PER_DAY) d.pages[page] = (d.pages[page] || 0) + 1;
      const k = utmKey(searchParams);
      if (k) {
        if (k in d.utm || Object.keys(d.utm).length < MAX_UTM_KEYS_PER_DAY) d.utm[k] = (d.utm[k] || 0) + 1;
        else d.utm['other|other|other'] = (d.utm['other|other|other'] || 0) + 1;
      }
      schedule();
    },
    days(n = 30, now = new Date()) {
      return lastDays(n, now).map((day) => {
        const d = data.days[day] || { total: 0, pages: {}, utm: {} };
        const utm = Object.entries(d.utm).map(([key, count]) => {
          const [source, medium, campaign] = key.split('|');
          return { source, medium, campaign, count };
        });
        return { day, total: d.total, pages: { ...d.pages }, utm };
      });
    },
  };
}
