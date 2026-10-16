import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Calculator, CalendarDays, Clock3, Copy, File, FileText, Folder, Grid2X2, Hash, Image, LockKeyhole, MoreHorizontal, Paperclip, Pin, ScanLine, Search, Share2, Sun, Trash2, Video, X, Edit3 } from 'lucide-react';
import type { Attachment, Folder as NoteFolder, Note } from '@/types';
import { getFolderHierarchy, getFolderOptionLabel } from '@/lib/folderHierarchy.js';
import { getDesktopNoteProperties } from '@/lib/desktopWorkspace.js';
import { extractTags, htmlToText } from '@/lib/utils';
import { NoteTagManager } from '@/components/NoteTagManager';
import { formatFileSize } from '@/lib/attachments';

export interface MobileInlineImage {
  src: string;
  name: string;
}

export function MobileAttachmentBrowserSheet({ open, onClose, attachments, images, onOpen, onRename, onShare, onDelete, onOpenImage, onShareImage, onDeleteImage }: {
  open: boolean;
  onClose: () => void;
  attachments: Attachment[];
  images: MobileInlineImage[];
  onOpen: (attachment: Attachment) => void;
  onRename: (attachment: Attachment) => void;
  onShare: (attachment: Attachment) => void;
  onDelete: (attachment: Attachment) => void;
  onOpenImage: (image: MobileInlineImage) => void;
  onShareImage: (image: MobileInlineImage) => void;
  onDeleteImage: (image: MobileInlineImage) => void;
}) {
  const count = attachments.length + images.length;
  return <MobileBottomSheet open={open} title={`Tệp đính kèm (${count})`} onClose={onClose} labelledBy="mobile-attachment-browser">
    {count === 0 ? <p className="tanooki-mobile-attachment-empty">Chưa có tệp đính kèm</p> : <div className="tanooki-mobile-attachment-browser">
      {images.map((image) => <article className="tanooki-mobile-attachment-card is-image" key={image.src}>
        <button type="button" className="tanooki-mobile-attachment-preview" onClick={() => onOpenImage(image)} aria-label={`Xem ${image.name}`}><img src={image.src} alt="" loading="lazy" /></button>
        <div className="tanooki-mobile-attachment-meta"><strong title={image.name}>{image.name || 'Hình ảnh'}</strong><span>Hình ảnh trong ghi chú</span></div>
        <details className="tanooki-mobile-attachment-more-menu">
          <summary aria-label={`Thao tác với ${image.name}`}><MoreHorizontal size={20} /></summary>
          <div className="tanooki-mobile-attachment-menu-popover">
            <button type="button" onClick={() => onOpenImage(image)}><Image size={16} />Xem</button>
            <button type="button" onClick={() => onShareImage(image)}><Share2 size={16} />Chia sẻ / Xuất</button>
            <button type="button" className="is-danger" onClick={() => onDeleteImage(image)}><Trash2 size={16} />Xóa khỏi ghi chú</button>
          </div>
        </details>
      </article>)}
      {attachments.map((attachment) => {
        const isImage = attachment.type.startsWith('image/');
        const isVideo = attachment.type.startsWith('video/');
        const Icon = isVideo ? Video : FileText;
        return <article className={`tanooki-mobile-attachment-card${isImage ? ' is-image' : ''}`} key={attachment.id}>
          <button type="button" className="tanooki-mobile-attachment-preview" onClick={() => onOpen(attachment)} aria-label={`Mở ${attachment.name}`}>
            {isImage && attachment.url ? <img src={attachment.url} alt="" loading="lazy" /> : <Icon size={24} />}
          </button>
          <div className="tanooki-mobile-attachment-meta"><strong title={attachment.name}>{attachment.name}</strong><span>{isVideo ? 'Video' : isImage ? 'Hình ảnh' : 'Tệp'} · {formatFileSize(attachment.size)}</span></div>
          <details className="tanooki-mobile-attachment-more-menu">
            <summary aria-label={`Thao tác với ${attachment.name}`}><MoreHorizontal size={20} /></summary>
            <div className="tanooki-mobile-attachment-menu-popover">
              <button type="button" onClick={() => onOpen(attachment)}><File size={16} />Mở</button>
              <button type="button" onClick={() => onRename(attachment)}><Edit3 size={16} />Đổi tên</button>
              <button type="button" onClick={() => onShare(attachment)}><Share2 size={16} />Chia sẻ / Xuất</button>
              <button type="button" className="is-danger" onClick={() => onDelete(attachment)}><Trash2 size={16} />Xóa</button>
            </div>
          </details>
        </article>;
      })}
    </div>}
  </MobileBottomSheet>;
}

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
  tags: string[];
  existingTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onOpenTag: (tag: string) => void;
}

