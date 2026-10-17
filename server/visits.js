/**
 * Page visit counter for the public homepage and the app entry.
 * A number only. No names, emails, IP addresses, or page paths.
 * Lives beside the account file (production: /var/data/visits.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createJsonFile } from './json-file.js';

export function visitsPathBeside(storePath) {
  return path.join(path.dirname(storePath), 'visits.json');
}

export function createVisitCounter(filePath) {
  const file = createJsonFile(filePath, {
    label: 'visits.json',
    // Valid JSON with a missing or odd count reads as 0, as before.
    // JSON that does not parse makes the counter unavailable (never overwritten).
    isValid: (parsed) => Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed),
    empty: () => ({ visits: 0 }),
    serialize: (value) => `${JSON.stringify(value, null, 2)}\n`,
  });
  const start = Number(file.initial.visits);
  let visits = Number.isSafeInteger(start) && start >= 0 ? start : 0;

  function persist() {
    file.write({ visits });
  }

  if (!file.failed && !fs.existsSync(filePath)) persist();

  return {
    filePath,
    health: () => file.health(),
    count() {
      return visits;
    },
    increment() {
      const previous = visits;
      visits += 1;
      try {
        persist();
      } catch (err) {
        visits = previous;
        throw err;
      }
      return visits;
    },
  };
}
