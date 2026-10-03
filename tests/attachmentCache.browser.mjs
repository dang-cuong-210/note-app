// Optional real IndexedDB verification. Install Playwright separately, then run:
// node tests/attachmentCache.browser.mjs (PLAYWRIGHT_CHANNEL=msedge is supported).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import ts from 'typescript';

const { chromium } = createRequire(import.meta.url)('playwright');
const modules = new Map();
for (const name of ['db', 'attachmentSync']) {
  const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  modules.set(`/${name}.js`, ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText);
}
const server = createServer((request, response) => {
  response.setHeader('Content-Type', modules.has(request.url) ? 'text/javascript' : 'text/html');
  response.end(modules.get(request.url) ?? '<!doctype html><title>Isolated attachment cache test</title>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  // Fresh ephemeral context: never reads or clears the user's browser profile.
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const cache = await import('/db.js');
    const { createAttachmentSync, mapAttachment } = await import('/attachmentSync.js');
    const row = (id, owner, name = 'test.pdf') => ({ id, user_id: owner, note_id: 'note',
      name, type: 'application/pdf', size: 10, storage_path: `${owner}/${id}`, url: null, created_at: 1 });
    const foreign = mapAttachment(row('same-id', 'account-b', 'foreign.pdf'));
    await cache.putAttachment('account-b', foreign);
    await cache.putAttachment('account-a', mapAttachment(row('stale', 'account-a')));
    let visible = [];
    const failures = [];
    const sync = createAttachmentSync('account-a', cache, (values) => { visible = values; },
      (error) => failures.push(String(error)));
    const snapshot = sync.beginSnapshot();
    sync.receive({ eventType: 'INSERT', new: row('same-id', 'account-a'), old: {} });
    sync.receive({ eventType: 'UPDATE', new: row('same-id', 'account-a', 'renamed.pdf'), old: {} });
    sync.applySnapshot([], snapshot);
    await sync.settled();
    const afterRename = await cache.getAllAttachments('account-a');
    const visibleAfterRename = visible.map((value) => value.name);
    const rejected = sync.receive({ eventType: 'DELETE', new: {}, old: { id: 'same-id', user_id: 'account-b' } });
    sync.receive({ eventType: 'DELETE', new: {}, old: { id: 'same-id' } });
    await sync.settled();
    const afterDelete = await cache.getAllAttachments('account-a');
    const otherAccount = await cache.getAllAttachments('account-b');
    sync.dispose();
    return { afterRename, visibleAfterRename, rejected, afterDelete, otherAccount, failures };
  });
  assert.deepEqual(result.visibleAfterRename, ['renamed.pdf']);
  assert.deepEqual(result.afterRename.map((value) => value.name), ['renamed.pdf']);
  assert.equal(result.rejected, false);
  assert.deepEqual(result.afterDelete, []);
  assert.deepEqual(result.otherAccount.map((value) => value.name), ['foreign.pdf']);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(errors, []);
  console.log('PASS: real IndexedDB event persistence, stale-row pruning, account isolation and receiver delete; no page errors.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
