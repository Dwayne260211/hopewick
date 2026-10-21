// Builds native/www from the website files. The website itself is not changed:
// the native helper script is injected only into this copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(here, '..', 'www');

const DIRS = ['app', 'assets', 'brand', 'img'];
const FILES = ['favicon.ico', 'apple-touch-icon.png', 'legal.css'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const d of DIRS) fs.cpSync(path.join(repo, d), path.join(out, d), { recursive: true });
for (const f of FILES) if (fs.existsSync(path.join(repo, f))) fs.copyFileSync(path.join(repo, f), path.join(out, f));
for (const f of fs.readdirSync(repo)) {
  if (f.endsWith('.html') && f !== 'index.html') fs.copyFileSync(path.join(repo, f), path.join(out, f));
}
fs.copyFileSync(path.join(here, '..', 'src', 'hw-native.js'), path.join(out, 'app', 'hw-native.js'));
fs.copyFileSync(path.join(here, '..', 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'), path.join(out, 'app', 'capacitor.js'));

const appIndex = path.join(out, 'app', 'index.html');
const html = fs.readFileSync(appIndex, 'utf8');
if (!/<head>/i.test(html)) throw new Error('app/index.html has no <head>');
fs.writeFileSync(appIndex, html.replace(/<head>/i, '<head>\n<script src="/app/capacitor.js"></script>\n<script src="/app/hw-native.js"></script>'));

fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/app/"><title>Hopewick</title><a href="/app/">Open Hopewick</a>\n');
console.log('native/www built from', repo);
