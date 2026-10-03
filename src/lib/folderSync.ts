import type { Folder } from '@/types';

export type RemoteFolder = Folder & { deleted: boolean; operationId: string | null };
export type FolderOperation = {
  id: string; kind: 'save' | 'delete'; value: Folder; expected: number; conflict?: boolean;
};
export type FolderRecord = {
  id: string; remote: RemoteFolder | null; pending?: FolderOperation; stamp: string;
};
export type FolderReply = { status: 'saved' | 'deleted' | 'conflict'; folder: RemoteFolder | null };
export interface FolderCache {
  getAllFolders(account: string): Promise<Folder[]>;
  changeFolderRecords(account: string, change: (rows: FolderRecord[]) => FolderRecord[]): Promise<FolderRecord[]>;
}
export function mapRemoteFolder(row: Record<string, unknown>): RemoteFolder {
  return { id: String(row.id), name: String(row.name), parentId: row.parent_id as string | null,
    createdAt: Number(row.created_at), revision: Number(row.revision ?? 0),
    deleted: row.deleted === true, operationId: row.last_operation as string | null ?? null };
}

// Pure queue decisions + injected durable transactions/transport. The production
// transaction serializes read/modify/write across tabs, not just this instance.
export function createFolderSync(account: string, cache: FolderCache,
  send: (op: FolderOperation) => Promise<FolderReply>,
  publish: (folders: Folder[], conflicts: FolderRecord[]) => void,
  onError: (error: unknown) => void,
) {
  let records: FolderRecord[] = [];
  let disposed = false;
  let serial = Promise.resolve();
  let flushing: Promise<void> | null = null;
  let snapshotRequest = 0;
  const stamp = () => crypto.randomUUID();
  const emit = () => {
    if (disposed) return;
    publish(records.flatMap((r) => r.pending
      ? r.pending.kind === 'save' ? [r.pending.value] : []
      : r.remote && !r.remote.deleted ? [r.remote] : []), records.filter((r) => r.pending?.conflict));
  };
  const change = (fn: (rows: FolderRecord[]) => FolderRecord[]) => {
    if (disposed) return Promise.resolve();
    const work = serial.then(async () => {
      // Intent accepted before logout must still reach its original account's
      // cache. New callbacks after disposal cannot enqueue work or publish UI.
      records = await cache.changeFolderRecords(account, fn);
      emit();
    });
    serial = work.catch(onError);
    return work;
  };
  const observe = (record: FolderRecord, remote: RemoteFolder | null): FolderRecord => {
    if (record.remote?.deleted && remote && !remote.deleted) return record;
    if (remote && record.remote && (remote.revision ?? 0) < (record.remote.revision ?? 0)) return record;
    const pending = record.pending;
    const acknowledged = pending && (remote?.operationId === pending.id ||
      (pending.kind === 'delete' && remote?.deleted));
    return { ...record, remote, pending: acknowledged ? undefined : pending, stamp: stamp() };
  };
  const initialize = async () => {
    const cached = await cache.getAllFolders(account);
    await change((rows) => {
      // Existing unmarked cache is usable offline, but never queued for upload.
      const known = new Set(rows.map((r) => r.id));
      return [...rows, ...cached.filter((f) => !known.has(f.id)).map((f) => ({
        id: f.id, remote: { ...f, revision: f.revision ?? 0, deleted: false, operationId: null }, stamp: stamp(),
      }))];
    });
  };
  const ready = initialize().catch(onError);

  const flush = (): Promise<void> => {
    if (flushing) return flushing;
    flushing = (async () => {
      await ready;
      await change((rows) => rows);
      const operations = records.flatMap((r) => r.pending && !r.pending.conflict ? [r.pending] : []);
      for (const op of operations) {
        await serial;
        if (disposed) break;
        // Read persisted intent again: delete may have superseded a queued save.
        await change((rows) => rows);
        if (!records.some((r) => r.pending?.id === op.id)) continue;
        let reply: FolderReply;
        try { reply = await send(op); } catch (error) { onError(error); continue; }
        await change((rows) => rows.map((r) => {
          if (r.id !== op.value.id) return r;
          const next = observe(r, reply.folder);
          if (r.pending?.id === op.id) {
            next.pending = reply.status === 'conflict' ? { ...op, conflict: true } : undefined;
          } else if (r.pending && reply.status !== 'conflict' && r.pending.expected === op.expected) {
            // An edit/delete made while its predecessor was in flight follows
            // that confirmed revision, but never overwrites the newer intent.
            next.pending = { ...r.pending, expected: reply.folder?.revision ?? op.expected };
          }
          return next;
        }));
      }
    })().catch(onError).finally(() => { flushing = null; });
    return flushing;
  };
  return {
    accountId: account, ready, flush,
    settled: () => serial,
    save(folder: Folder) {
      return change((rows) => {
        const prior = rows.find((r) => r.id === folder.id);
        // A stale callback is not a new create. Deleted IDs are terminal.
        if (prior?.pending?.kind === 'delete' || prior?.remote?.deleted) return rows;
        const pending: FolderOperation = { id: stamp(), kind: 'save', value: folder,
          expected: prior?.pending?.expected ?? folder.revision ?? prior?.remote?.revision ?? -1,
          conflict: prior?.pending?.conflict };
        return [...rows.filter((r) => r.id !== folder.id), {
          id: folder.id, remote: prior?.remote ?? null, pending, stamp: stamp(),
        }];
      });
    },
    remove(folder: Folder) {
      return change((rows) => {
        const prior = rows.find((r) => r.id === folder.id);
        return [...rows.filter((r) => r.id !== folder.id), {
          id: folder.id, remote: prior?.remote ?? null, stamp: stamp(),
          pending: { id: stamp(), kind: 'delete', value: folder,
            expected: prior?.pending?.expected ?? folder.revision ?? prior?.remote?.revision ?? -1 },
        }];
      });
    },
    beginSnapshot() { return { request: ++snapshotRequest, stamps: new Map(records.map((r) => [r.id, r.stamp])) }; },
    snapshot(remote: RemoteFolder[], token: { request: number; stamps: Map<string, string> }) {
      return change((rows) => {
        if (token.request !== snapshotRequest) return rows;
        const remaining = new Map(remote.map((f) => [f.id, f]));
        const next: FolderRecord[] = [];
        for (const r of rows) {
          const server = remaining.get(r.id) ?? null;
          remaining.delete(r.id);
          if (r.stamp !== token.stamps.get(r.id)) { next.push(r); continue; }
          if (server || r.pending) next.push(observe(r, server));
        }
        remaining.forEach((server) => next.push({ id: server.id, remote: server, stamp: stamp() }));
        return next;
      });
    },
    receive(remote: RemoteFolder) {
      return change((rows) => {
        const prior = rows.find((r) => r.id === remote.id);
        return [...rows.filter((r) => r.id !== remote.id), prior ? observe(prior, remote)
          : { id: remote.id, remote, stamp: stamp() }];
      });
    },
    remoteDelete(id: string) {
      return change((rows) => {
        if (!rows.some((r) => r.id === id)) return [...rows, { id, stamp: stamp(),
          remote: { id, name: '', parentId: null, createdAt: 0, revision: 0, deleted: true, operationId: null } }];
        return rows.map((r) => r.id === id ? {
        ...r, stamp: stamp(), remote: { ...(r.remote ?? r.pending?.value ?? { id, name: '', parentId: null, createdAt: 0 }), deleted: true,
          revision: r.remote?.revision ?? 0, operationId: null },
        pending: r.pending?.kind === 'delete' ? undefined : r.pending ? { ...r.pending, conflict: true } : undefined,
        } : r).filter((r) => r.id !== id || r.pending || r.remote);
      });
    },
    resolve(id: string, choice: 'server' | 'copy' | 'delete', newId?: string, shownRevision?: number) {
      return change((rows) => rows.flatMap((r) => {
        if (r.id !== id || !r.pending?.conflict) return [r];
        const base = { ...r, pending: undefined, stamp: stamp() };
        if (choice === 'copy' && r.pending.kind === 'save' && newId) {
          const value = { ...r.pending.value, id: newId, name: `${r.pending.value.name} (conflict copy)`, revision: undefined };
          return [base, { id: newId, remote: null, stamp: stamp(),
            pending: { id: stamp(), kind: 'save' as const, value, expected: -1 } }];
        }
        if (choice === 'delete' && r.pending.kind === 'delete' && r.remote && !r.remote.deleted) {
          if (shownRevision !== undefined && r.remote.revision !== shownRevision) return [r];
          return [{ ...r, stamp: stamp(), pending: { ...r.pending, id: stamp(),
            expected: r.remote.revision ?? 0, conflict: false } }];
        }
        return [base];
      }));
    },
    dispose() { disposed = true; },
  };
}
