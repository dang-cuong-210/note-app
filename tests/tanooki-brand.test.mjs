import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared Tanooki mark switches to the dedicated dark asset without visual workarounds', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const brand = await readFile(new URL('../src/components/TanookiBrand.tsx', import.meta.url), 'utf8');
  const sidebar = await readFile(new URL('../src/components/DesktopSidebar.tsx', import.meta.url), 'utf8');
  const mobileHome = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../src/components/AuthScreen.tsx', import.meta.url), 'utf8');
  const darkAsset = await readFile(new URL('../public/brand/tanooki-mark-dark.png', import.meta.url));

  const markRule = css.match(/\.tanooki-mark\s*\{[^}]*\}/i)?.[0] ?? '';
  assert.doesNotMatch(css, /tanooki-logo-surface|\.dark\s+\.tanooki-mark/i);
  assert.doesNotMatch(markRule, /background|filter|mix-blend-mode|box-shadow/i);
  assert.match(brand, /className="tanooki-mark"/);
  assert.match(brand, /document\.documentElement\.classList\.contains\('dark'\)/);
  assert.match(brand, /src="\/brand\/tanooki-mark-dark\.png"/);
  assert.match(brand, /srcSet="\/brand\/tanooki-mark\.svg"/);
  assert.match(brand, /src="\/brand\/tanooki-mark\.png"/);
  assert.match(brand, /new MutationObserver\(updateTheme\)/);
  assert.deepEqual([...darkAsset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(darkAsset.readUInt32BE(16), 1254);
  assert.equal(darkAsset.readUInt32BE(20), 1254);
  assert.equal(darkAsset[25], 6, 'dark asset retains an alpha channel');
  assert.match(auth, /<TanookiBrand\s*\/>/);
  assert.match(sidebar, /<TanookiMark\s*\/>/);
  assert.match(mobileHome, /<TanookiMark\s*\/>/);
});
