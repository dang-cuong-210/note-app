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
  return <section aria-label="Trạng thái đồng bộ thư mục" aria-live="polite"
    className="fixed bottom-4 left-4 right-4 z-50 max-h-60 overflow-auto rounded-lg border p-3 text-sm shadow-lg"
    style={{ backgroundColor: 'var(--bg)', color: 'var(--text)', borderColor: 'var(--border)' }}>
    {error && <p>{error}</p>}
    {conflicts.map((record) => <div key={record.id} className="py-2">
      <p>Xung đột thư mục: “{record.pending!.value.name}”. {record.pending!.kind === 'delete' ? 'Thao tác xóa' : 'Thay đổi'} trên thiết bị này vẫn được giữ lại.</p>
      <p className="text-xs">Bản máy chủ: {record.remote && !record.remote.deleted ? record.remote.name : 'thư mục đã bị xóa hoặc không khả dụng'}.
        Lưu bản sao sẽ tạo thư mục trống; ghi chú vẫn ở vị trí hiện tại.</p>
      <div className="flex flex-wrap gap-3 mt-2">
        <button type="button" disabled={busy} onClick={() => void resolve(record.id, 'server')}>Dùng bản máy chủ</button>
        {record.pending!.kind === 'save'
          ? <button type="button" disabled={busy} onClick={() => void resolve(record.id, 'copy')}>Lưu thành thư mục mới</button>
          : record.remote && !record.remote.deleted && <button type="button" disabled={busy}
            onClick={() => void resolve(record.id, 'delete')}>Xóa bản máy chủ đang hiển thị</button>}
      </div>
    </div>)}
  </section>;
}
