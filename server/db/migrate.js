// Versioned SQL migrations for Hopewick Postgres.
//
//   npm run db:migrate          apply pending migrations (reads DATABASE_URL, or a local .env)
//   npm run db:migrate:status   list applied / pending, change nothing
//
// Files: migrations/NNN_name.sql, applied in order, each in its own transaction,
// recorded in schema_migrations (version, name, sha256 checksum). An applied file
// whose checksum changed is an error: write a new migration instead of editing one.
// A transaction-scoped Postgres advisory lock stops two runners applying at once.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool, dbEnabled, databaseHost } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '../../migrations');
const LOCK_KEY = 727_272_001; // arbitrary, fixed: "hopewick migrations"

export function listMigrations(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      return {
        version: Number(file.slice(0, 3)),
        name: file.replace(/\.sql$/, ''),
        file,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

async function ensureTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version     integer PRIMARY KEY,
    name        text NOT NULL,
    checksum    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )`);
}

export async function migrationStatus({ env = process.env, dir = MIGRATIONS_DIR } = {}) {
  const pool = await getPool(env);
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const { rows } = await client.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
    const applied = new Map(rows.map((r) => [r.version, r]));
    return listMigrations(dir).map((m) => {
      const row = applied.get(m.version);
      return { version: m.version, name: m.name, applied: Boolean(row), appliedAt: row ? row.applied_at : null, drift: Boolean(row && row.checksum !== m.checksum) };
    });
  } finally {
    client.release();
  }
}

export async function migrate({ env = process.env, dir = MIGRATIONS_DIR, log = console.log } = {}) {
  const pool = await getPool(env);
  const client = await pool.connect();
  const appliedNow = [];
  try {
    await ensureTable(client);
    for (const m of listMigrations(dir)) {
      // Transaction-scoped advisory lock: safe behind Neon's transaction-mode pooler,
      // and a second runner waits here, then sees the version already recorded.
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
        const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [m.version]);
        if (rows[0]) {
          await client.query('COMMIT');
          if (rows[0].checksum !== m.checksum) {
            throw new Error(`Migration ${m.file} was changed after it was applied. Add a new migration instead.`);
          }
          continue;
        }
        log(`applying ${m.file}`);
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [m.version, m.name, m.checksum]);
        await client.query('COMMIT');
        appliedNow.push(m.name);
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* not in a transaction */ }
        if (/changed after it was applied/.test(err.message)) throw err;
        throw new Error(`Migration ${m.file} failed and was rolled back: ${err.message}`);
      }
    }
    return appliedNow;
  } finally {
    client.release();
  }
}

/** Minimal .env reader for local runs. Only sets keys that are not already set. Never prints values. */
export function loadLocalEnv(file = path.resolve(here, '../../.env'), env = process.env) {
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadLocalEnv();
  if (!dbEnabled()) {
    console.error('DATABASE_URL is not set (environment or local .env). Nothing to do.');
    process.exit(2);
  }
  const statusOnly = process.argv.includes('--status');
  console.log(`database host: ${databaseHost()}`);
  try {
    if (statusOnly) {
      for (const s of await migrationStatus()) {
        console.log(`${String(s.version).padStart(3, '0')} ${s.name.padEnd(28)} ${s.applied ? 'applied ' + new Date(s.appliedAt).toISOString() : 'pending'}${s.drift ? '  CHECKSUM CHANGED' : ''}`);
      }
    } else {
      const done = await migrate();
      console.log(done.length ? `applied: ${done.join(', ')}` : 'database is up to date');
    }
  } catch (err) {
    console.error(`HOPEWICK MIGRATION ERROR: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
