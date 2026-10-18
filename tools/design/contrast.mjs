// WCAG 2.2 contrast checker for assets/hopewick-tokens.css.
// Usage: node tools/design/contrast.mjs   (prints a table, exits 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TOKENS_FILE = path.resolve(here, '../../assets/hopewick-tokens.css');

/** Pull the custom properties out of the first block whose selector matches exactly. */
export function readBlock(css, selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}') { depth--; if (depth === 0) break; }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
  return vars;
}

export function themes(css = fs.readFileSync(TOKENS_FILE, 'utf8')) {
  const light = readBlock(css, ':root');
  const darkExplicit = { ...light, ...readBlock(css, ':root[data-theme="dark"]') };
  const darkMedia = { ...light, ...readBlock(css, ':root:not([data-theme="light"])') };
  return { light, dark: darkExplicit, darkMedia };
}

export function resolve(vars, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`cycle at ${name}`);
  seen.add(name);
  const v = vars[name];
  if (v == null) throw new Error(`missing token ${name}`);
  const m = /^var\((--[a-z0-9-]+)\)$/i.exec(v);
  return m ? resolve(vars, m[1], seen) : v;
}

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a 6-digit hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [foreground, background, minimum ratio, why]
// 4.5 = normal text (SC 1.4.3). 3 = large text / UI components and focus indicators (SC 1.4.11).
export const PAIRS = [
  ['--text', '--bg', 4.5, 'body text on page'],
  ['--text', '--surface', 4.5, 'body text on cards'],
  ['--text', '--surface-2', 4.5, 'body text on tinted panels'],
  ['--text', '--surface-3', 4.5, 'body text on pressed panels'],
  ['--muted', '--bg', 4.5, 'secondary text on page'],
  ['--muted', '--surface', 4.5, 'secondary text on cards'],
  ['--muted', '--surface-2', 4.5, 'secondary text on tinted panels'],
  ['--accent-contrast', '--accent', 4.5, 'primary button label'],
  ['--accent-contrast', '--accent-strong', 4.5, 'primary button hover label'],
  ['--accent', '--surface', 4.5, 'links on cards'],
  ['--accent', '--bg', 4.5, 'links on page'],
  ['--accent-strong', '--accent-soft', 4.5, 'selected nav item / chip'],
  ['--text', '--accent-soft', 4.5, 'text on tinted brand panel'],
  ['--danger', '--surface', 4.5, 'crisis numbers on cards'],
  ['--danger', '--danger-soft', 4.5, 'crisis numbers on crisis panel'],
  ['--text', '--danger-soft', 4.5, 'text on crisis panel'],
  ['--danger-contrast', '--danger', 4.5, 'crisis button label'],
  ['--success', '--surface', 4.5, 'success text'],
  ['--success', '--success-soft', 4.5, 'success badge'],
  ['--accent-warm', '--surface', 4.5, 'warm accent text'],
  ['--accent-warm', '--accent-warm-soft', 4.5, 'warm accent badge'],
  ['--accent-gold', '--surface', 4.5, 'gold accent text'],
  ['--accent-gold', '--accent-gold-soft', 4.5, 'gold accent badge'],
  ['--border-strong', '--surface', 3, 'input / toggle outline'],
  ['--focus-color', '--surface', 3, 'focus ring on cards'],
  ['--focus-color', '--bg', 3, 'focus ring on page'],
  ['--accent', '--surface-2', 3, 'active icon on tinted panel'],
  ['--on-river', '--brand-river', 4.5, 'navy text on river-blue fill'],
  ['--text', '--brand-river-soft', 4.5, 'text on river-tinted panel'],
  ['--brand-secondary', '--surface', 3, 'secondary navy icons'],
  ['--accent-gold-bright', '--bg', 1.5, 'logo gold rule is visible (decorative)'],
];

export function check(css) {
  const out = [];
  for (const [theme, vars] of Object.entries(themes(css))) {
    for (const [fg, bg, min, why] of PAIRS) {
      const ratio = contrast(resolve(vars, fg), resolve(vars, bg));
      out.push({ theme, fg, bg, min, why, ratio: Math.round(ratio * 100) / 100, ok: ratio >= min });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = check(fs.readFileSync(TOKENS_FILE, 'utf8'));
  for (const r of rows) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.theme.padEnd(9)} ${r.ratio.toFixed(2).padStart(5)}:1 (min ${r.min})  ${r.fg} on ${r.bg}  - ${r.why}`);
  }
  const bad = rows.filter((r) => !r.ok);
  console.log(bad.length ? `\n${bad.length} pair(s) fail AA` : `\nAll ${rows.length} pairs meet WCAG 2.2 AA`);
  process.exit(bad.length ? 1 : 0);
}
