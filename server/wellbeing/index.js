/**
 * One storage interface for Stage 3 wellbeing data.
 *
 *   DATABASE_URL set   -> Postgres (server/wellbeing/pg-store.js), row level security per user.
 *   DATABASE_URL unset -> JSON file (server/wellbeing/json-store.js) beside users.json,
 *                         per user, atomic writes, fail-loud on a corrupt file.
 *
 * Production has no DATABASE_URL today, so the JSON file is what is live.
 * Both backends expose the same async methods and return the same shapes;
 * server/wellbeing.test.mjs runs one contract suite against each.
 */
import { createJsonWellbeingStore } from './json-store.js';
import { createPgWellbeingStore } from './pg-store.js';
import { dbEnabled } from '../db/index.js';

export function createWellbeingStore({ filePath, env = process.env, backend } = {}) {
  const which = backend || (dbEnabled(env) ? 'postgres' : 'json');
  if (which === 'postgres') return createPgWellbeingStore({ env });
  if (!filePath) throw new Error('createWellbeingStore needs filePath for the JSON backend.');
  return createJsonWellbeingStore(filePath, { env });
}
