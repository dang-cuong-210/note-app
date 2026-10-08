import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared Tanooki mark uses the same fixed paper surface without halos', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const brand = await readFile(new URL('../src/components/TanookiBrand.tsx', import.meta.url), 'utf8');
  const sidebar = await readFile(new URL('../src/components/DesktopSidebar.tsx', import.meta.url), 'utf8');
  const mobileHome = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../src/components/AuthScreen.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(css, /\.dark\s+\.tanooki-mark/);
  assert.doesNotMatch(css, /tanooki-mobile-home-brand\s+\.tanooki-mark\s*\{[^}]*background/i);
  assert.match(css, /\.tanooki-logo-surface\s*\{[^}]*background:\s*#fff/i);
  assert.match(css, /\.dark\s+\.tanooki-logo-surface\s*\{\s*background:\s*#fff;\s*\}/i);
  assert.match(css, /\.tanooki-mark\s*\{[^}]*filter:\s*none;\s*mix-blend-mode:\s*normal;/i);
  assert.match(brand, /className="tanooki-logo-surface"/);
  assert.match(brand, /srcSet="\/brand\/tanooki-mark\.svg"/);
  assert.match(brand, /src="\/brand\/tanooki-mark\.png"/);
  assert.match(auth, /<TanookiBrand\s*\/>/);
  assert.match(sidebar, /<TanookiMark\s*\/>/);
  assert.match(mobileHome, /<TanookiMark\s*\/>/);
});
