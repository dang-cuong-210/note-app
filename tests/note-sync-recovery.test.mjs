import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/useAppData.ts', import.meta.url), 'utf8');
const between = (start, end) => hook.slice(hook.indexOf(start), hook.indexOf(end, hook.indexOf(start) + start.length));

test('pending flush requires the active account, network, and cloud readiness and reads current pending values sequentially', () => {
  const flush = between('const flushPendingNotesToCloud = useCallback', 'flushPendingNotesToCloudRef.current = flushPendingNotesToCloud;');
  assert.match(flush, /accountId !== userId/);
  assert.match(flush, /activeAccountId.current !== accountId/);
  assert.match(flush, /!navigator.onLine \|\| !cloudReadyRef.current/);
  assert.match(flush, /for \(const id of Array.from\(pendingNotes.current.keys\(\)\)\)/);
  assert.match(flush, /deletingNotes.current.has\(id\)/);
  assert.match(flush, /retryTimers.current.has\(id\)/);
  assert.match(flush, /const latest = pendingNotes.current.get\(id\)/);
  assert.match(flush, /await syncNoteToCloudRef.current\(latest\)/);
  assert.doesNotMatch(flush, /Promise\.all/);
});

test('successful cloud merge explicitly flushes recovered and in-flight drafts after revision bookkeeping and cache merge', () => {
  const load = between('const loadFromCloud = useCallback', 'loadFromCloudRef.current = loadFromCloud;');
  assert.ok(load.indexOf('cloudReadyRef.current = true') < load.indexOf('localDb.putNotes(accountId, mergedNotes)'));
  assert.ok(load.indexOf('localDb.putNotes(accountId, mergedNotes)') < load.indexOf('flushPendingNotesToCloudRef.current(accountId)'));
  assert.match(load, /pendingNotes\.current\.set\(ln\.id, ln\)/);
});

test('online recovery refreshes cloud revisions before flushing notes and keeps the folder queue flush', () => {
  const online = between('// Online/offline tracking', '// Migrate local IndexedDB data to cloud on first load');
  assert.match(online, /setOnline\(true\)/);
  assert.match(online, /loadFromCloudRef\.current\(\)/);
  assert.match(online, /flushPendingNotesToCloudRef\.current\(accountId\)/);
  assert.match(online, /folderSession\.flush\(\)/);
});

test('failed started requests retain a five-second backoff while early deferrals rely on lifecycle triggers', () => {
  const sync = between('const syncNoteToCloud = useCallback', 'const syncNoteToCloudRef = useRef(syncNoteToCloud);');
  assert.match(sync, /!navigator\.onLine \|\| !cloudReadyRef\.current/);
  assert.match(sync, /let retryRequired = false/);
  assert.match(sync, /retryRequired = true/);
  assert.match(sync, /}, 5000\)/);
  assert.match(sync, /retryTimers\.current\.set\(id, timer\)/);
  assert.doesNotMatch(sync.slice(0, sync.indexOf('const task = (async')), /5000/);
});

test('note writes keep CAS and Realtime pending-draft protection without direct table upsert', () => {
  const sync = between('const syncNoteToCloud = useCallback', 'const syncNoteToCloudRef = useRef(syncNoteToCloud);');
  const realtime = between(".channel(`notes-sync:${accountId}`)", ".channel(`folders-sync:${accountId}`)");
  assert.match(sync, /supabase\.rpc\('save_note_versioned'/);
  assert.match(sync, /p_expected_revision: expected/);
  assert.doesNotMatch(sync, /\.upsert\(/);
  assert.match(realtime, /pendingNotes\.current\.has\(note\.id\)/);
  assert.match(realtime, /knownRevision/);
});

test('flush-all delegates only pending drafts and does not cancel failed-request retry timers', () => {
  const flushAll = between('const flushAll = useCallback', '// Flush pending changes when the page is hidden or unloaded');
  assert.match(flushAll, /flushPendingNotesToCloud\(userId \?\? ''\)/);
  assert.doesNotMatch(flushAll, /saveTimers\.current\.forEach/);
  assert.doesNotMatch(flushAll, /retryTimers\.current\.forEach/);
});
