import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  cleanupExpiredTrashedNotes,
  isExpiredTrashedNote,
  TRASH_RETENTION_MS,
} from '../src/lib/trashRetention.js';

const expired = (id, trashedAt = 1_000) => ({ id, trashed: true, trashedAt });

test('trash retention keeps notes until seven full days have elapsed', () => {
  const now = 1_000 + TRASH_RETENTION_MS;
  assert.equal(isExpiredTrashedNote(expired('recent', now - TRASH_RETENTION_MS + 1), now), false);
  assert.equal(isExpiredTrashedNote(expired('boundary'), 1_000 + TRASH_RETENTION_MS - 1), false);
  assert.equal(isExpiredTrashedNote(expired('boundary'), now), true);
  assert.equal(isExpiredTrashedNote(expired('older'), now + 1), true);
});
test('restored notes and missing or invalid trash timestamps are never eligible', () => {
  const now = 1_000 + TRASH_RETENTION_MS * 3;
  assert.equal(isExpiredTrashedNote({ ...expired('restored'), trashed: false, trashedAt: null }, now), false);
  assert.equal(isExpiredTrashedNote({ id: 'missing', trashed: true }, now), false);
  assert.equal(isExpiredTrashedNote({ ...expired('null'), trashedAt: null }, now), false);
  assert.equal(isExpiredTrashedNote({ ...expired('invalid'), trashedAt: Number.NaN }, now), false);
});

test('multiple expired notes are deleted sequentially and one failure does not stop others', async () => {
  const notes = [expired('a'), expired('b'), expired('c')];
  const events = [];
  let active = 0;
  const result = await cleanupExpiredTrashedNotes(notes, {
    now: 1_000 + TRASH_RETENTION_MS,
    isOnline: () => true,
    permanentDelete: async (id) => {
      active += 1;
      assert.equal(active, 1);
      events.push(`start:${id}`);
      await Promise.resolve();
      active -= 1;
      if (id === 'b') throw new Error('delete failed');
      events.push(`done:${id}`);
    },
    onFailure: (id) => events.push(`failed:${id}`),
  });

  assert.deepEqual(result.deletedIds, ['a', 'c']);
  assert.deepEqual(result.failedIds, ['b']);
  assert.deepEqual(events, ['start:a', 'done:a', 'start:b', 'failed:b', 'start:c', 'done:c']);
});

test('offline cleanup leaves expired notes untouched', async () => {
  let deleteCalls = 0;
  const result = await cleanupExpiredTrashedNotes([expired('offline')], {
    now: 1_000 + TRASH_RETENTION_MS,
    isOnline: () => false,
    permanentDelete: async () => { deleteCalls += 1; },
  });
  assert.equal(deleteCalls, 0);
  assert.deepEqual(result, { deletedIds: [], failedIds: [], stoppedOffline: true });
});

test('cleanup rechecks restore state and App waits for the signed-in account data', async () => {
  let deleteCalls = 0;
  const result = await cleanupExpiredTrashedNotes([expired('restored-before-delete')], {
    now: 1_000 + TRASH_RETENTION_MS,
    isOnline: () => true,
    isStillExpired: () => false,
    permanentDelete: async () => { deleteCalls += 1; },
  });
  assert.equal(deleteCalls, 0);
  assert.deepEqual(result.deletedIds, []);

  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(!user\?\.id \|\| !accountDataLoaded\)/);
  assert.match(app, /permanentDelete: \(id\) => permanentDelete\(id\)/);
  assert.match(app, /window\.setTimeout\(\(\) =>/);
  assert.match(app, /window\.clearTimeout\(cleanupTimer\)/);
});
