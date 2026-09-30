/**
 * Page visit counter for the public homepage and the app entry.
 * A number only. No names, emails, IP addresses, or page paths.
 * Lives beside the account file (production: /var/data/visits.json).
 */
import fs from 'node:fs';
import path from 'node:path';

export function visitsPathBeside(storePath) {
  return path.join(path.dirname(storePath), 'visits.json');
}

export function createVisitCounter(filePath) {
  let visits = 0;

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const n = parsed && typeof parsed === 'object' ? Number(parsed.visits) : NaN;
      visits = Number.isSafeInteger(n) && n >= 0 ? n : 0;
    } catch {
      visits = 0;
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ visits }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  load();
  if (!fs.existsSync(filePath)) persist();

  return {
    filePath,
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
