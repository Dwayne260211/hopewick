// Hopewick Postgres layer (Hopewick 2.0, Stage 2b).
//
// Only active when DATABASE_URL is set. Without it nothing here connects, `pg`
// is never imported, and the app keeps using the JSON store (server/store.js etc.).
// Production does not read or write Postgres yet: see docs/DB-MIGRATION-PLAN.md.
//
// Per-user access is enforced twice:
//   1. every repository query takes the signed-in user's id and filters by it;
//   2. withUser() sets app.user_id for the transaction, switches to the
//      hopewick_rls role (no BYPASSRLS, migrations/002) and the tables have
//      FORCE ROW LEVEL SECURITY policies on user_id (migrations/001_init.sql),
//      so a query that forgot its WHERE clause still sees only that user's rows.

let poolPromise = null;

export function dbEnabled(env = process.env) {
  return Boolean(String(env.DATABASE_URL || '').trim());
}

/** Host name only, for logs. Never log the full URL: it carries the password. */
export function databaseHost(env = process.env) {
  try { return new URL(env.DATABASE_URL).hostname; } catch { return '(unparseable DATABASE_URL)'; }
}

/** Neon URLs carry sslmode=require; pg 8 treats that as verify-full and warns. Make it explicit. */
function normaliseSsl(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.get('sslmode') === 'require' && !u.searchParams.has('uselibpqcompat')) u.searchParams.set('sslmode', 'verify-full');
    return u.toString();
  } catch { return url; }
}

export async function getPool(env = process.env) {
  if (!dbEnabled(env)) throw new Error('DATABASE_URL is not set; Postgres is disabled and the JSON store is in use.');
  if (!poolPromise) {
    poolPromise = (async () => {
      const options = {
        connectionString: normaliseSsl(env.DATABASE_URL),
        max: Number(env.DATABASE_POOL_MAX || 5),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 15_000,
        application_name: 'hopewick',
      };
      let pool;
      if (env.DATABASE_DRIVER === 'neon-websocket') {
        // Development/test only: Neon's WebSocket driver (port 443) for networks that
        // block outbound 5432. Same Pool/Client API as pg. Dev dependencies, never used
        // in production unless DATABASE_DRIVER is set there.
        const { Pool, neonConfig } = await import('@neondatabase/serverless');
        const { default: ws } = await import('ws');
        neonConfig.webSocketConstructor = ws;
        pool = new Pool(options);
      } else {
        const { default: pg } = await import('pg');
        pool = new pg.Pool(options);
      }
      pool.on('error', (err) => console.error('HOPEWICK DB pool error:', err.message));
      return pool;
    })();
  }
  return poolPromise;
}

export async function closePool() {
  if (!poolPromise) return;
  const p = poolPromise;
  poolPromise = null;
  await (await p).end();
}

const USER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export function assertUserId(userId) {
  if (typeof userId !== 'string' || !USER_ID_RE.test(userId)) {
    throw new Error('A valid signed-in user id is required for every database call.');
  }
  return userId;
}

/**
 * Run fn(client) in one transaction scoped to a single user.
 * Row level security only shows and accepts rows whose user_id equals userId.
 */
export async function withUser(userId, fn, env = process.env) {
  assertUserId(userId);
  const pool = await getPool(env);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    // The login role may have BYPASSRLS (Neon owner roles do). Drop to the
    // NOLOGIN, NOBYPASSRLS role from migrations/002 for this transaction only.
    await client.query('SET LOCAL ROLE hopewick_rls');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Non-fatal start-up probe: logs whether Postgres is reachable. Never throws. */
export async function probeDatabase(env = process.env) {
  if (!dbEnabled(env)) return { enabled: false };
  try {
    const pool = await getPool(env);
    const { rows } = await pool.query("SELECT coalesce(max(version), 0) AS version FROM schema_migrations");
    return { enabled: true, ok: true, schemaVersion: Number(rows[0].version) };
  } catch (err) {
    return { enabled: true, ok: false, error: err.message };
  }
}
