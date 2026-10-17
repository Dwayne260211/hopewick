/**
 * Safe JSON files for the account server (users.json, chats.json,
 * checkins.json, visits.json on the Render disk).
 *
 * - A file that is missing starts empty (first run).
 * - A file that exists but cannot be read, parsed or does not have the
 *   expected shape is NEVER treated as empty and NEVER overwritten. The store
 *   is marked unavailable, a clear error is logged, the original is left
 *   exactly as it was, and a copy is saved beside it as
 *   <file>.corrupt-<UTC timestamp> for investigation. The server then answers
 *   503 on /api/health and the account API instead of silently resetting.
 * - Writes are atomic: write <file>.<pid>.tmp, fsync, rename over the file,
 *   fsync the folder.
 * - <file>.bak is a rolling last-known-good copy on the same disk. It is
 *   refreshed from the file at start-up (after it parsed cleanly) and before
 *   a write when the last refresh is older than BACKUP_INTERVAL_MS.
 *
 * To recover: stop the service, inspect <file>.corrupt-*, then either fix the
 * file or copy <file>.bak over it, and redeploy/restart.
 */
import fs from 'node:fs';
import path from 'node:path';

export const BACKUP_INTERVAL_MS = 10 * 60 * 1000;

export class StoreUnavailableError extends Error {
  constructor(label, cause) {
    super(`The ${label} file could not be loaded, so Hopewick will not change it. Accounts are paused until it is fixed.`);
    this.name = 'StoreUnavailableError';
    this.status = 503;
    this.code = 'store_unavailable';
    if (cause) this.cause = cause;
  }
}

function stamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function fsyncDir(dir) {
  let fd;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch {
    // Some platforms cannot fsync a directory. The rename is still atomic.
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/** Write text to filePath atomically (temp file + fsync + rename + dir fsync). */
export function writeFileAtomic(filePath, text, { mode = 0o600 } = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'w', mode);
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw err;
  }
  fsyncDir(dir);
}

export function backupPath(filePath) {
  return `${filePath}.bak`;
}

/** Copy the current (known-good) file to <file>.bak atomically. Best effort. */
export function refreshBackup(filePath, label = path.basename(filePath)) {
  try {
    if (!fs.existsSync(filePath)) return false;
    writeFileAtomic(backupPath(filePath), fs.readFileSync(filePath));
    return true;
  } catch (err) {
    console.error(`Hopewick store: could not refresh the ${label} backup (${err && err.code ? err.code : 'error'}).`);
    return false;
  }
}

/**
 * Load a JSON store file.
 * Returns { status: 'missing' | 'ok' | 'corrupt', data, error, corruptCopy }.
 * `isValid(parsed)` checks the expected shape.
 */
export function loadJsonFile(filePath, { label = path.basename(filePath), isValid = () => true, log = console.error } = {}) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { status: 'missing', data: null };
    log(`HOPEWICK STORE ERROR: ${label} exists but could not be read (${err && err.code ? err.code : 'error'}) at ${filePath}. It was not changed. Account endpoints and /api/health will return 503 until it is fixed.`);
    return { status: 'corrupt', data: null, error: err };
  }
  let parsed;
  let problem = '';
  try {
    parsed = JSON.parse(text);
    if (!isValid(parsed)) problem = 'it is valid JSON but not the expected shape';
  } catch (err) {
    problem = `it is not valid JSON (${err && err.message ? err.message.slice(0, 120) : 'parse error'})`;
  }
  if (!problem) return { status: 'ok', data: parsed };

  let corruptCopy = null;
  try {
    const target = `${filePath}.corrupt-${stamp()}`;
    fs.copyFileSync(filePath, target, fs.constants.COPYFILE_EXCL);
    corruptCopy = target;
  } catch {
    // A copy is only a convenience. The original is never touched.
  }
  const bak = backupPath(filePath);
  const hint = fs.existsSync(bak) ? ` A last-known-good copy is at ${bak}.` : '';
  log(`HOPEWICK STORE ERROR: ${label} at ${filePath} could not be loaded: ${problem}. The file was NOT changed and Hopewick will not write to it.${corruptCopy ? ` A copy was saved to ${corruptCopy}.` : ''}${hint} Account endpoints and /api/health will return 503 until it is fixed.`);
  return { status: 'corrupt', data: null, error: new Error(problem), corruptCopy };
}

/**
 * A small helper that a store uses for load + persist.
 * `empty()` builds the first-run value. `serialize(data)` builds the text.
 */
export function createJsonFile(filePath, { label = path.basename(filePath), isValid, empty, serialize, backupIntervalMs = BACKUP_INTERVAL_MS } = {}) {
  const result = loadJsonFile(filePath, { label, isValid });
  const failed = result.status === 'corrupt';
  let lastBackup = 0;
  if (result.status === 'ok') {
    if (refreshBackup(filePath, label)) lastBackup = Date.now();
  }
  return {
    filePath,
    label,
    failed,
    initial: result.status === 'ok' ? result.data : empty(),
    health() {
      return failed ? { ok: false, label, file: filePath } : { ok: true, label };
    },
    assertWritable() {
      if (failed) throw new StoreUnavailableError(label, result.error);
    },
    write(data) {
      if (failed) throw new StoreUnavailableError(label, result.error);
      if (Date.now() - lastBackup >= backupIntervalMs && fs.existsSync(filePath)) {
        if (refreshBackup(filePath, label)) lastBackup = Date.now();
      }
      writeFileAtomic(filePath, serialize(data));
    },
  };
}
