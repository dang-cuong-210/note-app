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
  // Folder deletion must move notes through the existing note CAS even when the
  // folder RPC fails. The real hook and both real IndexedDB queues are in use.
  await page.evaluate(() => {
    const h = window.testHarness;
    const folder = { id: 'delete-folder', user_id: 'account-a', name: 'Disposable folder',
      parent_id: null, created_at: 1, revision: 0, deleted: false, last_operation: null };
    h.tables.folders = [folder];
    h.channels.get('folders-sync:account-a').callback({ eventType: 'INSERT', new: folder, old: {} });
    const note = { ...h.tables.notes[0], folder_id: folder.id, revision: 4, updated_at: 4 };
    h.tables.notes = [note];
    h.channels.get('notes-sync:account-a').callback({ eventType: 'UPDATE', new: note, old: {} });
  });
  await page.waitForFunction(() => window.testHarness.data.folders.some((f) => f.id === 'delete-folder') &&
    window.testHarness.data.notes[0]?.folderId === 'delete-folder');
  await page.evaluate(() => window.testHarness.data.removeFolder('delete-folder'));
  await page.waitForFunction(() => window.testHarness.data.notes[0]?.folderId === null);
  await page.evaluate(() => window.testHarness.data.flushAll());
  const deletion = await page.evaluate(async () => {
    const h = window.testHarness;
    const cached = await h.cache.getAllNotes('account-a');
    const folders = await h.cache.changeFolderRecords('account-a', (rows) => rows);
    return { calls: h.rpcCalls, note: cached[0], pending: folders.find((f) => f.id === 'delete-folder')?.pending,
      serverNote: h.tables.notes[0] };
  });
  assert.ok(deletion.calls.some((c) => c.name === 'save_note_versioned' && c.args.p_expected_revision === 4 && c.args.p_note.folder_id === null));
  assert.ok(deletion.calls.some((c) => c.name === 'write_folder_versioned' && c.args.p_delete && c.args.p_account === 'account-a'));
  assert.equal(deletion.pending.kind, 'delete');
  assert.equal(deletion.note.folderId, null);
  assert.equal(deletion.note.content, deletion.serverNote.content);
  assert.equal(deletion.serverNote.revision, 5);
  assert.equal(deletion.note.syncPending, false);
  await page.evaluate(async () => {
    const h = window.testHarness;
    h.tables.folders[0] = { ...h.tables.folders[0], name: 'Remote rename', revision: 1 };
    h.controls.folderFailure = false;
    await h.data.flushAll();
  });
  await page.getByRole('button', { name: 'Use server version', exact: true }).click();
  await page.waitForFunction(() => window.testHarness.data.folderConflicts.length === 0 &&
    window.testHarness.data.folders.some((f) => f.name === 'Remote rename'));
  await page.evaluate(() => {
    const h = window.testHarness; h.controls.folderFailure = true;
    h.data.renameFolder('delete-folder', 'Local rename');
  });
  await page.waitForFunction(() => window.testHarness.data.folders.some((f) => f.name === 'Local rename'));
  await page.evaluate(async () => {
    const h = window.testHarness;
    h.tables.folders[0] = { ...h.tables.folders[0], name: 'New remote rename', revision: 2 };
    h.controls.folderFailure = false;
    await h.data.flushAll();
  });
  await page.getByRole('button', { name: 'Save local as new folder', exact: true }).click();
  await page.waitForFunction(() => window.testHarness.data.folderConflicts.length === 0 &&
    window.testHarness.data.folders.some((f) => f.name === 'Local rename (conflict copy)'));
  assert.equal(await page.evaluate(() => window.testHarness.data.notes[0].folderId), null);
  await page.evaluate(() => {
    const h = window.testHarness;
    const copy = h.data.folders.find((f) => f.name.endsWith('(conflict copy)'));
    h.controls.folderFailure = true;
    h.data.renameFolder(copy.id, 'Private pending A');
  });
  await page.waitForFunction(() => window.testHarness.data.folders.some((f) => f.name === 'Private pending A'));
  await page.evaluate(() => window.testHarness.setAccount(null));
  await page.waitForFunction(() => !window.testHarness.data.loaded && window.testHarness.data.folders.length === 0);
  await page.evaluate(() => { window.testHarness.controls.account = 'account-b'; window.testHarness.setAccount('account-b'); });
  await page.waitForFunction(() => window.testHarness.data.loaded);
  assert.deepEqual(await page.evaluate(() => window.testHarness.data.folders), []);
  assert.deepEqual(await page.evaluate(() => window.testHarness.data.notes), []);
  await page.evaluate(() => { window.testHarness.controls.account = 'account-a'; window.testHarness.setAccount('account-a'); });
  await page.waitForFunction(() => window.testHarness.data.loaded && window.testHarness.data.folders.some((f) => f.name === 'Private pending A'));
  assert.deepEqual(errors, []);
  console.log('PASS: attachment regression, folder-delete note CAS, conflict actions, account A/logout/B/A isolation and pending recovery; no page errors.');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
