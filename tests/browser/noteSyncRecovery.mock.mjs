export const channels = new Map();
export const calls = [];
export const rpcCalls = [];
export const controls = {
  account: null,
  notes: [],
  folders: [],
  attachments: [],
  blockNextNoteLoad: false,
  notesLoadBlocked: false,
  releaseNoteLoad: null,
  failNextNoteLoad: false,
  pauseNoteRpcId: null,
  noteRpcPaused: false,
  releaseNoteRpc: null,
  pauseNoteDelete: false,
  noteDeletePaused: false,
  releaseNoteDelete: null,
  noteRpcConcurrency: 0,
  maxNoteRpcConcurrency: 0,
};

const waitGate = (releaseKey) => new Promise((resolve) => { controls[releaseKey] = resolve; });

export const supabase = {
  async rpc(name, args) {
    rpcCalls.push({ name, args: structuredClone(args) });
    if (name === 'write_folder_versioned') return { data: { status: 'saved', folder: args.p_folder }, error: null };
    if (name !== 'save_note_versioned') throw new Error(`Unexpected RPC ${name}`);
    controls.noteRpcConcurrency += 1;
    controls.maxNoteRpcConcurrency = Math.max(controls.maxNoteRpcConcurrency, controls.noteRpcConcurrency);
    try {
      if (controls.pauseNoteRpcId === args.p_note.id) {
        controls.noteRpcPaused = true;
        await waitGate('releaseNoteRpc');
      }
      const existing = controls.notes.find((row) => row.id === args.p_note.id);
      if ((existing && existing.revision !== args.p_expected_revision) ||
          (!existing && args.p_expected_revision !== -1)) {
        return { data: { status: 'conflict' }, error: null };
      }
      const saved = { ...args.p_note, user_id: controls.account, revision: existing ? existing.revision + 1 : 0 };
      controls.notes = [...controls.notes.filter((row) => row.id !== saved.id), saved];
      return { data: { status: 'saved', revision: saved.revision, updated_at: saved.updated_at }, error: null };
    } finally {
      controls.noteRpcConcurrency -= 1;
    }
  },
  auth: { getSession: async () => ({ data: { session: controls.account ? {
    user: { id: controls.account }, access_token: 'test-only-token', expires_at: Date.now() / 1000 + 3600,
  } : null }, error: null }) },
  realtime: { setAuth: async () => { calls.push('setAuth'); }, connectionState: () => 'open' },
  channel(name) {
    const channel = {
      name,
      on(_type, filter, callback) { Object.assign(channel, { filter, callback }); return channel; },
      subscribe(callback) { channel.statusCallback = callback; channels.set(name, channel); return channel; },
    };
    channels.set(name, channel);
    return channel;
  },
  removeChannel: async () => {},
  from(table) {
    let ordered = false;
    let deleting = false;
    const filters = [];
    const query = {
      select() { return query; },
      order() { ordered = true; return query; },
      eq(column, value) { filters.push([column, value]); return query; },
      delete() { deleting = true; return query; },
      upsert(rows) { controls[table] = [...rows]; return Promise.resolve({ data: rows, error: null }); },
      async then(resolve, reject) {
        try {
          if (table === 'notes' && ordered && controls.blockNextNoteLoad) {
            controls.blockNextNoteLoad = false;
            controls.notesLoadBlocked = true;
            await waitGate('releaseNoteLoad');
            controls.notesLoadBlocked = false;
          }
          if (table === 'notes' && ordered && controls.failNextNoteLoad) {
            controls.failNextNoteLoad = false;
            return resolve({ data: null, error: { message: 'simulated initial notes load failure' } });
          }
          if (deleting && table === 'notes' && controls.pauseNoteDelete) {
            controls.noteDeletePaused = true;
            await waitGate('releaseNoteDelete');
          }
          const values = controls[table] ?? [];
          const matches = (row) => filters.every(([column, value]) => row[column] === value);
          const data = deleting ? values.filter((row) => !matches(row)) : values.filter(matches);
          if (deleting) controls[table] = data;
          return resolve({ data: structuredClone(data), error: null });
        } catch (error) { return reject(error); }
      },
      async maybeSingle() {
        const result = await new Promise((resolve, reject) => query.then(resolve, reject));
        return { data: result.data?.[0] ?? null, error: result.error };
      },
    };
    return query;
  },
  storage: { from() { return { remove: async () => ({ data: [], error: null }) }; } },
};