export function MobileEditorToolsSheet({ note, folders, attachments, open, onClose, tags, existingTags, onAddTag, onRemoveTag, onOpenTag }: MobileEditorToolsSheetProps) {
  const properties = getDesktopNoteProperties(note, folders, attachments, htmlToText(note.content), extractTags(note.content));
  return <MobileBottomSheet open={open} title="Công cụ" onClose={onClose} labelledBy="mobile-editor-tools">
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
      <div className="tanooki-mobile-sheet-tags"><h4><Hash size={14} /> Thẻ</h4><NoteTagManager mobile tags={tags} existingTags={existingTags} onAddTag={onAddTag} onRemoveTag={onRemoveTag} onOpenTag={onOpenTag} /></div>
    </section>
  </MobileBottomSheet>;
}

interface MobileEditorMoreSheetProps {
  note: Note;
  folders: NoteFolder[];
  open: boolean;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
  onDuplicate: (id: string) => void;
  onTrash: (id: string) => void;
  onFind: () => void;
  onPlaceholder: () => void;
  onNavigateRecent: () => void;
  onTogglePaper: () => void;
  onShowAttachments: () => void;
  paperMode: boolean;
}

export function MobileEditorMoreSheet({ note, folders, open, onClose, onTogglePin, onArchive, onMove, onDuplicate, onTrash, onFind, onPlaceholder, onNavigateRecent, onTogglePaper, onShowAttachments, paperMode }: MobileEditorMoreSheetProps) {
  const run = (action: () => void) => { onClose(); action(); };
  const [moving, setMoving] = useState(false);
  useEffect(() => { if (!open) setMoving(false); }, [open]);
  return <MobileBottomSheet open={open} title="Tùy chọn ghi chú" onClose={onClose} labelledBy="mobile-note-actions">
    <div className="tanooki-mobile-note-menu-quick">
      <button type="button" onClick={onPlaceholder}><ScanLine size={20} /><span>Bản quét</span></button>
      <button type="button" onClick={() => run(() => onTogglePin(note.id))}>{note.pinned ? <Pin size={20} fill="currentColor" /> : <Pin size={20} />}<span>{note.pinned ? 'Bỏ ghim' : 'Ghim'}</span></button>
      <button type="button" onClick={onPlaceholder}><LockKeyhole size={20} /><span>Khóa</span></button>
    </div>
    <div className="tanooki-mobile-note-menu-list">
      <button type="button" onClick={() => run(onFind)}><Search size={19} /><span>Tìm trong ghi chú</span></button>
      {moving ? <label className="tanooki-mobile-note-menu-move"><Folder size={19} /><span>Di chuyển ghi chú</span><select aria-label="Di chuyển ghi chú" value={note.folderId || ''} onChange={(event) => run(() => onMove(note.id, event.target.value || null))}><option value="">Không có thư mục</option>{getFolderHierarchy(folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{getFolderOptionLabel(folder, depth)}</option>)}</select></label> : <button type="button" onClick={() => setMoving(true)}><Folder size={19} /><span>Di chuyển ghi chú</span></button>}
      <button type="button" onClick={onPlaceholder}><Calculator size={19} /><span>Kết quả toán học</span></button>
      <button type="button" onClick={() => run(onNavigateRecent)}><Clock3 size={19} /><span>Ghi chú gần đây</span></button>
      <button type="button" onClick={onPlaceholder}><Grid2X2 size={19} /><span>Đường kẻ &amp; lưới</span></button>
      <button type="button" onClick={() => run(onShowAttachments)}><Paperclip size={19} /><span>Chế độ xem tệp đính kèm</span></button>
      <button type="button" onClick={onTogglePaper}><Sun size={19} /><span>{paperMode ? 'Dùng nền theo giao diện' : 'Sử dụng nền sáng màu'}</span></button>
      <div className="tanooki-mobile-note-menu-divider" />
      <button type="button" onClick={() => run(() => onArchive(note.id, !note.archived))}>{note.archived ? <ArchiveRestore size={19} /> : <Archive size={19} />}<span>{note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}</span></button>
      <button type="button" onClick={() => run(() => onDuplicate(note.id))}><Copy size={19} /><span>Tạo bản sao</span></button>
      <button type="button" className="is-danger" onClick={() => run(() => onTrash(note.id))}><Trash2 size={19} /><span>Xóa</span></button>
    </div>
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
      <label className="tanooki-mobile-sheet-select"><span><Folder size={19} /> Chuyển thư mục</span><select aria-label="Chuyển thư mục" value={note.folderId || ''} onChange={(event) => run(() => onMove(note.id, event.target.value || null))}><option value="">Không có thư mục</option>{getFolderHierarchy(folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{getFolderOptionLabel(folder, depth)}</option>)}</select></label>
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
