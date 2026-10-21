import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const [html, manifestText, serviceWorker] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'),
  readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
]);
const manifest = JSON.parse(manifestText);

function iconDimensions(bytes) {
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a', 'icon must be a PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('canonical Tanooki icons resolve at browser, iOS and PWA sizes', async () => {
  assert.match(html, /href="\/tanooki-icon-v2-32\.png"/);
  assert.match(html, /href="\/tanooki-icon-v2-16\.png"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/tanooki-apple-touch-icon-v2\.png"/);

  const expected = new Map([
    ['/tanooki-icon-v2-192.png', [192, 192]],
    ['/tanooki-icon-v2-512.png', [512, 512]],
    ['/tanooki-maskable-v2-512.png', [512, 512]],
  ]);
  for (const icon of manifest.icons) {
    const dimensions = expected.get(icon.src);
    assert.ok(dimensions, `unexpected manifest icon ${icon.src}`);
    const bytes = await readFile(new URL(`../public${icon.src}`, import.meta.url));
    assert.deepEqual(iconDimensions(bytes), dimensions);
  }
  assert.equal(manifest.icons.length, expected.size);
  assert.equal(manifest.icons.find((icon) => icon.purpose === 'maskable')?.src, '/tanooki-maskable-v2-512.png');
  assert.deepEqual(iconDimensions(await readFile(new URL('../public/tanooki-icon-v2-16.png', import.meta.url))), [16, 16]);
  assert.deepEqual(iconDimensions(await readFile(new URL('../public/tanooki-icon-v2-32.png', import.meta.url))), [32, 32]);
  assert.deepEqual(iconDimensions(await readFile(new URL('../public/tanooki-apple-touch-icon-v2.png', import.meta.url))), [180, 180]);
  assert.match(serviceWorker, /const CACHE_NAME = 'noted-v2'/);
  for (const iconPath of [...expected.keys(), '/tanooki-apple-touch-icon-v2.png', '/tanooki-icon-v2-16.png', '/tanooki-icon-v2-32.png']) {
    assert.ok(serviceWorker.includes(`'${iconPath}'`), `service worker should precache ${iconPath}`);
    await access(new URL(`../public${iconPath}`, import.meta.url));
  }
});

test('PWA launch and display metadata stay unchanged', () => {
  assert.equal(manifest.name, 'Tanooki — Ghi chú của bạn');
  assert.equal(manifest.short_name, 'Tanooki');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.theme_color, '#C94A3D');
  assert.equal(manifest.background_color, '#ffffff');
});
