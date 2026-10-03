import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Use the project's existing TypeScript compiler; no additional test runtime.
const source = await readFile(new URL('../src/lib/attachmentSync.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { createAttachmentSync, mapAttachment } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

function row(id = 'file-1', user_id = 'account-a', name = 'notes.pdf') {
  return { id, user_id, name, note_id: 'note-1', type: 'application/pdf',
    size: '123', created_at: '456', storage_path: `${user_id}/note-1/${id}.pdf`, url: null };
}
function event(eventType, value) {
  return { eventType, new: eventType === 'DELETE' ? {} : value,
    old: eventType === 'DELETE' ? value : {} };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(accountId = 'account-a', shared = new Map(), overrides = {}) {
  let state = [];
  const calls = [];
  const errors = [];
  const cache = {
    async getAllAttachments(account) {
      return [...shared.values()].filter((entry) => entry.account === account).map((entry) => entry.value);
    },
    async putAttachment(account, value) {
      calls.push(['put', account, value.id]);
      shared.set(`${account}:${value.id}`, { account, value });
    },
    async deleteAttachmentRecord(account, id) {
      calls.push(['delete', account, id]);
      shared.delete(`${account}:${id}`);
    },
    async replaceAttachments(account, values) {
      calls.push(['replace', account]);
      for (const [key, entry] of shared) if (entry.account === account) shared.delete(key);
      for (const value of values) shared.set(`${account}:${value.id}`, { account, value });
    },
    ...overrides,
  };
  const sync = createAttachmentSync(accountId, cache, (next) => { state = next; }, (error) => errors.push(error));
  return { sync, cache, shared, calls, errors, get state() { return state; } };
}

test('owner INSERT/UPDATE/DELETE maps fields, deduplicates and persists without storage calls', async () => {
  const f = fixture();
  const inserted = row();
  f.sync.receive(event('INSERT', inserted));
  f.sync.receive(event('INSERT', inserted));
  assert.equal(f.state.length, 1);
  assert.equal(f.state[0].size, 123);
  assert.equal(f.state[0].createdAt, 456);
  f.sync.receive(event('UPDATE', { ...inserted, name: 'renamed.pdf' }));
  await f.sync.settled();
  assert.equal(f.state[0].name, 'renamed.pdf');
  assert.equal((await f.cache.getAllAttachments('account-a'))[0].name, 'renamed.pdf');
  f.sync.receive(event('DELETE', inserted));
  await f.sync.settled();
  assert.deepEqual(f.state, []);
  assert.deepEqual(await f.cache.getAllAttachments('account-a'), []);
  assert.deepEqual(f.calls.at(-1), ['delete', 'account-a', inserted.id]);
});

test('defensive account checks reject foreign rows and unowned INSERT/UPDATE', async () => {
  const shared = new Map();
  const a = fixture('account-a', shared);
  const b = fixture('account-b', shared);
  a.sync.receive(event('INSERT', row()));
  b.sync.receive(event('INSERT', row('file-1', 'account-b')));
  for (const type of ['INSERT', 'UPDATE', 'DELETE']) {
    assert.equal(a.sync.receive(event(type, row('file-1', 'account-b'))), false);
  }
  assert.equal(a.sync.receive(event('UPDATE', { ...row(), user_id: undefined })), false);
  a.sync.receive(event('DELETE', { id: 'file-1' })); // server-filtered PK-only DELETE
  await Promise.all([a.sync.settled(), b.sync.settled()]);
  assert.deepEqual(a.state, []);
  assert.equal((await b.cache.getAllAttachments('account-b')).length, 1);
});

test('pending snapshot cannot undo a received INSERT, rename or known/unknown DELETE', async () => {
  const f = fixture();
  const snapshot = f.sync.beginSnapshot();
  f.sync.receive(event('INSERT', row('inserted')));
  f.sync.receive(event('UPDATE', row('renamed', 'account-a', 'new.pdf')));
  f.sync.receive(event('DELETE', row('deleted')));
  f.sync.applySnapshot([mapAttachment(row('renamed')), mapAttachment(row('deleted'))], snapshot);
  assert.deepEqual(f.state.map((v) => [v.id, v.name]).sort(), [['inserted', 'notes.pdf'], ['renamed', 'new.pdf']]);
  await f.sync.settled();
  assert.deepEqual(await f.cache.getAllAttachments('account-a'), f.state);
});

test('newest refresh wins when cloud requests complete in reverse order', async () => {
  const f = fixture();
  const old = f.sync.beginSnapshot();
  const latest = f.sync.beginSnapshot();
  f.sync.applySnapshot([mapAttachment(row('new'))], latest);
  f.sync.applySnapshot([mapAttachment(row('old'))], old);
  await f.sync.settled();
  assert.deepEqual(f.state.map((v) => v.id), ['new']);
  assert.deepEqual(await f.cache.getAllAttachments('account-a'), f.state);
});

test('local upload echo is idempotent; a delayed response cannot resurrect a deleted file', async () => {
  const f = fixture();
  const start = f.sync.version;
  f.sync.receive(event('INSERT', row()));
  f.sync.upsert(mapAttachment(row()), start);
  assert.equal(f.state.length, 1);
  f.sync.receive(event('DELETE', row()));
  f.sync.upsert(mapAttachment(row()), start);
  await f.sync.settled();
  assert.deepEqual(f.state, []);
  assert.deepEqual(await f.cache.getAllAttachments('account-a'), []);
});

test('local upload and rename made during SELECT survive the response', async () => {
  const f = fixture();
  f.sync.upsert(mapAttachment(row('rename')));
  const snapshot = f.sync.beginSnapshot();
  f.sync.upsert(mapAttachment(row('upload')), f.sync.version);
  f.sync.rename('rename', 'local-name.pdf', f.sync.version);
  f.sync.applySnapshot([mapAttachment(row('rename'))], snapshot);
  await f.sync.settled();
  assert.equal(f.state.find((v) => v.id === 'rename').name, 'local-name.pdf');
  assert.ok(f.state.some((v) => v.id === 'upload'));
});

test('a slow local rename confirmation cannot overwrite a later Realtime rename', async () => {
  const f = fixture();
  f.sync.upsert(mapAttachment(row()));
  const start = f.sync.version;
  f.sync.receive(event('UPDATE', row('file-1', 'account-a', 'remote.pdf')));
  f.sync.rename('file-1', 'old-response.pdf', start);
  await f.sync.settled();
  assert.equal(f.state[0].name, 'remote.pdf');
});

test('reconnect removes only this account’s stale offline cache rows', async () => {
  const shared = new Map();
  const a = fixture('account-a', shared);
  const b = fixture('account-b', shared);
  a.sync.upsert(mapAttachment(row('deleted-offline')));
  b.sync.upsert(mapAttachment(row('other', 'account-b')));
  await Promise.all([a.sync.settled(), b.sync.settled()]);
  a.sync.applySnapshot([], a.sync.beginSnapshot());
  await a.sync.settled();
  assert.deepEqual(await a.cache.getAllAttachments('account-a'), []);
  assert.equal((await b.cache.getAllAttachments('account-b')).length, 1);
});

test('failed cloud load recovers offline metadata without clearing cache', async () => {
  const f = fixture();
  await f.cache.putAttachment('account-a', mapAttachment(row()));
  await f.sync.restoreCache(f.sync.beginSnapshot());
  assert.equal(f.state.length, 1);
  assert.equal(f.calls.filter(([op]) => op === 'replace').length, 0);
  f.sync.receive(event('UPDATE', row('file-1', 'account-a', 'current.pdf')));
  await f.sync.restoreCache(f.sync.beginSnapshot());
  assert.equal(f.state[0].name, 'current.pdf');
});

test('cache writes are serialized; a slow put cannot complete after a later delete', async () => {
  const gate = deferred();
  const writes = [];
  const f = fixture('account-a', new Map(), {
    async putAttachment() { await gate.promise; writes.push('put'); },
    async deleteAttachmentRecord() { writes.push('delete'); },
  });
  f.sync.receive(event('INSERT', row()));
  f.sync.receive(event('DELETE', row()));
  await Promise.resolve();
  assert.deepEqual(writes, []);
  gate.resolve();
  await f.sync.settled();
  assert.deepEqual(writes, ['put', 'delete']);
});

test('one IndexedDB failure does not block subsequent event writes', async () => {
  let attempts = 0;
  const f = fixture('account-a', new Map(), {
    async putAttachment() { if (++attempts === 1) throw new Error('quota'); },
  });
  f.sync.upsert(mapAttachment(row()));
  f.sync.upsert(mapAttachment(row('second')));
  await f.sync.settled();
  assert.equal(attempts, 2);
  assert.equal(f.errors.length, 1);
});

test('disposed account rejects late events, snapshots and local confirmations', async () => {
  const f = fixture();
  const snapshot = f.sync.beginSnapshot();
  f.sync.dispose();
  assert.equal(f.sync.receive(event('INSERT', row())), false);
  f.sync.applySnapshot([mapAttachment(row())], snapshot);
  f.sync.upsert(mapAttachment(row()));
  await f.sync.settled();
  assert.deepEqual(f.state, []);
  assert.deepEqual(f.calls, []);
});

test('accepted cache writes finish after disposal before a replacement account instance writes', async () => {
  const gate = deferred();
  const writes = [];
  const f = fixture('account-a', new Map(), {
    async putAttachment() { await gate.promise; writes.push('old put'); },
    async deleteAttachmentRecord() { writes.push('confirmed delete'); },
    async replaceAttachments() { writes.push('new snapshot'); },
  });
  f.sync.upsert(mapAttachment(row()));
  f.sync.remove('file-1');
  f.sync.dispose();
  const next = createAttachmentSync('account-a', f.cache, () => {}, () => {});
  next.applySnapshot([], next.beginSnapshot());
  gate.resolve();
  await next.settled();
  assert.deepEqual(writes, ['old put', 'confirmed delete', 'new snapshot']);
});

test('permanent note deletion blocks delayed attachment snapshots/echoes for that note', async () => {
  const f = fixture();
  const snapshot = f.sync.beginSnapshot();
  f.sync.removeForNote('note-1');
  f.sync.applySnapshot([mapAttachment(row())], snapshot);
  f.sync.receive(event('INSERT', row()));
  await f.sync.settled();
  assert.deepEqual(f.state, []);
});
