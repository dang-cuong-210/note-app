import { Archive, ArchiveRestore, CalendarDays, FileText, Folder, Hash, Pin, X } from 'lucide-react';
import type { Attachment, Folder as NoteFolder, Note } from '@/types';
import { getDesktopNoteProperties } from '@/lib/desktopWorkspace.js';
import { extractTags, htmlToText } from '@/lib/utils';

interface DesktopEditorToolsPanelProps {
  note: Note;
  folders: NoteFolder[];
  attachments: Attachment[];
  onClose: () => void;
  isOpen: boolean;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
}

function DateValue({ value }: { value: number }) {
  const date = new Date(value);
  return <time dateTime={date.toISOString()}>{date.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })}</time>;
}

export function DesktopEditorToolsPanel({ note, folders, attachments, onClose, isOpen, onArchive, onMove }: DesktopEditorToolsPanelProps) {
  const properties = getDesktopNoteProperties(note, folders, attachments, htmlToText(note.content), extractTags(note.content));
  return <aside id="tanooki-desktop-editor-tools" className={`tanooki-desktop-tools-panel${isOpen ? ' is-open' : ''}`} aria-label="Công cụ chỉnh sửa">
    <div className="tanooki-desktop-tools-heading"><h2>Công cụ</h2><button type="button" className="tanooki-info-close" onClick={onClose} aria-label="Đóng bảng công cụ"><X size={18} /></button></div>

    <section className="tanooki-tools-group" aria-labelledby="tanooki-tools-note-heading">
      <h3 id="tanooki-tools-note-heading"><FileText size={15} /> Ghi chú</h3>
      <button type="button" className="tanooki-tools-action" onClick={() => onArchive(note.id, !note.archived)}>
        {note.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        {note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
      </button>
      <label className="tanooki-tools-folder"><span><Folder size={16} /> Chuyển thư mục</span>
        <select aria-label="Chuyển thư mục" value={note.folderId || ''} onChange={(event) => onMove(note.id, event.target.value || null)}>
          <option value="">Không có thư mục</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </label>
    </section>

    <section className="tanooki-tools-info" aria-labelledby="tanooki-tools-info-heading">
      <h3 id="tanooki-tools-info-heading">Thông tin</h3>
      <dl>
        <div><dt><CalendarDays size={14} /> Ngày tạo</dt><dd><DateValue value={properties.createdAt} /></dd></div>
        <div><dt><CalendarDays size={14} /> Cập nhật</dt><dd><DateValue value={properties.updatedAt} /></dd></div>
        <div><dt><Folder size={14} /> Thư mục</dt><dd>{properties.folderName || 'Chưa phân loại'}</dd></div>
        <div><dt><FileText size={14} /> Tệp đính kèm</dt><dd>{properties.attachmentCount}</dd></div>
        <div><dt><FileText size={14} /> Số từ</dt><dd>{properties.wordCount}</dd></div>
        <div><dt><FileText size={14} /> Ký tự</dt><dd>{properties.characterCount}</dd></div>
        <div><dt><Pin size={14} /> Ghim</dt><dd>{properties.pinned ? 'Đã ghim' : 'Chưa ghim'}</dd></div>
        <div><dt><Archive size={14} /> Trạng thái</dt><dd>{properties.archived ? 'Đã lưu trữ' : 'Đang hoạt động'}</dd></div>
      </dl>
      <div className="tanooki-tools-tags" aria-labelledby="tanooki-tools-tags-heading">
        <h4 id="tanooki-tools-tags-heading"><Hash size={14} /> Thẻ</h4>
        {properties.tags.length ? <div>{properties.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : <p>Chưa có thẻ trong nội dung.</p>}
      </div>
    </section>
  </aside>;
}
