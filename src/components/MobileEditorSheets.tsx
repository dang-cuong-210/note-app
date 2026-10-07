import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Archive, ArchiveRestore, CalendarDays, Copy, FileText, Folder, Hash, Image, Paperclip, Pin, Trash2, X } from 'lucide-react';
import type { Attachment, Folder as NoteFolder, Note } from '@/types';
import { getDesktopNoteProperties } from '@/lib/desktopWorkspace.js';
import { extractTags, htmlToText } from '@/lib/utils';

interface MobileBottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  labelledBy: string;
}

export function MobileBottomSheet({ open, title, onClose, children, labelledBy }: MobileBottomSheetProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`${labelledBy}-close`)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = document.getElementById(labelledBy);
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open, labelledBy]);

  if (!open) return null;
  return <div className="tanooki-mobile-sheet-layer">
    <button type="button" className="tanooki-mobile-sheet-backdrop" aria-label="Đóng bảng" onClick={onClose} />
    <section id={labelledBy} className="tanooki-mobile-bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={`${labelledBy}-title`}>
      <div className="tanooki-mobile-sheet-handle" aria-hidden="true" />
      <header className="tanooki-mobile-sheet-heading">
        <h2 id={`${labelledBy}-title`}>{title}</h2>
        <button type="button" id={`${labelledBy}-close`} aria-label="Đóng bảng" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="tanooki-mobile-sheet-content">{children}</div>
    </section>
  </div>;
}

interface MobileEditorToolsSheetProps {
  note: Note;
  folders: NoteFolder[];
  attachments: Attachment[];
  open: boolean;
  onClose: () => void;
  onChooseImage: () => void;
  onChooseFile: () => void;
}

export function MobileEditorToolsSheet({ note, folders, attachments, open, onClose, onChooseImage, onChooseFile }: MobileEditorToolsSheetProps) {
  const properties = getDesktopNoteProperties(note, folders, attachments, htmlToText(note.content), extractTags(note.content));
  return <MobileBottomSheet open={open} title="Công cụ" onClose={onClose} labelledBy="mobile-editor-tools">
    <section className="tanooki-mobile-sheet-group" aria-labelledby="mobile-tools-insert">
      <h3 id="mobile-tools-insert">Chèn</h3>
      <div className="tanooki-mobile-sheet-actions">
        <button type="button" onClick={() => { onClose(); onChooseImage(); }}><Image size={19} />Thêm hình ảnh</button>
        <button type="button" onClick={() => { onClose(); onChooseFile(); }}><Paperclip size={19} />Đính kèm tệp</button>
      </div>
    </section>
    <section className="tanooki-mobile-sheet-group tanooki-mobile-sheet-info" aria-labelledby="mobile-tools-info">
      <h3 id="mobile-tools-info">Thông tin</h3>
      <dl>
        <div><dt><CalendarDays size={15} /> Ngày tạo</dt><dd><time dateTime={new Date(properties.createdAt).toISOString()}>{new Date(properties.createdAt).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })}</time></dd></div>
        <div><dt><CalendarDays size={15} /> Cập nhật</dt><dd><time dateTime={new Date(properties.updatedAt).toISOString()}>{new Date(properties.updatedAt).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })}</time></dd></div>
        <div><dt><Folder size={15} /> Thư mục</dt><dd>{properties.folderName || 'Chưa phân loại'}</dd></div>
        <div><dt><FileText size={15} /> Tệp đính kèm</dt><dd>{properties.attachmentCount}</dd></div>
        <div><dt><FileText size={15} /> Số từ</dt><dd>{properties.wordCount}</dd></div>
        <div><dt><FileText size={15} /> Ký tự</dt><dd>{properties.characterCount}</dd></div>
      </dl>
      <div className="tanooki-mobile-sheet-tags"><h4><Hash size={14} /> Thẻ</h4>{properties.tags.length ? properties.tags.map((tag) => <span key={tag}>#{tag}</span>) : <p>Chưa có thẻ trong nội dung.</p>}</div>
    </section>
  </MobileBottomSheet>;
}

interface MobileNoteActionsSheetProps {
  note: Note;
  folders: NoteFolder[];
  open: boolean;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
  onDuplicate: (id: string) => void;
  onTrash: (id: string) => void;
}

export function MobileNoteActionsSheet({ note, folders, open, onClose, onTogglePin, onArchive, onMove, onDuplicate, onTrash }: MobileNoteActionsSheetProps) {
  const run = (action: () => void) => { onClose(); action(); };
  return <MobileBottomSheet open={open} title="Thao tác ghi chú" onClose={onClose} labelledBy="mobile-note-actions">
    <div className="tanooki-mobile-sheet-actions">
      <button type="button" onClick={() => run(() => onTogglePin(note.id))}><Pin size={19} />{note.pinned ? 'Bỏ ghim' : 'Ghim'}</button>
      <button type="button" onClick={() => run(() => onArchive(note.id, !note.archived))}>{note.archived ? <ArchiveRestore size={19} /> : <Archive size={19} />}{note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}</button>
      <label className="tanooki-mobile-sheet-select"><span><Folder size={19} /> Chuyển thư mục</span><select aria-label="Chuyển thư mục" value={note.folderId || ''} onChange={(event) => run(() => onMove(note.id, event.target.value || null))}><option value="">Không có thư mục</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      <button type="button" onClick={() => run(() => onDuplicate(note.id))}><Copy size={19} />Tạo bản sao</button>
      <button type="button" className="is-danger" onClick={() => run(() => onTrash(note.id))}><Trash2 size={19} />Chuyển vào thùng rác</button>
    </div>
  </MobileBottomSheet>;
}

export function MobileTrashActionsSheet({ note, open, onClose, onRestore, onPermanentDelete }: { note: Note; open: boolean; onClose: () => void; onRestore: (id: string) => void; onPermanentDelete: (id: string) => void }) {
  return <MobileBottomSheet open={open} title="Thao tác ghi chú" onClose={onClose} labelledBy="mobile-trash-actions">
    <div className="tanooki-mobile-sheet-actions">
      <button type="button" onClick={() => { onClose(); onRestore(note.id); }}><ArchiveRestore size={19} />Khôi phục</button>
      <button type="button" className="is-danger" onClick={() => { onClose(); onPermanentDelete(note.id); }}><Trash2 size={19} />Xóa vĩnh viễn</button>
    </div>
  </MobileBottomSheet>;
}

export function MobileCreateFolderSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
    onClose();
  };
  return <MobileBottomSheet open={open} title="Tạo thư mục" onClose={onClose} labelledBy="mobile-create-folder">
    <form className="tanooki-mobile-folder-form" onSubmit={submit}>
      <label htmlFor="mobile-folder-name">Tên thư mục</label>
      <input id="mobile-folder-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" placeholder="Ví dụ: Công việc" />
      <div><button type="button" className="tanooki-sheet-secondary" onClick={() => { setName(''); onClose(); }}>Hủy</button><button type="submit" className="tanooki-sheet-primary" disabled={!name.trim()}>Tạo</button></div>
    </form>
  </MobileBottomSheet>;
}
