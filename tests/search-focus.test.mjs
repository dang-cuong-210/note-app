import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('only Tanooki global search inputs suppress the accent focus ring', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const focusRule = css.match(/input\[data-global-search\]:focus,[\s\S]*?\{([^}]+)\}/)?.[1] ?? '';

  assert.match(css, /\.tanooki-dashboard\s+:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\)/);
  assert.match(css, /\.tanooki-mobile-page\s+:focus-visible,[^}]+outline:\s*2px solid var\(--accent\)/);
  assert.match(focusRule, /outline:\s*none/);
  assert.match(focusRule, /box-shadow:\s*none/);
  assert.match(focusRule, /--tw-ring-shadow:\s*0 0 #0000/);
  assert.match(focusRule, /--tw-ring-offset-shadow:\s*0 0 #0000/);
  assert.match(focusRule, /--tw-shadow:\s*0 0 #0000/);
  assert.doesNotMatch(focusRule, /border-color|background/);
});
