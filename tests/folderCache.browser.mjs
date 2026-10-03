// Optional: Playwright must be available; PLAYWRIGHT_CHANNEL=msedge uses Edge.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import ts from 'typescript';
const { chromium } = createRequire(import.meta.url)('playwright');
const modules = new Map();
for (const name of ['db', 'folderSync']) {
  modules.set(`/${name}.js`, ts.transpileModule(await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText);
}
modules.set('/scenarios.js', await readFile(new URL('./folderScenarios.mjs', import.meta.url), 'utf8'));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', modules.has(req.url) ? 'text/javascript' : 'text/html');
  res.end(modules.get(req.url) ?? '<!doctype html><title>Disposable folder queue verification</title>');
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  // Upgrade a real v3 database with a pending note. Never use a user profile.
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('noted-db', 3);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore('user-notes', { keyPath: 'scopedId' });
        store.createIndex('accountId', 'accountId');
        store.put({ scopedId: 'upgrade:note', accountId: 'upgrade', id: 'note', content: 'preserve me', syncPending: true, revision: 3 });
      };
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
    });
  });
  const passed = await page.evaluate(async () => {
    const cache = await import('/db.js');
    const { createFolderSync } = await import('/folderSync.js');
    const { folderScenarios } = await import('/scenarios.js');
    const results = [];
    for (const [name, run] of folderScenarios(createFolderSync, cache)) { await run(); results.push(name); }
    const note = (await cache.getAllNotes('upgrade'))[0];
    if (note.content !== 'preserve me' || !note.syncPending || note.revision !== 3) throw new Error('Upgrade modified pending note');
    const sync = createFolderSync('page-reload', cache, async () => { throw new Error('offline'); }, () => {}, () => {});
    await sync.ready;
    await sync.save({ id: 'reload-folder', name: 'survives real reload', parentId: null, createdAt: 1 });
    return results;
  });
  await page.reload();
  const recovered = await page.evaluate(async () => {
    const cache = await import('/db.js');
    const { createFolderSync } = await import('/folderSync.js');
    let names = [];
    let sent = null;
    const sync = createFolderSync('page-reload', cache, async (op) => {
      sent = op;
      return { status: 'saved', folder: { ...op.value, revision: 0, deleted: false, operationId: op.id } };
    }, (folders) => { names = folders.map((f) => f.name); }, () => {});
    await sync.ready;
    const before = [...names];
    await sync.snapshot([], sync.beginSnapshot());
    await sync.flush();
    return { before, name: sent?.value.name, expected: sent?.expected };
  });
  assert.deepEqual(recovered.before, ['survives real reload']);
  assert.equal(recovered.name, 'survives real reload');
  assert.equal(recovered.expected, -1);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${passed.length} folder queue scenarios in real IndexedDB, v3 upgrade preserves pending notes, actual page reload recovery; no page errors.`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
