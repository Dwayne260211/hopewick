/**
 * Founder logo assets: right sizes, wired into the pages and manifest, and
 * served by the static handler. Run: node --test tests/brand-assets.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pngInfo(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${rel} is a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

test('icon mark sizes, maskable icons, lockup and og-image have the right dimensions', () => {
  for (const [rel, size] of [
    ['app/icon-512.png', 512], ['app/icon-192.png', 192], ['app/icon-180.png', 180],
    ['app/icon-32.png', 32], ['app/icon-16.png', 16],
    ['app/icon-maskable-512.png', 512], ['app/icon-maskable-192.png', 192],
  ]) {
    const info = pngInfo(rel);
    assert.equal(info.width, size, rel);
    assert.equal(info.height, size, rel);
  }
  // Apple touch and maskable icons are opaque (colour type 2 = RGB, no alpha).
  assert.equal(pngInfo('app/icon-180.png').colorType, 2);
  assert.equal(pngInfo('app/icon-maskable-512.png').colorType, 2);
  assert.deepEqual(fs.readFileSync(path.join(ROOT, 'apple-touch-icon.png')), fs.readFileSync(path.join(ROOT, 'app/icon-180.png')));
  const og = pngInfo('og-image.png');
  assert.equal(og.width, 1200);
  assert.equal(og.height, 630);
  assert.ok(pngInfo('brand/hopewick-lockup.png').width >= 1200);
  assert.equal(pngInfo('brand/hopewick-lockup-600.png').width, 600);
  assert.equal(pngInfo('brand/hopewick-mark-96.png').width, 96);
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.ok(ico.readUInt16LE(4) >= 2, 'favicon.ico holds at least 16 and 32');
});

test('manifest lists any and maskable icons that exist', () => {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/manifest.webmanifest'), 'utf8'));
  const purposes = new Set(man.icons.map((i) => i.purpose));
  assert.ok(purposes.has('any'));
  assert.ok(purposes.has('maskable'));
  for (const icon of man.icons) {
    const info = pngInfo(path.join('app', icon.src));
    assert.equal(`${info.width}x${info.height}`, icon.sizes, icon.src);
  }
});

test('landing page and app use the new favicon, header mark and og-image', () => {
  const land = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(land, /<link rel="icon" href="\/favicon\.ico"/);
  assert.match(land, /href="app\/icon-32\.png"/);
  assert.match(land, /og:image" content="https:\/\/hopewick\.com\.au\/og-image\.png"/);
  assert.match(land, /og:image:alt/);
  assert.match(land, /"logo": "https:\/\/hopewick\.com\.au\/brand\/hopewick-lockup-600\.png"/);
  // Header, footer, hero and (Hopewick 2.0) the chat preview all use the stage2a mark; no old orb left.
  assert.ok((land.match(/class="logo-mark/g) || []).length >= 3);
  assert.equal(/<span class="orb\b/.test(land), false);
  assert.equal(land.includes('<a class="logo" href="./"><span class="orb"'), false);
  const app = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
  assert.match(app, /<link rel="icon" href="\/favicon\.ico"/);
  assert.match(app, /href="icon-32\.png"/);
  assert.match(app, /<img class="brand-mark" src="\.\.\/brand\/hopewick-mark-96\.png"/);
  assert.equal(app.includes('data:image/svg+xml,%3Csvg'), false);
  for (const ref of ['brand/hopewick-mark-96.png', 'app/icon-16.png', 'app/icon-32.png']) {
    assert.ok(fs.existsSync(path.join(ROOT, ref)), ref);
  }
});

test('the server serves the new brand files', async () => {
  const os = await import('node:os');
  const { startServer } = await import('../server/index.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-brand-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/brand/hopewick-mark-96.png', '/brand/hopewick-lockup-600.png', '/app/icon-maskable-512.png', '/app/icon-32.png', '/favicon.ico', '/og-image.png']) {
      const res = await fetch(`${base}${route}`);
      assert.equal(res.status, 200, route);
      await res.arrayBuffer();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
