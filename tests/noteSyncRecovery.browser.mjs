// Exercise useAppData with real React and IndexedDB, while replacing only the
// Supabase transport with a controlled CAS/Realtime test server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const { chromium } = createRequire(import.meta.url)('playwright');
const resolve = (path) => fileURLToPath(new URL(path, import.meta.url));
const output = await build({
  configFile: false,
  plugins: [react()],
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"' },
  resolve: { preserveSymlinks: true, alias: [
    { find: '@/lib/supabase', replacement: resolve('./browser/noteSyncRecovery.mock.mjs') },
    { find: '@', replacement: resolve('../src') },
  ] },
  build: { write: false, minify: false,
    lib: { entry: resolve('./browser/noteSyncRecovery.fixture.mjs'), formats: ['iife'], name: 'NoteSyncRecoveryTest' } },
});
const bundle = Array.isArray(output) ? output[0] : output;
const script = bundle.output.find((item) => item.type === 'chunk').code;
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><div id="root"></div><script>${script}</script>`);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;

const baseline = (id = 'note-1', overrides = {}) => ({
  id, user_id: 'account-a', title: 'Remote title', content: '<p>remote body</p>',
  folder_id: null, pinned: false, archived: false, trashed: false, trashed_at: null,
  created_at: 100, updated_at: 200, revision: 4, ...overrides,
});

async function newPage() {
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => !!window.testHarness?.data);
  return page;
}

async function start(page) {
  await page.evaluate(() => window.testHarness.start('account-a'));
}

try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });

  // Normal online edits and new-note creation both use CAS (existing revision / -1).
  {
    const page = await newPage();
    await page.evaluate((row) => { window.testHarness.controls.notes = [row]; }, baseline());
    await start(page);
    await page.waitForFunction(() => window.testHarness.data.loaded && window.testHarness.data.notes.length === 1);
    await page.evaluate(() => window.testHarness.data.updateNoteContent('note-1', 'Edited online', '<p>latest online</p>'));
    await page.waitForFunction(() => window.testHarness.controls.notes[0]?.content === '<p>latest online</p>');
    const existingWrite = await page.evaluate(() => window.testHarness.rpcCalls.find((call) => call.name === 'save_note_versioned'));
    assert.equal(existingWrite.args.p_expected_revision, 4);

    const created = await page.evaluate(() => {
      const note = window.testHarness.data.addNote();
      window.testHarness.data.updateNoteContent(note.id, 'New online', '<p>created online</p>');
      return note.id;
    });
    await page.waitForFunction((id) => window.testHarness.controls.notes.some((note) => note.id === id), created);
    const creationWrite = await page.evaluate((id) => window.testHarness.rpcCalls.find((call) => call.args?.p_note?.id === id), created);
    assert.equal(creationWrite.args.p_expected_revision, -1);
    assert.equal(await page.evaluate(() => window.testHarness.data.syncConflicts), 0);
    await page.close();
  }

  // Cloud-not-ready edits are held locally; successful load explicitly flushes
  // several recovered drafts sequentially, including creation semantics.
  {
    const page = await newPage();
    await page.evaluate((row) => {
      const h = window.testHarness;
      h.controls.notes = [row];
      h.controls.blockNextNoteLoad = true;
      h.start('account-a');
    }, baseline());
    await page.waitForFunction(() => window.testHarness.controls.notesLoadBlocked);
    const ids = await page.evaluate(() => Array.from({ length: 3 }, (_, index) => {
      const note = window.testHarness.data.addNote();
      window.testHarness.data.updateNoteContent(note.id, `Draft ${index}`, `<p>pending ${index}</p>`);
      return note.id;
    }));
    await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => window.testHarness.rpcCalls.filter((call) => call.name === 'save_note_versioned').length), 0);
    await page.evaluate(() => window.testHarness.controls.releaseNoteLoad());
    await page.waitForFunction((noteIds) => noteIds.every((id) => window.testHarness.controls.notes.some((note) => note.id === id)), ids);
    const writes = await page.evaluate((noteIds) => noteIds.map((id) => window.testHarness.rpcCalls.find((call) => call.args?.p_note?.id === id)), ids);
    assert.deepEqual(writes.map((write) => write.args.p_expected_revision), [-1, -1, -1]);
    assert.equal(await page.evaluate(() => window.testHarness.controls.maxNoteRpcConcurrency), 1);
    assert.equal(await page.evaluate(() => window.testHarness.data.syncConflicts), 0);
    await page.close();
  }

  // A recovered IndexedDB draft survives an initial cloud failure. Editing it
  // while cloudReady is false and returning online flushes it against fresh CAS state.
  {
    const page = await newPage();
    await page.evaluate(async (row) => {
      const h = window.testHarness;
      h.controls.notes = [row];
      h.controls.failNextNoteLoad = true;
      await h.cache.putNote('account-a', {
        id: row.id, title: 'Local recovered title', content: '<p>local recovered</p>',
        folderId: null, pinned: false, archived: false, trashed: false, trashedAt: null,
        createdAt: 100, updatedAt: 300, revision: row.revision, syncPending: true,
      });
      h.start('account-a');
    }, baseline());
    await page.waitForFunction(() => window.testHarness.data.loaded && window.testHarness.data.notes[0]?.title === 'Local recovered title');
    await page.evaluate(() => window.testHarness.data.updateNoteContent('note-1', 'Recovered then edited', '<p>edited while cloud unavailable</p>'));
    await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => window.testHarness.rpcCalls.filter((call) => call.name === 'save_note_versioned').length), 0);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => window.testHarness.controls.notes[0]?.content === '<p>edited while cloud unavailable</p>');
    const write = await page.evaluate(() => window.testHarness.rpcCalls.find((call) => call.name === 'save_note_versioned'));
    assert.equal(write.args.p_expected_revision, 4);
    assert.equal(await page.evaluate(() => window.testHarness.data.syncConflicts), 0);
    await page.close();
  }

  // Offline edits remain in IndexedDB until the online lifecycle refreshes CAS
  // revisions and resumes the pending draft without another user edit.
  {
    const page = await newPage();
    await page.evaluate((row) => { window.testHarness.controls.notes = [row]; }, baseline());
    await start(page);
    await page.waitForFunction(() => window.testHarness.data.loaded);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.testHarness.data.updateNoteContent('note-1', 'Offline title', '<p>offline edit</p>');
    });
    await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => window.testHarness.rpcCalls.filter((call) => call.name === 'save_note_versioned').length), 0);
    const cached = await page.evaluate(() => window.testHarness.cache.getAllNotes('account-a'));
    assert.equal(cached[0].syncPending, true);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
    });
    await page.waitForFunction(() => window.testHarness.controls.notes[0]?.content === '<p>offline edit</p>');
    assert.equal(await page.evaluate(() => window.testHarness.data.syncConflicts), 0);
    await page.close();
  }

  // Genuine stale-revision races still create one conflict copy via CAS;
  // a pending note already being permanently deleted is never uploaded.
  {
    const conflictPage = await newPage();
    await conflictPage.evaluate(async (row) => {
      const h = window.testHarness;
      h.controls.notes = [row];
      await h.cache.putNote('account-a', {
        id: row.id, title: 'Stale local', content: '<p>stale local</p>', folderId: null,
        pinned: false, archived: false, trashed: false, trashedAt: null,
        createdAt: 100, updatedAt: 300, revision: row.revision - 1, syncPending: true,
      });
      h.start('account-a');
    }, baseline());
    await conflictPage.waitForFunction(() => window.testHarness.data.notes.some((note) => note.title.includes('(conflict copy)')));
    assert.equal(await conflictPage.evaluate(() => window.testHarness.rpcCalls.filter((call) => call.args?.p_note?.title.includes('(conflict copy)') && call.args.p_expected_revision === -1).length), 1);
    await conflictPage.close();

    const deletePage = await newPage();
    await deletePage.evaluate((row) => { window.testHarness.controls.notes = [row]; }, baseline());
    await start(deletePage);
    await deletePage.waitForFunction(() => window.testHarness.data.loaded);
    const deletedId = await deletePage.evaluate(() => window.testHarness.data.addNote().id);
    deletePage.evaluate((id) => window.testHarness.data.permanentDelete(id), deletedId).catch(() => {});
    await deletePage.waitForFunction(() => window.testHarness.data.notes.length === 1);
    assert.equal(await deletePage.evaluate((id) => window.testHarness.rpcCalls.some((call) => call.args?.p_note?.id === id), deletedId), false);
    await deletePage.close();
  }

  console.log('PASS: normal and deferred CAS saves, cloud-ready recovery, offline reconnect, recovered IndexedDB draft, sequential multi-note flushing, genuine conflict preservation, and delete exclusion.');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
