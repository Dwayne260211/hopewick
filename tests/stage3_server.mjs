// Starts a throwaway local Hopewick server for the Stage 3 browser tests.
// Never reads .env: DATABASE_URL is removed so the per-user JSON store is used,
// unless HW_TEST_PG=1 keeps it (Neon dev only). Prints "READY <port>".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';

const dir = process.env.HW_TEST_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'hw3-'));
if (process.env.HW_TEST_PG !== '1') delete process.env.DATABASE_URL;
process.env.HOPEWICK_DEV = '1';
delete process.env.NODE_ENV;
delete process.env.OPENAI_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.RESEND_API_KEY;
process.env.FOUNDER_PLUS_EMAILS = process.env.FOUNDER_PLUS_EMAILS || 'plus-tester@example.test';
process.env.COOKIE_SECURE = '0';
const server = await startServer({
  port: Number(process.env.PORT || 0),
  storePath: path.join(dir, 'users.json'),
  chatsPath: path.join(dir, 'chats.json'),
  checkinsPath: path.join(dir, 'checkins.json'),
  visitsPath: path.join(dir, 'visits.json'),
  wellbeingPath: path.join(dir, 'wellbeing.json'),
});
console.log(`READY ${server.address().port} ${dir}`);
process.on('SIGTERM', () => server.close(() => process.exit(0)));
