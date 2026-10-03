// Optional real browser regression: use separately available Playwright.
// PLAYWRIGHT_CHANNEL=msedge uses installed Edge. No Supabase or user data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const { chromium } = createRequire(import.meta.url)('playwright');
const path = (value) => fileURLToPath(new URL(value, import.meta.url));
const result = await build({ configFile: false, plugins: [react()], logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"' },
  resolve: { alias: { '@': path('../src') } },
  build: { write: false, minify: false,
    lib: { entry: path('./browser/sidebar.fixture.mjs'), formats: ['iife'], name: 'SidebarTest' } },
});
const bundle = Array.isArray(result) ? result[0] : result;
const js = bundle.output.find((item) => item.type === 'chunk').code;
const css = bundle.output.filter((item) => item.type === 'asset' && item.fileName.endsWith('.css')).map((item) => item.source).join('\n');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : req.url === '/test.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/test.js' ? js : req.url === '/test.css' ? css
    : '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>');
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1000, height: 800 }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const activate = (locator) => touch ? locator.tap() : locator.click();
    const trigger = (name) => page.getByRole('button', { name, exact: true }).locator('..').locator('button').nth(1);
    const rename = page.getByRole('button', { name: 'Rename', exact: true });
    const remove = page.getByRole('button', { name: 'Delete folder', exact: true });
    await activate(trigger('Inbox'));
    await rename.waitFor({ state: 'visible' });
    await activate(rename);
    const input = page.locator('input:not([type="search"])');
    await input.waitFor({ state: 'visible' });
    assert.equal(await input.inputValue(), 'Inbox');
    await input.fill('Renamed');
    await input.press('Enter');
    await page.getByRole('button', { name: 'Renamed', exact: true }).waitFor();
    assert.ok((await page.evaluate(() => window.sidebarCalls.renames)).some((call) => call.id === 'inbox' && call.name === 'Renamed'));
    // Both cancellation and confirmation must reach the existing confirm path.
    for (const accept of [false, true]) {
      await activate(trigger('Renamed'));
      const dialogHandled = new Promise((resolve, reject) => page.once('dialog', async (dialog) => {
        try {
          assert.equal(dialog.type(), 'confirm');
          assert.ok(dialog.message().includes('Delete "Renamed"'));
          await (accept ? dialog.accept() : dialog.dismiss()); resolve();
        } catch (error) { reject(error); }
      }));
      await activate(remove);
      // A bounded dialog wait makes the pre-fix unmount regression fail promptly.
      let timeout;
      try { await Promise.race([dialogHandled, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Delete confirmation never opened')), 3000); })]); }
      finally { clearTimeout(timeout); }
      assert.deepEqual(await page.evaluate(() => window.sidebarCalls.deletes), accept ? ['inbox'] : []);
      await remove.waitFor({ state: 'hidden' });
    }
    await activate(trigger('Renamed'));
    await rename.waitFor({ state: 'visible' });
    await activate(page.getByRole('button', { name: 'Outside', exact: true }));
    await rename.waitFor({ state: 'hidden' });
    // The active trigger is inside the interaction boundary: its click closes
    // the menu once, rather than pointerdown closing and click reopening it.
    await activate(trigger('Renamed'));
    await activate(trigger('Renamed'));
    await rename.waitFor({ state: 'hidden' });
    // Switch upward so the open dropdown does not cover the next trigger.
    await activate(trigger('Other'));
    await activate(trigger('Renamed'));
    await activate(rename);
    assert.equal(await input.inputValue(), 'Renamed');
    assert.deepEqual(await page.evaluate(() => window.sidebarCalls.navigation), []);
    assert.deepEqual(errors, []);
    console.log(`PASS: ${touch ? 'simulated touch (390x844)' : 'desktop mouse'} menu rename, confirm/cancel delete, outside dismissal, trigger toggle and folder switching.`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
