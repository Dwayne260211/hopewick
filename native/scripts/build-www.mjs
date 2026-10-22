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

// Capacitor's Android local server (WebViewLocalServer, html5mode) answers every
// extension-less path such as /app/ with the ROOT www/index.html, never with
// app/index.html. A redirect page at the root therefore redirects to itself
// forever (white screen with only the link). So the app itself is the root
// index.html; <base href="/app/"> keeps its relative URLs (hw-*.js, data/,
// ../brand) resolving exactly as they do on the website.
const appHtml = fs.readFileSync(path.join(out, 'app', 'index.html'), 'utf8');
if (!/<head>/i.test(appHtml)) throw new Error('app/index.html has no <head>');
const guard = String.raw`<script>
(function () {
  // Fallback for very old Android System WebView: show a readable message
  // instead of a blank page if modern JS is missing or the app fails to start.
  var ok = true;
  try { new Function('let a=()=>1;class B{};const{x}={x:1};return \`${'$'}{a()}\`;'); ok = !!(window.Promise && window.fetch && window.Symbol); } catch (e) { ok = false; }
  function show(msg) {
    var d = document.getElementById('hw-native-fallback');
    if (!d) { d = document.createElement('div'); d.id = 'hw-native-fallback'; (document.body || document.documentElement).appendChild(d); }
    d.setAttribute('style', 'position:fixed;inset:0;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#fff;color:#111;font:16px/1.5 sans-serif;padding:24px;overflow:auto');
    d.innerHTML = '<h1 style="font-size:20px">Hopewick couldn\'t start</h1><p>' + msg + '</p><p>Please update <b>Android System WebView</b> and <b>Chrome</b> from the Play Store, then reopen the app. You can also use Hopewick at <b>hopewick.com.au/app/</b>.</p><p>In an emergency call <b>000</b>. Lifeline <b>13 11 14</b>.</p>';
  }
  window.__hwShowFallback = show;
  if (!ok) { document.addEventListener('DOMContentLoaded', function () { show('This phone\'s web engine (Android System WebView) is too old for Hopewick.'); }); return; }
  window.addEventListener('error', function (e) { window.__hwErr = (e && e.message) || 'Script error'; });
  window.addEventListener('load', function () {
    if (window.__hwErr && !(document.body && document.body.innerText.replace(/\s/g, '').length > 40)) show('Startup error: ' + String(window.__hwErr).replace(/</g, '&lt;'));
  });
})();
</script>`;
const injected = appHtml.replace(/<head>/i, '<head>\n<base href="/app/">\n' + guard + '\n<script src="/app/capacitor.js"></script>\n<script src="/app/hw-native.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), injected);
// Same document at /app/index.html for anything that links to it explicitly.
fs.writeFileSync(path.join(out, 'app', 'index.html'), injected);
console.log('native/www built from', repo);
