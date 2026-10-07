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
  resolve: { preserveSymlinks: process.env.VITE_TEST_PRESERVE_SYMLINKS === '1', alias: { '@': path('../src') } },
  build: { write: false, minify: false,
    lib: { entry: path('./browser/auth.fixture.mjs'), formats: ['iife'], name: 'AuthTest' } },
});
const bundle = Array.isArray(result) ? result[0] : result;
const js = bundle.output.find((item) => item.type === 'chunk').code;
const css = bundle.output.filter((item) => item.type === 'asset' && item.fileName.endsWith('.css')).map((item) => item.source).join('\n');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : req.url === '/test.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/test.js' ? js : req.url === '/test.css' ? css
    : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>');
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  for (const [width, height] of [[1440,900], [1280,720], [1024,600], [390,844], [360,640], [390,360]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByLabel('Email', { exact: true }).fill('test@example.com');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    assert.equal(await page.getByLabel('Mật khẩu', { exact: true }).getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Đang xử lý…' }).isDisabled(), true);
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    assert.equal(await page.evaluate(() => window.authCalls.length), 1);
    await page.evaluate(() => window.finishAuth());
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /không đúng/);
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password');
    await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('different-password');
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    assert.match(await page.getByRole('alert').innerText(), /chưa khớp/);
    assert.equal(await page.evaluate(() => window.authCalls.length), 1);
    await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('test-password');
    await page.evaluate(() => { window.authResult = null; });
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.authCalls[1]), { method: 'signup', email: 'test@example.com', password: 'test-password' });
    await page.evaluate(() => window.finishAuth());
    await page.getByRole('status').waitFor();
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.evaluate(() => window.finishAuth());
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.evaluate(() => { window.authResult = 'throw'; });
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.evaluate(() => window.finishAuth());
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /kết nối/);
    await page.screenshot({ path: `../tanooki-auth-${width}x${height}.png`, fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    assert.equal(await page.locator('.tanooki-auth').evaluate(el => getComputedStyle(el).color), 'rgb(247, 243, 236)');
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}x${height}: no overflow; visibility, submit guard, error, signup validation/call, success, network error, dark tokens.`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
