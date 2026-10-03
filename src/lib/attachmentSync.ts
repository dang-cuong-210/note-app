import type { Attachment } from '@/types';

export interface AttachmentRow {
  id: string;
  user_id: string;
  note_id: string;
  name: string;
  type: string;
  size: number;
  storage_path: string;
  url: string | null;
  created_at: number;
}

export function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    name: row.name,
    type: row.type,
    size: Number(row.size),
    storagePath: row.storage_path,
    url: row.url,
    createdAt: Number(row.created_at),
  };
}

interface AttachmentCache {
  getAllAttachments: (accountId: string) => Promise<Attachment[]>;
  putAttachment: (accountId: string, value: Attachment) => Promise<unknown>;
  deleteAttachmentRecord: (accountId: string, id: string) => Promise<unknown>;
  replaceAttachments: (accountId: string, values: Attachment[]) => Promise<unknown>;
}

interface Snapshot { request: number; version: number }

// Keep accepted writes ordered even when the same account signs out and back in
// before IndexedDB completes. Cache keys remain account-scoped throughout.
const cacheQueues = new WeakMap<AttachmentCache, Map<string, Promise<void>>>();

// One instance per authenticated account lifetime. Both local confirmations and
// Realtime use the same journal, so a slow SELECT cannot undo a newer mutation.
export function createAttachmentSync(
  accountId: string,
  cache: AttachmentCache,
  publish: (values: Attachment[]) => void,
  onCacheError: (error: unknown) => void,
) {
  let values = new Map<string, Attachment>();
  const changes = new Map<string, { version: number; value: Attachment | null }>();
  const deletedNotes = new Set<string>();
  let version = 0;
  let request = 0;
  let initialized = false;
  let disposed = false;
  let queues = cacheQueues.get(cache);
  if (!queues) {
    queues = new Map();
    cacheQueues.set(cache, queues);
  }
  const accountQueues = queues;
  let cacheQueue = accountQueues.get(accountId) ?? Promise.resolve();

  const persist = (operation: () => Promise<unknown>) => {
    cacheQueue = (accountQueues.get(accountId) ?? Promise.resolve()).then(async () => {
      await operation();
    }).catch(onCacheError);
    accountQueues.set(accountId, cacheQueue);
    const pending = cacheQueue;
    void pending.then(() => {
      if (accountQueues.get(accountId) === pending) accountQueues.delete(accountId);
    });
  };
  const emit = () => publish(Array.from(values.values()));

  const upsert = (value: Attachment, since?: number) => {
    if (disposed || deletedNotes.has(value.noteId)) return;
    // An upload/rename response can arrive AFTER its Realtime echo (or a later
    // rename/delete). Do not resurrect or overwrite that newer observation.
    if (since !== undefined && (changes.get(value.id)?.version ?? -1) > since) return;
    values.set(value.id, value);
    changes.set(value.id, { version: ++version, value });
    emit();
    persist(() => cache.putAttachment(accountId, value));
  };

  const remove = (id: string) => {
    if (disposed) return;
    values.delete(id);
    // Retain unknown IDs too: a pending SELECT might still contain this row.
    changes.set(id, { version: ++version, value: null });
    emit();
    persist(() => cache.deleteAttachmentRecord(accountId, id));
  };

  const applySnapshot = (rows: Attachment[], snapshot: Snapshot, authoritative = true) => {
    if (disposed || snapshot.request !== request) return;
    const next = new Map(rows.filter((row) => !deletedNotes.has(row.noteId)).map((row) => [row.id, row]));
    changes.forEach((change, id) => {
      if (change.version <= snapshot.version) return;
      if (change.value && !deletedNotes.has(change.value.noteId)) next.set(id, change.value);
      else next.delete(id);
    });
    values = next;
    initialized = true;
    emit();
    if (authoritative) {
      const current = Array.from(values.values());
      // A successful account-scoped query also prunes deletes missed offline.
      persist(() => cache.replaceAttachments(accountId, current));
    }
  };

  return {
    accountId,
    get version() { return version; },
    beginSnapshot: (): Snapshot => ({ request: ++request, version }),
    applySnapshot,
    async restoreCache(snapshot: Snapshot) {
      if (disposed || initialized) return;
      // Wait for earlier events to reach IndexedDB before using it as fallback.
      await cacheQueue;
      const rows = await cache.getAllAttachments(accountId);
      applySnapshot(rows, snapshot, false);
    },
    upsert,
    rename(id: string, name: string, since: number) {
      const value = values.get(id);
      if (value) upsert({ ...value, name }, since);
    },
    remove,
    removeForNote(noteId: string) {
      if (disposed) return;
      deletedNotes.add(noteId);
      Array.from(values.values()).forEach((value) => {
        if (value.noteId === noteId) remove(value.id);
      });
    },
    receive(event: { eventType: string; new: Partial<AttachmentRow>; old: Partial<AttachmentRow> }) {
      if (disposed) return false;
      if (event.eventType === 'DELETE') {
        // The channel has a server-side user_id filter backed by FULL replica
        // identity. Some RLS configurations deliver only the primary key to JS.
        if (!event.old.id || (event.old.user_id && event.old.user_id !== accountId)) return false;
        remove(event.old.id);
        return true;
      }
      if (event.eventType !== 'INSERT' && event.eventType !== 'UPDATE') return false;
      if (event.new.user_id !== accountId || !event.new.id || !event.new.note_id) return false;
      upsert(mapAttachment(event.new as AttachmentRow));
      return true;
    },
    settled: () => cacheQueue,
    dispose() { disposed = true; },
  };
}
