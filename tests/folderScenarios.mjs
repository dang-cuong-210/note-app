const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const check = (value, message) => { if (!value) throw new Error(message); };
const folder = (name = 'original', id = 'folder') => ({ id, name, parentId: null, createdAt: 1 });
const remote = (name = 'original', revision = 0) => ({ ...folder(name), revision, deleted: false, operationId: null });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// Only the transport is simulated. Every scenario runs the production queue,
// conflict/merge decisions, acknowledgements and injected durable transactions.
export function folderScenarios(createSync, cache) {
  let counter = 0;
  function fixture() {
    const account = `test-${crypto.randomUUID()}-${++counter}`;
    const server = new Map();
    const calls = [];
    let fail = false;
    const send = async (op) => {
      calls.push(structuredClone(op));
      if (fail) throw new Error('offline');
      const prior = server.get(op.value.id);
      if (prior?.operationId === op.id) return { status: prior.deleted ? 'deleted' : 'saved', folder: prior };
      if (prior?.deleted) return { status: op.kind === 'delete' ? 'deleted' : 'conflict', folder: prior };
      if ((prior && prior.revision !== op.expected) || (!prior && op.kind === 'save' && op.expected !== -1)) {
        return { status: 'conflict', folder: prior ?? null };
      }
      const next = { ...op.value, revision: prior ? prior.revision + 1 : 0,
        deleted: op.kind === 'delete', operationId: op.id };
      server.set(next.id, next);
      return { status: next.deleted ? 'deleted' : 'saved', folder: next };
    };
    async function device(owner = account, transport = send) {
      const state = { visible: [], conflicts: [], errors: [] };
      const sync = createSync(owner, cache, transport,
        (visible, conflicts) => Object.assign(state, { visible, conflicts }), (e) => state.errors.push(e.message));
      await sync.ready;
      return { sync, state, snapshot: (rows = [...server.values()]) => sync.snapshot(rows, sync.beginSnapshot()) };
    }
    return { account, server, calls, send, device, offline: (value) => { fail = value; } };
  }
  return [
    ['a stale UI revision cannot silently adopt a newer cached server revision', async () => {
      const f = fixture(); f.server.set('folder', remote('new server name', 1)); const d = await f.device(); await d.snapshot();
      await d.sync.save({ ...folder('edit from old UI'), revision: 0 }); await d.sync.flush();
      equal(f.calls[0].expected, 0); equal(d.state.conflicts.length, 1);
      equal(f.server.get('folder').name, 'new server name');
    }],
    ['unknown remote DELETE fences a stale snapshot and late INSERT', async () => {
      const f = fixture(); const d = await f.device(); const token = d.sync.beginSnapshot();
      await d.sync.remoteDelete('folder'); await d.sync.snapshot([remote()], token);
      await d.sync.receive(remote()); equal(d.state.visible, []);
    }],
    ['logout does not drop a local operation already accepted for persistence', async () => {
      const f = fixture(); const d = await f.device();
      const writing = d.sync.save(folder('accepted before logout')); d.sync.dispose(); await writing;
      const next = await f.device(); equal(next.state.visible[0].name, 'accepted before logout');
    }],
    ['offline create survives restart and reconnect', async () => {
      const f = fixture(); let d = await f.device(); f.offline(true);
      await d.sync.save(folder('offline')); await d.sync.flush(); d.sync.dispose();
      d = await f.device(); equal(d.state.visible[0].name, 'offline');
      await d.snapshot([]); equal(d.state.visible[0].name, 'offline');
      f.offline(false); await d.sync.flush(); equal(f.server.get('folder').name, 'offline');
      d.sync.dispose(); d = await f.device(); equal(d.state.conflicts.length, 0);
    }],
    ['offline rename survives restart and reconnect snapshot', async () => {
      const f = fixture(); f.server.set('folder', remote()); let d = await f.device(); await d.snapshot();
      await d.sync.save(folder('local')); d.sync.dispose(); d = await f.device(); await d.snapshot();
      equal(d.state.visible[0].name, 'local'); await d.sync.flush(); equal(f.server.get('folder').name, 'local');
    }],
    ['offline delete tombstone survives restart and failed RPC', async () => {
      const f = fixture(); f.server.set('folder', remote()); let d = await f.device(); await d.snapshot();
      await d.sync.remove(folder()); f.offline(true); await d.sync.flush(); d.sync.dispose();
      d = await f.device(); await d.snapshot(); equal(d.state.visible, []);
      f.offline(false); await d.sync.flush(); equal(f.server.get('folder').deleted, true);
    }],
    ['save then delete before scheduled flush sends only delete', async () => {
      const f = fixture(); const d = await f.device();
      await d.sync.save(folder()); await d.sync.remove(folder()); await d.sync.flush();
      equal(f.calls.map((c) => c.kind), ['delete']); equal(d.state.visible, []);
    }],
    ['stale save callback cannot undo pending or confirmed deletion', async () => {
      const f = fixture(); const d = await f.device(); await d.sync.remove(folder());
      await d.sync.save(folder('stale')); await d.sync.flush(); await d.sync.save(folder('later stale'));
      await d.sync.flush(); equal(f.calls.map((c) => c.kind), ['delete']); equal(d.state.visible, []);
    }],
    ['remote UPDATE preserves local pending rename and exposes conflict', async () => {
      const f = fixture(); f.server.set('folder', remote()); const d = await f.device(); await d.snapshot();
      await d.sync.save(folder('mine')); const other = remote('theirs', 1); f.server.set('folder', other);
      await d.sync.receive(other); equal(d.state.visible[0].name, 'mine'); await d.sync.flush();
      equal(d.state.conflicts.length, 1); equal(f.server.get('folder').name, 'theirs');
    }],
    ['remote DELETE retains pending rename without recreating old ID', async () => {
      const f = fixture(); f.server.set('folder', remote()); const d = await f.device(); await d.snapshot();
      await d.sync.save(folder('mine')); f.server.set('folder', { ...remote(), revision: 1, deleted: true });
      await d.sync.remoteDelete('folder'); equal(d.state.visible[0].name, 'mine');
      await d.sync.flush(); equal(f.calls.length, 0); equal(d.state.conflicts.length, 1);
      await d.sync.resolve('folder', 'copy', 'copy-id'); await d.sync.flush();
      equal(f.server.get('folder').deleted, true); equal(f.server.get('copy-id').name, 'mine (conflict copy)');
    }],
    ['two devices renaming at one revision preserve both intentions', async () => {
      const f = fixture(); f.server.set('folder', remote());
      const a = await f.device(); const b = await f.device(`${f.account}-device-b`);
      await a.snapshot(); await b.snapshot(); await a.sync.save(folder('A')); await b.sync.save(folder('B'));
      await Promise.all([a.sync.flush(), b.sync.flush()]);
      equal(f.server.get('folder').name, 'A'); equal(b.state.conflicts.length, 1);
      equal(b.state.visible[0].name, 'B');
    }],
    ['delete-versus-rename conflicts require explicit deletion of new revision', async () => {
      const f = fixture(); f.server.set('folder', remote());
      const a = await f.device(); const b = await f.device(`${f.account}-device-b`);
      await a.snapshot(); await b.snapshot(); await a.sync.remove(folder()); await b.sync.save(folder('new name'));
      await b.sync.flush(); await a.sync.flush(); equal(a.state.conflicts.length, 1);
      equal(f.server.get('folder').deleted, false); await a.sync.resolve('folder', 'delete');
      await a.sync.flush(); equal(f.server.get('folder').deleted, true);
    }],
    ['account A logout and account B cache remain isolated', async () => {
      const f = fixture(); const a = await f.device(); await a.sync.save(folder('private A')); a.sync.dispose();
      const b = await f.device(`${f.account}-B`); equal(b.state.visible, []);
      await a.sync.receive(remote('late A')); await b.sync.save(folder('private B'));
      const restored = await f.device(); equal(restored.state.visible[0].name, 'private A');
    }],
    ['in-flight snapshot cannot overwrite a newer Realtime event or pending op', async () => {
      const f = fixture(); const d = await f.device(); const token = d.sync.beginSnapshot();
      await d.sync.receive(remote('event', 2)); await d.sync.snapshot([remote('old', 1)], token);
      equal(d.state.visible[0].name, 'event'); const next = d.sync.beginSnapshot();
      await d.sync.save(folder('pending')); await d.sync.snapshot([], next); equal(d.state.visible[0].name, 'pending');
    }],
    ['lost RPC response is idempotently acknowledged after restart', async () => {
      const f = fixture(); const d = await f.device(f.account, async (op) => { await f.send(op); throw new Error('lost response'); });
      await d.sync.save(folder()); await d.sync.flush(); d.sync.dispose();
      const next = await f.device(); await next.sync.flush(); equal(f.server.get('folder').revision, 0);
      equal(next.state.conflicts.length, 0);
    }],
    ['unmarked stale IndexedDB row is pruned, never uploaded', async () => {
      const f = fixture(); const d = await f.device(); await d.sync.receive(remote()); d.sync.dispose();
      const next = await f.device(); await next.snapshot([]); await next.sync.flush();
      equal(next.state.visible, []); equal(f.calls, []);
    }],
    ['delete while create RPC is in flight survives acknowledgement', async () => {
      const f = fixture(); const gate = deferred(); const started = deferred();
      const d = await f.device(f.account, async (op) => { started.resolve(); await gate.promise; return f.send(op); });
      await d.sync.save(folder()); const flushing = d.sync.flush(); await started.promise;
      await d.sync.remove(folder()); gate.resolve(); await flushing; await d.sync.flush();
      equal(f.server.get('folder').deleted, true); equal(d.state.visible, []);
    }],
    ['confirmed server tombstone rejects a replayed CREATE after lost response', async () => {
      const f = fixture(); const d = await f.device(); await d.sync.save(folder());
      f.server.set('folder', { ...remote(), deleted: true, revision: 1 }); await d.sync.flush();
      equal(d.state.conflicts.length, 1); equal(f.server.get('folder').deleted, true);
    }],
    ['same-account tabs do not acknowledge away a newer durable operation', async () => {
      const f = fixture(); const gate = deferred(); const started = deferred();
      const a = await f.device(f.account, async (op) => { started.resolve(); await gate.promise; return f.send(op); });
      const b = await f.device(); await a.sync.save(folder('first')); const flushing = a.sync.flush();
      await started.promise; await b.sync.save(folder('second')); gate.resolve(); await flushing; await b.sync.flush();
      equal(f.server.get('folder').name, 'second'); check(f.server.get('folder').revision === 1, 'newer operation must be saved');
    }],
  ];
}
