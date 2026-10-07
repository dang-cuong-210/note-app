import { Archive, CalendarDays, FileText, Folder, Hash, Pin, X } from 'lucide-react';
import type { Attachment, Folder as NoteFolder, Note } from '@/types';
import { getDesktopNoteProperties } from '@/lib/desktopWorkspace.js';
import { extractTags, htmlToText } from '@/lib/utils';

interface DesktopNoteInfoPanelProps {
  note: Note;
  folders: NoteFolder[];
  attachments: Attachment[];
  onClose: () => void;
  isOpen: boolean;
}

function DateValue({ value }: { value: number }) {
  const date = new Date(value);
  return <time dateTime={date.toISOString()}>{date.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })}</time>;
}

export function DesktopNoteInfoPanel({ note, folders, attachments, onClose, isOpen }: DesktopNoteInfoPanelProps) {
  const properties = getDesktopNoteProperties(note, folders, attachments, htmlToText(note.content), extractTags(note.content));
  return <aside className={`tanooki-desktop-info-panel${isOpen ? ' is-open' : ''}`} aria-label="Thông tin ghi chú">
    <div className="tanooki-desktop-info-heading"><h2>Thông tin ghi chú</h2><button type="button" className="tanooki-info-close" onClick={onClose} aria-label="Đóng bảng thông tin"><X size={18} /></button></div>
    <dl>
      <div><dt><CalendarDays size={16} /> Ngày tạo</dt><dd><DateValue value={properties.createdAt} /></dd></div>
      <div><dt><CalendarDays size={16} /> Chỉnh sửa</dt><dd><DateValue value={properties.updatedAt} /></dd></div>
      <div><dt><Folder size={16} /> Thư mục</dt><dd>{properties.folderName || 'Chưa phân loại'}</dd></div>
      <div><dt><FileText size={16} /> Tệp đính kèm</dt><dd>{properties.attachmentCount}</dd></div>
      <div><dt><FileText size={16} /> Số từ</dt><dd>{properties.wordCount}</dd></div>
      <div><dt><FileText size={16} /> Ký tự</dt><dd>{properties.characterCount}</dd></div>
      <div><dt><Pin size={16} /> Ghim</dt><dd>{properties.pinned ? 'Đã ghim' : 'Chưa ghim'}</dd></div>
      <div><dt><Archive size={16} /> Lưu trữ</dt><dd>{properties.archived ? 'Đã lưu trữ' : 'Đang hoạt động'}</dd></div>
    </dl>
    <section className="tanooki-desktop-info-tags" aria-labelledby="desktop-note-tags"><h3 id="desktop-note-tags"><Hash size={15} /> Thẻ</h3>
      {properties.tags.length ? <div>{properties.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : <p>Chưa có thẻ trong nội dung.</p>}
    </section>
  </aside>;
}
