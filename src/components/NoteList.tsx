import { useState, useRef, useEffect } from 'react';
import {
  Pin,
  PinOff,
  Trash2,
  Copy,
  Folder as FolderIcon,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  RotateCcw,
  Search,
  X,
  Plus,
  ChevronRight,
} from 'lucide-react';
import type { Note, Folder } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { sortNotes, formatTime, getPreview, htmlToText } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';

interface NoteListProps {
  notes: Note[];
  folders: Folder[];
  view: ViewType;
  settings: { sortBy: 'updated' | 'created' | 'title'; sortDir: 'asc' | 'desc' };
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onAddNote: () => void;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function NoteList({
  notes,
  folders,
  view,
  settings,
  selectedNoteId,
  onSelectNote,
  onAddNote,
  onTogglePin,
  onTrash,
  onRestore,
  onPermanentDelete,
  onDuplicate,
  onArchive,
  onMove,
  searchQuery,
  onSearchChange,
}: NoteListProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Filter notes for current view
  const filteredNotes = notes.filter((n) => {
    switch (view.kind) {
      case 'all': return !n.trashed && !n.archived;
      case 'pinned': return !n.trashed && !n.archived && n.pinned;
      case 'archived': return !n.trashed && n.archived;
      case 'trash': return n.trashed;
      case 'folder': return !n.trashed && !n.archived && n.folderId === view.id;
      case 'tag': return !n.trashed && !n.archived && htmlToText(n.content).toLowerCase().includes('#' + view.name.toLowerCase());
      default: return false;
    }
  });

  // Apply search
  const searched = searchQuery.trim()
    ? filteredNotes.filter((n) => {
        const q = searchQuery.toLowerCase();
        return n.title.toLowerCase().includes(q) || htmlToText(n.content).toLowerCase().includes(q);
      })
    : filteredNotes;

  const sorted = view.kind === 'trash' ? [...searched].sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0)) : sortNotes(searched, settings);

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name || null;

  // Close menu on outside click/touch
  useEffect(() => {
    if (!menuFor) return;
    const handler = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFor(null);
        setMoveFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuFor]);

  const handleTrash = (note: Note) => {
    onTrash(note.id);
    toast('Note moved to trash', {
      label: 'Undo',
      onClick: () => onRestore(note.id),
    });
  };

  const handleArchive = (note: Note) => {
    onArchive(note.id, !note.archived);
    toast(note.archived ? 'Note unarchived' : 'Note archived', {
      label: 'Undo',
      onClick: () => onArchive(note.id, note.archived),
    });
  };

  const handleDelete = (note: Note) => {
    onPermanentDelete(note.id);
    toast('Note permanently deleted');
  };

  const showAddButton = view.kind !== 'trash' && view.kind !== 'settings' && view.kind !== 'archived';

  return (
    <div className="h-full flex flex-col bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Search bar */}
      {view.kind !== 'trash' && (
        <div className="px-4 pt-4 pb-2 sticky top-0 z-10 bg-app" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search notes"
              className="w-full bg-secondary text-app text-sm rounded-lg pl-9 pr-8 py-2 outline-none transition-colors placeholder:text-tertiary"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)' }}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover-text-app p-1"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2">
        {sorted.length === 0 ? (
          <EmptyState view={view} hasSearch={!!searchQuery.trim()} />
        ) : (
          <div className="space-y-0.5">
            {sorted.map((note) => {
              const selected = note.id === selectedNoteId;
              const fn = folderName(note.folderId);
              return (
                <div
                  key={note.id}
                  className="relative"
                >
                  <button
                    onClick={() => onSelectNote(note.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                      selected ? 'bg-accent-light' : 'hover-bg'
                    } ${menuFor === note.id ? 'bg-accent-light' : ''}`}
                    style={selected || menuFor === note.id ? { backgroundColor: 'var(--accent-light)' } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h3
                        className={`font-semibold text-sm truncate ${selected ? 'text-accent' : 'text-app'}`}
                        style={{ color: selected ? 'var(--accent)' : 'var(--text)' }}
                      >
                        {note.title || 'Untitled'}
                      </h3>
                      <span className="text-xs text-tertiary flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                        {view.kind === 'trash' ? formatTime(note.trashedAt || note.updatedAt) : formatTime(note.updatedAt)}
                      </span>
                    </div>
                    <p
                      className="note-preview text-secondary text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {getPreview(note.content) || 'No additional text'}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {note.pinned && (
                        <span className="flex items-center gap-0.5 text-xs text-accent" style={{ color: 'var(--accent)' }}>
                          <Pin size={11} fill="currentColor" />
                        </span>
                      )}
                      {fn && (
                        <span className="flex items-center gap-0.5 text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
                          <FolderIcon size={11} />
                          {fn}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Action menu button — always visible, touch-friendly */}
                  <div
                    className="absolute right-2 top-2"
                    ref={menuFor === note.id ? menuRef : undefined}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor === note.id ? null : note.id);
                        setMoveFor(null);
                      }}
                      className="p-1.5 rounded-lg hover-bg text-tertiary transition-colors"
                      style={{
                        color: 'var(--text-tertiary)',
                        backgroundColor: selected || menuFor === note.id ? 'var(--accent-light)' : 'var(--bg)',
                        opacity: menuFor === note.id ? 1 : undefined,
                      }}
                      aria-label="Note actions"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>

                  {/* Dropdown menu */}
                  {menuFor === note.id && (
                    <div
                      className="absolute right-2 top-9 z-50 w-48 rounded-xl shadow-xl border border-app py-1 animate-scale-in"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {view.kind !== 'trash' && (
                        <MenuItem icon={note.pinned ? <PinOff size={15} /> : <Pin size={15} />} label={note.pinned ? 'Unpin' : 'Pin'} onClick={() => { onTogglePin(note.id); setMenuFor(null); }} />
                      )}
                      {view.kind !== 'trash' && (
                        <MenuItem icon={<Copy size={15} />} label="Duplicate" onClick={() => { onDuplicate(note.id); setMenuFor(null); }} />
                      )}
                      {view.kind !== 'trash' && (
                        <MenuItem icon={note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} label={note.archived ? 'Unarchive' : 'Archive'} onClick={() => { handleArchive(note); setMenuFor(null); }} />
                      )}
                      {view.kind !== 'trash' && (
                        <div className="relative">
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover-bg text-left rounded-lg mx-1 transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onClick={() => setMoveFor(moveFor === note.id ? null : note.id)}
                          >
                            <FolderIcon size={15} />
                            <span className="flex-1">Move to...</span>
                            <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                          </button>
                          {moveFor === note.id && (
                            <div
                              className="absolute right-48 top-0 w-44 rounded-xl shadow-xl border border-app py-1 animate-scale-in"
                              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MenuItem label="No folder" onClick={() => { onMove(note.id, null); setMenuFor(null); setMoveFor(null); }} />
                              {folders.map((f) => (
                                <MenuItem key={f.id} label={f.name} icon={<FolderIcon size={14} />} onClick={() => { onMove(note.id, f.id); setMenuFor(null); setMoveFor(null); }} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                      {view.kind === 'trash' ? (
                        <>
                          <MenuItem icon={<RotateCcw size={15} />} label="Restore" onClick={() => { onRestore(note.id); setMenuFor(null); }} />
                          <MenuItem icon={<Trash2 size={15} />} label="Delete forever" danger onClick={() => { handleDelete(note); setMenuFor(null); }} />
                        </>
                      ) : (
                        <MenuItem icon={<Trash2 size={15} />} label="Move to trash" danger onClick={() => { handleTrash(note); setMenuFor(null); }} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      {showAddButton && (
        <button
          onClick={onAddNote}
          className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform z-20"
          style={{ backgroundColor: 'var(--accent)', color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
          aria-label="New note"
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}

function MenuItem({
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

function EmptyState({ view, hasSearch }: { view: ViewType; hasSearch: boolean }) {
  let title = 'No notes yet';
  let message = 'Tap the + button to create your first note.';
  let icon = <Plus size={40} />;

  if (hasSearch) {
    title = 'No results';
    message = 'Try a different search term.';
    icon = <Search size={40} />;
  } else if (view.kind === 'pinned') {
    title = 'No pinned notes';
    message = 'Pin important notes to find them quickly here.';
    icon = <Pin size={40} />;
  } else if (view.kind === 'archived') {
    title = 'No archived notes';
    message = 'Archived notes will appear here.';
    icon = <Archive size={40} />;
  } else if (view.kind === 'trash') {
    title = 'Trash is empty';
    message = 'Deleted notes will appear here for 30 days.';
    icon = <Trash2 size={40} />;
  } else if (view.kind === 'folder') {
    title = 'No notes in this folder';
    message = 'Create a note or move existing notes here.';
    icon = <FolderIcon size={40} />;
  } else if (view.kind === 'tag') {
    title = `No notes tagged #${view.name}`;
    message = 'Add #tag to a note to see it here.';
    icon = <FolderIcon size={40} />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center py-20">
      <div className="text-tertiary mb-4" style={{ color: 'var(--text-tertiary)' }}>
        {icon}
      </div>
      <h2 className="text-base font-semibold text-app mb-1" style={{ color: 'var(--text)' }}>{title}</h2>
      <p className="text-sm text-secondary" style={{ color: 'var(--text-secondary)' }}>{message}</p>
    </div>
  );
}
