/**
 * Hosted Hope chat: daily caps and request checks.
 * This call does not write the transcript. Saved chats are /api/chats. Only a per-account day counter is kept here.
 * The OpenAI key stays in the server environment.
 */
import { publicUser } from './store.js';

export const FREE_DAILY_DEFAULT = 15;
/** Free count rolls over at midnight in Australia/Brisbane (no daylight saving). */
export const HOPE_RESET_LABEL = 'midnight, Brisbane time';
const MAX_MESSAGES = 40;
const MAX_CONTENT = 12000;
const MAX_TOKENS = 600;

const CRISIS_RE = /\b(suicid\w*|kill(ing)? (myself|me)|end(ing)? (it all|my life)|want(ed)? to die|don'?t want to (live|be here|wake up)|better off dead|self[- ]?harm\w*|hurt(ing)? myself|cut(ting)? myself|overdos\w*|over dose|about to (use|relapse|drink|score)|going to (use|relapse|drink|score)|can'?t stop myself (from )?(using|drinking|scoring)|extreme craving|domestic violence|family violence|not safe|unsafe|in danger|1800respect|he'?s hurting me|she'?s hurting me|partner (is )?(hurting|hitting|abusing) me)\b/i;

export function dailyCap(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function freeDailyCap() {
  return dailyCap('HOPEWICK_FREE_DAILY', FREE_DAILY_DEFAULT);
}

/** Plus, a 3-day trial, and complimentary founder accounts have no daily message cap. */
export function hasUnlimitedHope(user) {
  return publicUser(user).plus === true;
}

/** Calendar day in Australia/Brisbane (no daylight saving). */
export function brisbaneDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function hopeConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

/** A number for Free. null means no daily cap (Plus, trialing, founder). */
export function limitForUser(user) {
  return hasUnlimitedHope(user) ? null : freeDailyCap();
}

export function ensureUsage(user, now = new Date()) {
  const day = brisbaneDay(now);
  if (!user.hopeUsage || user.hopeUsage.day !== day) {
    user.hopeUsage = { day, count: 0, memory: 0 };
  }
  if (typeof user.hopeUsage.count !== 'number' || user.hopeUsage.count < 0) user.hopeUsage.count = 0;
  if (typeof user.hopeUsage.memory !== 'number' || user.hopeUsage.memory < 0) user.hopeUsage.memory = 0;
  return user.hopeUsage;
}

export function usageSnapshot(user, now = new Date()) {
  const usage = ensureUsage(user, now);
  const limit = limitForUser(user);
  const view = publicUser(user);
  return {
    day: usage.day,
    used: usage.count,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - usage.count),
    resetLabel: limit == null ? null : HOPE_RESET_LABEL,
    // First subscription only, matching Checkout trial_period_days.
    trialEligible: limit != null && !user.stripeSubscriptionId,
    plus: view.plus,
    complimentary: view.complimentary,
    hopeConfigured: hopeConfigured(),
  };
}

export function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === 'user') return String(messages[i].content || '');
  }
  return '';
}

export function isCrisisText(text) {
  return CRISIS_RE.test(String(text || ''));
}

export const CRISIS_FALLBACK = [
  'If you or someone else is in immediate danger, call 000 now.',
  'You can also contact Lifeline on 13 11 14, Suicide Call Back Service on 1300 659 467, the National Alcohol and Other Drug Hotline on 1800 250 015, or 1800RESPECT on 1800 737 732 for domestic, family and sexual violence.',
  'Hope is an AI recovery companion, not a crisis service. Get help in this app stays free.',
].join(' ');

export function sanitizeMessages(input) {
  if (!Array.isArray(input) || input.length === 0) {
    const err = new Error('Send a short conversation to Hope.');
    err.status = 400;
    throw err;
  }
  if (input.length > MAX_MESSAGES) {
    const err = new Error('That conversation is too long to send in one go.');
    err.status = 400;
    throw err;
  }
  return input.map((msg) => {
    const role = msg && msg.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      const err = new Error('A message had an unexpected role.');
      err.status = 400;
      throw err;
    }
    const content = String(msg.content || '').slice(0, MAX_CONTENT);
    if (!content.trim()) {
      const err = new Error('A message was empty.');
      err.status = 400;
      throw err;
    }
    return { role, content };
  });
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function completionBody(messages, options = {}) {
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature: clampNumber(options.temperature, 0, 1.5, 0.7),
    max_tokens: Math.round(clampNumber(options.max_tokens, 1, MAX_TOKENS, MAX_TOKENS)),
  };
  if (options.stream) body.stream = true;
  return body;
}

export function openAiEndpoint() {
  const base = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) {
    const err = new Error('OPENAI_BASE_URL must be an https URL.');
    err.status = 500;
    throw err;
  }
  return `${base}/chat/completions`;
}

/**
 * Decide whether this call may proceed, and whether it spends a daily message.
 * A crisis reply under the free cap spends one message and may call the model.
 * At the cap, crisis is a static reply: no model call and no extra spend.
 * Memory extraction does not spend a chat message.
 */
export function admitHopeCall(user, { purpose, crisis, now = new Date() } = {}) {
  const usage = ensureUsage(user, now);
  const limit = limitForUser(user);
  const kind = purpose === 'memory' ? 'memory' : 'chat';
  if (kind === 'memory') {
    if (usage.count <= 0 || usage.memory >= usage.count) {
      return { ok: false, status: 429, code: 'memory_cap', usage, limit };
    }
    return { ok: true, spend: 'memory', usage, limit };
  }
  if (crisis && limit != null && usage.count >= limit) {
    return { ok: true, staticOnly: true, spend: 'none', usage, limit, crisis: true };
  }
  if (limit != null && usage.count >= limit) {
    return { ok: false, status: 429, code: 'daily_cap', usage, limit };
  }
  return { ok: true, spend: 'chat', usage, limit, crisis: crisis === true };
}

export function commitSpend(user, admission) {
  if (!admission || !admission.ok) return;
  if (admission.spend === 'chat') admission.usage.count += 1;
  if (admission.spend === 'memory') admission.usage.memory += 1;
  user.hopeUsage = admission.usage;
}

export function rollbackSpend(user, admission) {
  if (!admission || !admission.ok) return;
  if (admission.spend === 'chat' && admission.usage.count > 0) admission.usage.count -= 1;
  if (admission.spend === 'memory' && admission.usage.memory > 0) admission.usage.memory -= 1;
  user.hopeUsage = admission.usage;
}

export function capMessage(user, limit) {
  const n = limit == null ? freeDailyCap() : limit;
  if (hasUnlimitedHope(user)) {
    return 'Hopewick Plus has no daily message limit. Today’s Readings, crisis support, and Get help stay available.';
  }
  const noun = n === 1 ? 'message' : 'messages';
  return `You’ve used your ${n} free Hope ${noun} for today. They reset at ${HOPE_RESET_LABEL}. Hopewick Plus has no daily message limit. Today’s Readings, crisis support, domestic and family violence resources, and Get help stay free.`;
}
