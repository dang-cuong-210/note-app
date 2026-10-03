import { useState } from 'react';
import type { FolderRecord } from '@/lib/folderSync';

export function FolderSyncNotice({ conflicts, error, onResolve }: {
  conflicts: FolderRecord[];
  error: string | null;
  onResolve: (id: string, choice: 'server' | 'copy' | 'delete') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!error && !conflicts.length) return null;
  const resolve = async (id: string, choice: 'server' | 'copy' | 'delete') => {
    setBusy(true);
    try { await onResolve(id, choice); } catch { /* The hook exposes the durable sync error. */ }
    finally { setBusy(false); }
  };
  return <section aria-label="Folder sync status" aria-live="polite"
    className="fixed bottom-4 left-4 right-4 z-50 max-h-60 overflow-auto rounded-lg border p-3 text-sm shadow-lg"
    style={{ backgroundColor: 'var(--bg)', color: 'var(--text)', borderColor: 'var(--border)' }}>
    {error && <p>{error}</p>}
    {conflicts.map((record) => <div key={record.id} className="py-2">
      <p>Folder conflict: “{record.pending!.value.name}”. Your local {record.pending!.kind === 'delete' ? 'deletion' : 'change'} is retained.</p>
      <p className="text-xs">Server: {record.remote && !record.remote.deleted ? record.remote.name : 'folder deleted or unavailable'}.
        Saving a copy creates an empty folder; notes keep their current locations.</p>
      <div className="flex flex-wrap gap-3 mt-2">
        <button type="button" disabled={busy} onClick={() => void resolve(record.id, 'server')}>Use server version</button>
        {record.pending!.kind === 'save'
          ? <button type="button" disabled={busy} onClick={() => void resolve(record.id, 'copy')}>Save local as new folder</button>
          : record.remote && !record.remote.deleted && <button type="button" disabled={busy}
            onClick={() => void resolve(record.id, 'delete')}>Delete server version shown</button>}
      </div>
    </div>)}
  </section>;
}
