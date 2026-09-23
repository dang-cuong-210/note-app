import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pin,
  PinOff,
  Trash2,
  Folder as FolderIcon,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  X,
  Download,
  FileText,
  FileSpreadsheet,
  FileChartColumn,
  FileArchive,
  FileCode,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import type { Note, Folder, Attachment } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { isAcceptedImageType, uploadNoteImage, deleteNoteImage, extractImagePaths } from '@/lib/images';
import { formatFileSize, getFileIcon, refreshAttachmentUrl } from '@/lib/attachments';

interface NoteEditorProps {
  note: Note | null;
  folders: Folder[];
  attachments: Attachment[];
  onUpdate: (id: string, title: string, content: string) => void;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onArchive: (id: string, archived: boolean) => void;
  onAddAttachment: (noteId: string, file: File) => Promise<Attachment | null>;
  onRemoveAttachment: (id: string) => void;
  onBack: () => void;
}

export function NoteEditor({
  note,
  folders,
  attachments,
  onUpdate,
  onTogglePin,
  onTrash,
  onMove,
  onArchive,
  onAddAttachment,
  onRemoveAttachment,
  onBack,
}: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Sync local state when note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    }
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  titleRef.current = title;
  contentRef.current = content;

  useEffect(() => {
    if (!note) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (titleRef.current !== note.title || contentRef.current !== note.content) {
        onUpdate(note.id, titleRef.current, contentRef.current);
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close menu on outside click/touch
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);

  // Handle image paste and drop
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!note) return;
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageUpload(file);
          return;
        }
      }
    },
    [note] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!note) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          handleImageUpload(file);
        } else {
          handleFileUpload(file);
        }
      }
    },
    [note] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleImageUpload = async (file: File) => {
    if (!note) return;
    if (!isAcceptedImageType(file)) {
      toast('Only JPG, PNG, GIF, and WEBP images are supported');
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadNoteImage(note.id, file);
      const imgTag = `<img src="${url}" alt="${file.name}" style="max-width:100%;border-radius:8px;margin:8px 0;" />`;
      setContent((prev) => prev + imgTag);
      toast('Image added');
    } catch (err) {
      toast('Failed to upload image');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!note) return;
    setUploading(true);
    try {
      const result = await onAddAttachment(note.id, file);
      if (result) {
        toast(`${file.name} attached`);
      } else {
        toast('Failed to attach file');
      }
    } catch (err) {
      toast('Failed to attach file');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      } else {
        handleFileUpload(file);
      }
    }
    e.target.value = '';
  };

  const handleRemoveImage = (src: string) => {
    setContent((prev) => {
      const div = document.createElement('div');
      div.innerHTML = prev;
      const imgs = div.querySelectorAll(`img[src="${src}"]`);
      imgs.forEach((img) => img.remove());
      return div.innerHTML;
    });
    const paths = extractImagePaths(content);
    const match = src.match(/\/note-images\/(.+?)(\?|$)/);
    if (match) {
      const path = decodeURIComponent(match[1]);
      if (!paths.includes(path)) {
        deleteNoteImage(path).catch((err) => console.warn('Image delete failed:', err));
      }
    }
  };

  const handleDeleteAttachment = async (attachment: Attachment) => {
    try {
      await onRemoveAttachment(attachment.id);
      toast(`${attachment.name} removed`);
    } catch (err) {
      toast('Failed to remove attachment');
      console.error(err);
    }
  };

  const handleOpenAttachment = async (attachment: Attachment) => {
    let url = attachment.url;
    if (!url) {
      url = await refreshAttachmentUrl(attachment.storagePath);
    }
    if (url) {
      window.open(url, '_blank');
    } else {
      toast('Failed to open file');
    }
  };

  if (!note) {
    return (
      <div className="h-full flex items-center justify-center bg-app" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 text-tertiary" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm text-secondary" style={{ color: 'var(--text-secondary)' }}>
            Select a note or create a new one
          </p>
        </div>
      </div>
    );
  }

  const folderName = folders.find((f) => f.id === note.folderId)?.name || null;

  return (
    <div className="h-full flex flex-col bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            className="lg:hidden p-2 rounded-lg hover-bg text-secondary"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
          {folderName && (
            <span className="text-xs text-tertiary px-2 hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
              {folderName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onTogglePin(note.id)}
            className="p-2 rounded-lg hover-bg text-secondary transition-colors"
            style={{ color: note.pinned ? 'var(--accent)' : 'var(--text-secondary)' }}
            aria-label={note.pinned ? 'Unpin' : 'Pin'}
          >
            {note.pinned ? <Pin size={18} fill="currentColor" /> : <Pin size={18} />}
          </button>

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setMenuOpen(!menuOpen); setMoveOpen(false); }}
              className="p-2 rounded-lg hover-bg text-secondary transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="More options"
            >
              <MoreHorizontal size={18} />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-10 z-50 w-48 rounded-xl shadow-xl border py-1 animate-scale-in"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <MenuBtn
                  icon={note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  label={note.pinned ? 'Unpin' : 'Pin'}
                  onClick={() => { onTogglePin(note.id); setMenuOpen(false); }}
                />
                <MenuBtn
                  icon={note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  label={note.archived ? 'Unarchive' : 'Archive'}
                  onClick={() => { onArchive(note.id, !note.archived); setMenuOpen(false); }}
                />

                {/* Move to folder — flat submenu, NO nested buttons */}
                <div className="relative">
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 transition-colors text-left hover-bg"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setMoveOpen(!moveOpen)}
                  >
                    <FolderIcon size={15} />
                    <span className="flex-1">Move to...</span>
                    <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  {moveOpen && (
                    <div
                      className="absolute left-full top-0 ml-1 w-44 rounded-xl shadow-xl border py-1 animate-scale-in"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuBtn
                        label="No folder"
                        onClick={() => { onMove(note.id, null); setMenuOpen(false); setMoveOpen(false); }}
                      />
                      {folders.map((f) => (
                        <MenuBtn
                          key={f.id}
                          icon={<FolderIcon size={14} />}
                          label={f.name}
                          onClick={() => { onMove(note.id, f.id); setMenuOpen(false); setMoveOpen(false); }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                <MenuBtn
                  icon={<Trash2 size={15} />}
                  label="Move to trash"
                  danger
                  onClick={() => { onTrash(note.id); setMenuOpen(false); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-32">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onPaste={handlePaste}
            placeholder="Title"
            className="w-full text-2xl font-bold bg-transparent outline-none text-app mb-3 placeholder:text-tertiary"
            style={{ color: 'var(--text)' }}
          />
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setContent((e.target as HTMLDivElement).innerHTML)}
            onPaste={handlePaste}
            data-placeholder="Start writing..."
            className="note-content w-full min-h-[200px] outline-none text-app text-sm leading-relaxed"
            style={{ color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: content }}
          />

          {/* Attachments section */}
          {attachments.length > 0 && (
            <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                Attachments ({attachments.length})
              </h3>
              <div className="space-y-2">
                {attachments.map((att) => (
                  <AttachmentItem
                    key={att.id}
                    attachment={att}
                    onOpen={() => handleOpenAttachment(att)}
                    onDelete={() => handleDeleteAttachment(att)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom attachment bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-t flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover-bg text-secondary text-sm transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          <span className="hidden sm:inline">Attach file</span>
        </button>
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover-bg text-secondary text-sm transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ImageIcon size={15} />
          <span className="hidden sm:inline">Add image</span>
        </button>
        {uploading && (
          <span className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
            Uploading...
          </span>
        )}
      </div>

      {/* Image viewer modal */}
      {imageViewer && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setImageViewer(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setImageViewer(null)}
          >
            <X size={24} />
          </button>
          <img
            src={imageViewer}
            alt="Viewer"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function MenuBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 transition-colors text-left hover-bg"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-secondary)' }}
    >
      {icon}
      {label}
    </button>
  );
}

function AttachmentItem({
  attachment,
  onOpen,
  onDelete,
}: {
  attachment: Attachment;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const iconType = getFileIcon(attachment.type, attachment.name);
  const isImage = iconType === 'image';

  const icon = (() => {
    switch (iconType) {
      case 'image': return <ImageIcon size={20} />;
      case 'pdf': return <FileText size={20} />;
      case 'doc': return <FileText size={20} />;
      case 'xls': return <FileSpreadsheet size={20} />;
      case 'ppt': return <FileChartColumn size={20} />;
      case 'zip': return <FileArchive size={20} />;
      case 'txt': return <FileCode size={20} />;
      default: return <FileIcon size={20} />;
    }
  })();

  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-lg border transition-colors hover-bg"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
        {icon}
      </div>
      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium truncate text-app" style={{ color: 'var(--text)' }}>
          {attachment.name}
        </div>
        <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
          {formatFileSize(attachment.size)}
        </div>
      </button>
      <button
        onClick={onOpen}
        className="flex-shrink-0 p-1.5 rounded-lg hover-bg text-tertiary transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Open file"
      >
        <Download size={16} />
      </button>
      <button
        onClick={onDelete}
        className="flex-shrink-0 p-1.5 rounded-lg hover-bg text-tertiary transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Remove attachment"
      >
        <X size={16} />
      </button>
    </div>
  );
}
