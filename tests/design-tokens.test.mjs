// Hopewick 2.0 design system: tokens, contrast and use across the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, themes, readBlock, TOKENS_FILE } from '../tools/design/contrast.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = fs.readFileSync(TOKENS_FILE, 'utf8');
const PAGES = ['index.html', 'our-story.html', 'app/index.html', 'complaints.html', 'data.html', 'privacy.html', 'terms.html'];

test('every text and UI colour pair meets WCAG 2.2 AA in light and dark', () => {
  const rows = check(css);
  assert.ok(rows.length >= 60);
  const bad = rows.filter((r) => !r.ok).map((r) => `${r.theme}: ${r.fg} on ${r.bg} = ${r.ratio}:1 (min ${r.min})`);
  assert.deepEqual(bad, []);
});

test('explicit dark theme and the prefers-color-scheme dark block are identical', () => {
  const t = themes(css);
  assert.deepEqual(t.darkMedia, t.dark);
  assert.ok(Object.keys(t.dark).length > 20);
});

test('brand palette follows the approved logo (navy, river blue, gold) and has no saturated brand red', () => {
  const light = readBlock(css, ':root');
  for (const k of ['--brand-primary', '--accent-warm', '--accent-gold']) assert.ok(light[k], `${k} missing`);
  assert.match(light['--brand-primary'], /^#(0b1b37|233a55)$/i);  // founder-approved navy
  assert.equal(light['--accent-gold-bright'].toLowerCase(), '#e3ab54');
  assert.equal(light['--brand-river'].toLowerCase(), '#acd2e9');
  // no saturated "Superman red" as a brand accent: crisis red lives in --danger only
  const [r, g, b] = light['--accent-warm'].match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
  assert.ok(sat < 0.75, `--accent-warm is too saturated (${sat.toFixed(2)})`);
  assert.ok(light['--danger']);
});

test('reduced motion is respected', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(read('assets/hopewick-ui.css'), /prefers-reduced-motion:\s*reduce/);
});

// The public homepage (index.html) was redesigned in 2026-10 with its own stylesheet (assets/site.css, light + dark)
// in the approved brand colours; it is checked separately below. Every other page keeps the shared design system.
const DS_PAGES = PAGES.filter((p) => p !== 'index.html');

test('homepage: brand stylesheet, navy theme colour, logo mark, crisis link and no old green', () => {
  const html = read('index.html');
  assert.match(html, /assets\/site\.css/);
  assert.match(html, /name="theme-color" content="#0b1b37"/);
  assert.match(html, /hopewick-mark/);
  assert.match(html, /hw-crisis-btn/);
  assert.match(html, /tel:000/);
  assert.match(html, /tel:131114/);
  assert.doesNotMatch(html, /#3f8f5f|#2f6f4f|#1f4a38/i);
});

test('all main pages load the tokens, components and theme script, and drop the old green theme', () => {
  for (const page of DS_PAGES) {
    const html = read(page);
    assert.match(html, /hopewick-tokens\.css/, `${page} tokens`);
    assert.match(html, /hopewick-ui\.css/, `${page} components`);
    assert.match(html, /theme\.js/, `${page} theme script`);
    assert.match(html, /name="theme-color" content="#0b1b37"/, `${page} theme-color`);
    assert.doesNotMatch(html, /#3f8f5f|#2f6f4f|#1f4a38/i, `${page} still uses the old green`);
  }
  assert.doesNotMatch(read('legal.css'), /#3f8f5f|#2f6f4f/i);
});

test('every page shows the logo, a theme toggle and a crisis link without the AI chat', () => {
  for (const page of DS_PAGES.filter((p) => p !== 'app/index.html')) {
    const html = read(page);
    assert.match(html, /hopewick-mark/, `${page} logo`);
    assert.match(html, /data-theme-toggle/, `${page} theme toggle`);
    assert.match(html, /hw-crisis-btn/, `${page} crisis link`);
  }
  const app = read('app/index.html');
  assert.match(app, /id="helpBtn"[^>]*hw-crisis-btn|hw-crisis-btn[^>]*id="helpBtn"/);
  assert.match(app, /tel:131114/);
  assert.match(app, /tel:000/);
});

test('manifest uses the navy theme colour', () => {
  const m = JSON.parse(read('app/manifest.webmanifest'));
  assert.equal(m.theme_color.toLowerCase(), '#0b1b37');
});

test('tagline: Hopewick, Support for your next step', () => {
  const html = read('index.html');
  assert.match(html, /<title>Hopewick: Recovery Support App Australia \| Between Sessions<\/title>/);
  assert.match(html, /Support for your next step\./);
});

test('approved logo: source artwork kept, dark-mode lockup exists and is used in dark theme', () => {
  for (const f of ['brand/source/hopewick-logo-source.png', 'brand/hopewick-lockup-dark.png', 'brand/hopewick-lockup-dark-600.png']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  // The homepage hero uses the approved full lockup, resized from brand/hopewick-lockup.png (the dark theme swaps in brand/hopewick-lockup-dark-600).
  const html = read('index.html');
  assert.match(html, /src="\/brand\/hopewick-hero-480\.png"/);
  assert.ok(fs.existsSync(path.join(root, 'brand/hopewick-hero-480.png')));
  const ui = read('assets/hopewick-ui.css');
  assert.match(ui, /:root\[data-theme="dark"\] \.hw-lockup__dark \{ display: block/);
  assert.match(read('tools/brand/build_logo_assets.py'), /hopewick-logo-source\.png/);
});

test('new public pages use the shared theme script and toggle, and the hero copy is accurate', () => {
  for (const page of ['index.html', 'how-it-works.html', 'pricing.html']) {
    const html = read(page);
    assert.match(html, /<script src="\/assets\/theme\.js"><\/script>/, `${page} theme script`);
    assert.match(html, /data-theme-toggle/, `${page} theme toggle`);
  }
  const home = read('index.html');
  assert.match(home, /Recovery is a journey\. <span class="gold">You don’t have to walk it alone\.<\/span>/);
  assert.match(home, /Hope is AI, not a person/);
  assert.doesNotMatch(home, /private support chat/);
  const css = read('assets/site.css');
  assert.match(css, /:root\[data-theme="dark"\] \.hw-home/);
  assert.match(css, /prefers-color-scheme: dark/);
});
