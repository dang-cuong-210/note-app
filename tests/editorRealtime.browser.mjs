// Isolated real React hook/editor + IndexedDB. Supabase transport is mocked;
// this verifies client wiring, not hosted Realtime or RLS authorization.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const { chromium } = createRequire(import.meta.url)('playwright');
const resolve = (path) => fileURLToPath(new URL(path, import.meta.url));
const output = await build({
  configFile: false, plugins: [react()], logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"' },
  resolve: { alias: [
    { find: '@/lib/supabase', replacement: resolve('./browser/supabase.mock.mjs') },
    { find: '@', replacement: resolve('../src') },
  ] },
  build: { write: false, minify: false,
    lib: { entry: resolve('./browser/editor.fixture.mjs'), formats: ['iife'], name: 'NotedTest' } },
});
const bundle = Array.isArray(output) ? output[0] : output;
const script = bundle.output.find((item) => item.type === 'chunk').code;
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/test.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/test.js' ? script : '<!doctype html><div id="root"></div><script src="/test.js"></script>');
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.testHarness?.data.loaded &&
    window.testHarness.channels.has('attachments-sync:account-a'));
  const subscription = await page.evaluate(() => ({
    calls: window.testHarness.calls,
    filter: window.testHarness.channels.get('attachments-sync:account-a').filter,
  }));
  assert.equal(subscription.filter.filter, 'user_id=eq.account-a');
  assert.equal(subscription.filter.table, 'attachments');
  assert.ok(subscription.calls.indexOf('setAuth') < subscription.calls.indexOf('channel:attachments-sync:account-a'));
  assert.ok(subscription.calls.includes('filter:attachments:user_id:account-a'));
  for (const attachmentFirst of [false, true]) {
    await page.evaluate((first) => {
      const h = window.testHarness;
      const id = first ? 'attachment-first' : 'note-first';
      const row = { id, user_id: 'account-a', note_id: 'note-1', name: `${id}.pdf`,
        type: 'application/pdf', size: 10, storage_path: `account-a/${id}`, url: null, created_at: 1 };
      const note = { ...h.tables.notes[0], revision: first ? 3 : 2, updated_at: first ? 3 : 2,
        content: `<p><span data-noted-attachment-id="${id}" contenteditable="false"><span class="noted-inline-attachment-name">pending</span></span></p>` };
      h.tables.notes = [note];
      h.tables.attachments.push(row);
      const attachmentEvent = () => h.channels.get('attachments-sync:account-a').callback({ eventType: 'INSERT', new: row, old: {} });
      const noteEvent = () => h.channels.get('notes-sync:account-a').callback({ eventType: 'UPDATE', new: note, old: {} });
      window.testHarness.secondEvent = first ? noteEvent : attachmentEvent;
      (first ? attachmentEvent : noteEvent)();
    }, attachmentFirst);
    // Separate React commits, rather than delivering both events in one batch.
    await page.waitForFunction((first) => first
      ? window.testHarness.data.attachments.some((a) => a.id === 'attachment-first')
      : window.testHarness.data.notes[0]?.revision === 2, attachmentFirst);
    if (!attachmentFirst) {
      await page.waitForFunction(() => document.querySelector('[data-noted-attachment-id="note-first"]')?.classList.contains('noted-attachment-missing'));
    }
    await page.evaluate(() => window.testHarness.secondEvent());
    const id = attachmentFirst ? 'attachment-first' : 'note-first';
    await page.waitForFunction((id) => {
      const card = document.querySelector(`[data-noted-attachment-id="${id}"]`);
      return card && !card.classList.contains('noted-attachment-missing') && card.title !== 'File unavailable' && card.textContent.includes(`${id}.pdf`);
    }, id);
  }
  await page.evaluate(() => {
    const h = window.testHarness;
    const row = { ...h.tables.attachments[1], name: 'renamed.pdf' };
    h.channels.get('attachments-sync:account-a').callback({ eventType: 'UPDATE', new: row, old: {} });
  });
  await page.waitForFunction(() => document.querySelector('[data-noted-attachment-id="attachment-first"]')?.textContent.includes('renamed.pdf'));
  await page.evaluate(() => window.testHarness.channels.get('attachments-sync:account-a').callback({
    eventType: 'DELETE', new: {}, old: { id: 'attachment-first', user_id: 'account-a' },
  }));
  await page.waitForFunction(() => !window.testHarness.data.attachments.some((a) => a.id === 'attachment-first'));
  await page.waitForFunction(() => document.querySelector('[data-noted-attachment-id="attachment-first"]')?.classList.contains('noted-attachment-missing'));
  assert.deepEqual(errors, []);
  console.log('PASS: authenticated/filter wiring, note-first and attachment-first editor hydration, rename and receiver delete; no page errors.');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
