import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map((m) => [m[1], m[2]]));
const light = { ...tokens(css.match(/:root\s*\{([^}]+)\}/)[1]), '--bg': '#FFFFFF', '--bg-secondary': '#F7F3EC' };
const dark = tokens(css.match(/\.dark\s*\{([^}]+)\}/)[1]);
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
for (const [theme, values] of [['light', light], ['dark', dark]]) {
  test(`${theme}: secondary text retains AA contrast across workspace surfaces and states`, () => {
    for (const fg of ['--text-secondary', '--text-tertiary']) {
      for (const bg of ['--bg', '--bg-secondary', '--bg-tertiary', '--bg-hover', '--bg-active']) {
        assert.ok(ratio(values[fg], values[bg]) >= 4.5, `${theme} ${fg}/${bg}: ${ratio(values[fg], values[bg])}`);
      }
    }
  });
}
test('primary action labels retain AA contrast in both themes', () => {
  for (const values of [light, dark]) assert.ok(ratio(values['--on-accent'], values['--accent'] || values['--tanooki-red']) >= 4.5);
});
