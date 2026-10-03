export const channels = new Map();
export const calls = [];
export const tables = {
  notes: [{ id: 'note-1', user_id: 'account-a', title: 'Disposable test note', content: '<p>Test</p>',
    folder_id: null, pinned: false, archived: false, trashed: false, trashed_at: null,
    created_at: 1, updated_at: 1, revision: 1 }],
  folders: [], attachments: [],
};
export const supabase = {
  auth: { getSession: async () => ({ data: { session: {
    user: { id: 'account-a' }, access_token: 'test-only-token', expires_at: Date.now() / 1000 + 3600,
  } }, error: null }) },
  realtime: { setAuth: async () => { calls.push('setAuth'); }, connectionState: () => 'open' },
  from(table) {
    const query = {
      select() { return query; }, order() { return query; },
      eq(column, value) { calls.push(`filter:${table}:${column}:${value}`); return query; },
      then(resolve, reject) { return Promise.resolve({ data: structuredClone(tables[table]), error: null }).then(resolve, reject); },
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
