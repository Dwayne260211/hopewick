/**
 * Server-side feature flag for Move & Recover (fitness, sauna, cold and
 * contrast protocols).
 *
 *   FEATURE_FITNESS_PROTOCOLS unset / "0" / "off"   OFF (the default, and production)
 *   FEATURE_FITNESS_PROTOCOLS = "1" / "on" / "true" ON for everyone signed in (Plus gates still apply)
 *   FEATURE_FITNESS_PROTOCOLS = "founder"           Preview for founder accounts only
 *                                                    (FOUNDER_PLUS_EMAILS; never the Play reviewer)
 *
 * When the flag is off for a request, every /api/fitness/* route answers 404
 * exactly like an unknown route, and the app shows nothing at all, not even
 * a teaser. Read on every request, so a local .env or a test can switch it.
 * Do not set it on Render until clinical review is signed off.
 */
import { founderPlusEmails } from '../store.js';

export const FLAG_NAME = 'FEATURE_FITNESS_PROTOCOLS';

export function fitnessFlagMode(env = process.env) {
  const raw = String(env[FLAG_NAME] == null ? '' : env[FLAG_NAME]).trim().toLowerCase();
  if (raw === '1' || raw === 'on' || raw === 'true' || raw === 'yes') return 'on';
  if (raw === 'founder') return 'founder';
  return 'off';
}

/** Is Move & Recover visible to this person on this request? */
export function fitnessEnabledFor(user, env = process.env) {
  const mode = fitnessFlagMode(env);
  if (mode === 'on') return true;
  if (mode === 'founder') {
    const email = user && user.email ? String(user.email).trim().toLowerCase() : '';
    return Boolean(email) && founderPlusEmails().has(email);
  }
  return false;
}
