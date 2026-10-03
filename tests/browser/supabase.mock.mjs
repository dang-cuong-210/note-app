export const channels = new Map();
export const calls = [];
export const rpcCalls = [];
export const controls = { folderFailure: true, account: 'account-a' };
export const tables = {
  notes: [{ id: 'note-1', user_id: 'account-a', title: 'Disposable test note', content: '<p>Test</p>',
    folder_id: null, pinned: false, archived: false, trashed: false, trashed_at: null,
    created_at: 1, updated_at: 1, revision: 1 }],
  folders: [], attachments: [],
};
export const supabase = {
  async rpc(name, args) {
    rpcCalls.push({ name, args: structuredClone(args) });
    if (name === 'write_folder_versioned') {
      if (args.p_account !== controls.account) return { data: null, error: { message: 'Account mismatch' } };
      if (controls.folderFailure) return { data: null, error: { message: 'Simulated folder network failure' } };
      const prior = tables.folders.find((f) => f.id === args.p_folder.id);
      if (prior?.last_operation === args.p_operation) return { data: { status: prior.deleted ? 'deleted' : 'saved', folder: prior }, error: null };
      if ((prior && (prior.deleted || prior.revision !== args.p_expected)) || (!prior && !args.p_delete && args.p_expected !== -1)) {
        return { data: { status: 'conflict', folder: prior ?? null }, error: null };
      }
      const folder = { ...args.p_folder, user_id: args.p_account, revision: prior ? prior.revision + 1 : 0,
        deleted: args.p_delete, last_operation: args.p_operation };
      tables.folders = [...tables.folders.filter((f) => f.id !== folder.id), folder];
      return { data: { status: args.p_delete ? 'deleted' : 'saved', folder }, error: null };
    }
    if (name !== 'save_note_versioned') throw new Error(`Unexpected RPC ${name}`);
    const row = tables.notes.find((n) => n.id === args.p_note.id);
    if (row?.revision !== args.p_expected_revision) return { data: { status: 'conflict' }, error: null };
    Object.assign(row, args.p_note, { revision: row.revision + 1 });
    return { data: { status: 'saved', revision: row.revision, updated_at: row.updated_at }, error: null };
  },
  auth: { getSession: async () => ({ data: { session: {
    user: { id: controls.account }, access_token: 'test-only-token', expires_at: Date.now() / 1000 + 3600,
  } }, error: null }) },
  realtime: { setAuth: async () => { calls.push('setAuth'); }, connectionState: () => 'open' },
  from(table) {
    const query = {
      select() { return query; }, order() { return query; },
      eq(column, value) { calls.push(`filter:${table}:${column}:${value}`); return query; },
      then(resolve, reject) { return Promise.resolve({ data: structuredClone(tables[table].filter((r) => r.user_id === controls.account)), error: null }).then(resolve, reject); },
    };
    return query;
  },
  channel(name) {
    calls.push(`channel:${name}`);
    const channel = {
      on(_type, filter, callback) { Object.assign(channel, { filter, callback }); return channel; },
      subscribe(status) { channel.status = status; queueMicrotask(() => status('SUBSCRIBED')); return channel; },
    };
    channels.set(name, channel);
    return channel;
  },
  removeChannel: async () => {},
  storage: { from() { throw new Error('Receiving events must not call Storage'); } },
};
