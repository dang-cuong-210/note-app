import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Pin,
  PinOff,
  Trash2,
  Copy,
  Folder as FolderIcon,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
    Menu,
  RotateCcw,
  Search,
  Clock3,
  X,
  Plus,
  ChevronRight,
  SlidersHorizontal,
  ArrowDownUp,
} from 'lucide-react';
import type { Note, Folder } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { sortNotes, formatTime } from '@/lib/utils';
import { buildSearchRecords, filterSearchRecords, getNotesInView, getSearchSnippet, highlightSegments, normalizeSearchText, sortSearchNotes } from '@/lib/advancedSearch.js';
import { useToast } from '@/contexts/ToastContext';
import { MobileBottomSheet, MobileNoteActionsSheet, MobileTrashActionsSheet } from '@/components/MobileEditorSheets';

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
  onPermanentDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
  searchQuery: string;
    onOpenSidebar?: () => void;
    onSearchChange: (q: string) => void;
  mobileSearchMode?: boolean;
  hideAddButton?: boolean;
  desktopMode?: boolean;
  mobileMode?: boolean;
  contextTitle?: string;
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
    onOpenSidebar,
  mobileSearchMode = false,
  hideAddButton = false,
  desktopMode = false,
  mobileMode = false,
  contextTitle = 'Tất cả ghi chú',
  }: NoteListProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [pinnedFilter, setPinnedFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [archiveFilter, setArchiveFilter] = useState<'current' | 'active' | 'archived' | 'all'>('current');
  const [sortMode, setSortMode] = useState<'' | 'updated' | 'created' | 'title-asc' | 'title-desc'>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!filterOpen || mobileMode) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [filterOpen, mobileMode]);

  const viewNotes = useMemo(() => getNotesInView(notes, view), [notes, view]);
  const filterSource = useMemo(() => view.kind === 'all' && archiveFilter !== 'current'
    ? notes.filter((note) => !note.trashed)
    : viewNotes, [view.kind, archiveFilter, notes, viewNotes]);
  const searchRecords = useMemo(() => buildSearchRecords(filterSource), [filterSource]);
  const visibleRecords = useMemo(() => filterSearchRecords(searchRecords, {
    query: searchQuery,
    folderId: folderFilter,
    tag: tagFilter,
    pinned: pinnedFilter,
    archive: archiveFilter,
  }, view), [searchRecords, searchQuery, folderFilter, tagFilter, pinnedFilter, archiveFilter, view]);
  const tagsInScope = useMemo(() => [...new Set(searchRecords.flatMap((record) => record.tags))].sort((a, b) => a.localeCompare(b)), [searchRecords]);
  const hasAdvancedFilters = folderFilter !== 'all' || tagFilter !== 'all' || pinnedFilter !== 'all' || (view.kind === 'all' && archiveFilter !== 'current');
  const activeFilterCount = Number(folderFilter !== 'all') + Number(tagFilter !== 'all') + Number(pinnedFilter !== 'all') + Number(view.kind === 'all' && archiveFilter !== 'current');
  const hasSearchOrFilters = Boolean(normalizeSearchText(searchQuery)) || hasAdvancedFilters;
  const filteredNotes = visibleRecords.map((record) => record.note);
  const sorted = sortMode
    ? sortSearchNotes(filteredNotes, sortMode, view.kind !== 'recent' && view.kind !== 'trash')
    : view.kind === 'trash'
      ? [...filteredNotes].sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0))
      : view.kind === 'recent'
        ? [...filteredNotes].sort((a, b) => b.updatedAt - a.updatedAt)
        : sortNotes(filteredNotes, settings);
  const recordById = useMemo(() => new Map(visibleRecords.map((record) => [record.note.id, record])), [visibleRecords]);
  const menuNote = sorted.find((note) => note.id === menuFor) || null;

  const clearSearchAndFilters = () => {
    onSearchChange('');
    setFolderFilter('all');
    setTagFilter('all');
    setPinnedFilter('all');
    setArchiveFilter('current');
    setSortMode('');
    setFilterOpen(false);
    setMobileControlsOpen(false);
  };

  const filterControls = <FilterControls
    folders={folders}
    tags={tagsInScope}
    folderFilter={folderFilter}
    tagFilter={tagFilter}
    pinnedFilter={pinnedFilter}
    archiveFilter={archiveFilter}
    showArchive={view.kind === 'all'}
    onFolderChange={setFolderFilter}
    onTagChange={setTagFilter}
    onPinnedChange={setPinnedFilter}
    onArchiveChange={setArchiveFilter}
  />;

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name || null;
  const noteTime = (timestamp: number) => desktopMode
    ? new Date(timestamp).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    : formatTime(timestamp);

  // Close menu on outside click/touch
  useEffect(() => {
    if (!menuFor || mobileMode) return;
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
  }, [menuFor, mobileMode]);

  const handleTrash = (note: Note) => {
    onTrash(note.id);
    toast('Đã chuyển ghi chú vào thùng rác', {
      label: 'Hoàn tác',
      onClick: () => onRestore(note.id),
    });
  };

  const handleArchive = (note: Note) => {
    onArchive(note.id, !note.archived);
    toast(note.archived ? 'Đã bỏ lưu trữ ghi chú' : 'Đã lưu trữ ghi chú', {
      label: 'Hoàn tác',
      onClick: () => onArchive(note.id, note.archived),
    });
  };

  const handleDelete = async (note: Note) => {
    try {
      await onPermanentDelete(note.id);
    } catch {
      // The parent reports the error and the note remains visible.
    }
  };

  const showAddButton = !hideAddButton && view.kind !== 'trash' && view.kind !== 'settings' && view.kind !== 'archived';

  return (
    <div className={`h-full w-full max-lg:min-w-0 max-lg:max-w-full max-lg:pb-[calc(72px+env(safe-area-inset-bottom))] flex flex-col bg-app ${desktopMode ? 'tanooki-desktop-note-list' : ''}`} style={{ backgroundColor: 'var(--bg)' }}>
      {desktopMode && <div className="tanooki-desktop-list-heading px-4 pt-4"><h2>{contextTitle}</h2><span>{sorted.length} ghi chú</span></div>}
      {/* Search bar */}
      <div className="px-4 pt-2 pb-2 sticky top-0 z-10 bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {mobileSearchMode && <h1 className="mb-3 px-1 text-xl font-bold" style={{ color: 'var(--text)' }}>Tìm kiếm</h1>}
      <div className="flex items-center gap-2">
      <button
              type="button"
                      aria-label="Mở thanh điều hướng"
                              title="Mở thanh điều hướng"
                                      onClick={onOpenSidebar}
                                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border lg:hidden"
                                                      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                                                            >
                                                                      <Menu size={20} aria-hidden="true" />
                                                                            </button>
          <div className="relative flex-1 min-w-0">

            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm kiếm ghi chú..."
              aria-label="Tìm kiếm ghi chú"
              data-global-search
              className="w-full bg-secondary text-app text-sm rounded-lg pl-9 pr-8 py-2 outline-none transition-colors placeholder:text-tertiary"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover-text-app p-1"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Xóa nội dung tìm kiếm"
                title="Xóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="relative" ref={filterPanelRef}>
            <button
              type="button"
              onClick={() => mobileMode ? setMobileControlsOpen(true) : setFilterOpen((open) => !open)}
              aria-expanded={mobileMode ? mobileControlsOpen : filterOpen}
              aria-label={activeFilterCount ? `Bộ lọc, ${activeFilterCount} bộ lọc đang bật` : 'Bộ lọc'}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors hover-bg"
              style={{ borderColor: 'var(--border)', color: activeFilterCount ? 'var(--accent)' : 'var(--text-secondary)', backgroundColor: 'var(--bg)' }}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>Bộ lọc</span>
              {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs text-white" style={{ backgroundColor: 'var(--accent)' }}>{activeFilterCount}</span>}
            </button>
            {filterOpen && !mobileMode && <div className="absolute left-0 top-full z-30 mt-2 w-[min(340px,calc(100vw-32px))] rounded-xl border p-3 shadow-xl" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)', boxShadow: '0 12px 32px rgba(0,0,0,.14)' }}>
              {filterControls}
              {hasAdvancedFilters && <button type="button" onClick={clearSearchAndFilters} className="mt-3 text-sm font-medium" style={{ color: 'var(--accent)' }}>Xóa bộ lọc</button>}
            </div>}
          </div>
          {mobileMode ? (
            <button type="button" onClick={() => setMobileControlsOpen(true)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg)' }} aria-label="Sắp xếp ghi chú">
              <ArrowDownUp size={16} aria-hidden="true" /> Sắp xếp
            </button>
          ) : (
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span>Sắp xếp</span>
              <SortSelect value={sortMode} onChange={setSortMode} />
            </label>
          )}
        </div>
        </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2">
        {view.kind === 'trash' && (
          <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Ghi chú trong thùng rác sẽ bị xóa vĩnh viễn sau 7 ngày.
          </p>
        )}
        {sorted.length === 0 ? (
          hasSearchOrFilters && filterSource.length > 0
            ? <FilteredEmptyState onClear={clearSearchAndFilters} />
            : <EmptyState view={view} />
        ) : (
          <div className="space-y-0.5">
            {sorted.map((note) => {
              const selected = note.id === selectedNoteId;
              const fn = folderName(note.folderId);
              const record = recordById.get(note.id);
              const bodyMatched = Boolean(normalizeSearchText(searchQuery) && record?.bodyNormalized.includes(normalizeSearchText(searchQuery)));
              const preview = record?.bodyText
                ? bodyMatched ? getSearchSnippet(record.bodyText, searchQuery) : record.bodyText.length > 120 ? `${record.bodyText.slice(0, 120)}…` : record.bodyText
                : 'Chưa có nội dung';
              return (
                <div
                  key={note.id}
                  className="relative"
                  ref={menuFor === note.id ? menuRef : undefined}
                >
                  <button
                    onClick={() => onSelectNote(note.id)}
                    className={`tanooki-desktop-note-row w-full text-left px-3 py-3 rounded-lg transition-colors ${selected ? 'is-selected' : ''} ${
                      selected ? 'bg-accent-light' : 'hover-bg'
                    } ${menuFor === note.id ? 'bg-accent-light' : ''}`}
                    style={selected || menuFor === note.id ? { backgroundColor: desktopMode && selected ? 'var(--selection)' : 'var(--accent-light)' } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h3
                        className={`font-semibold text-sm truncate ${selected ? 'text-accent' : 'text-app'}`}
                        style={{ color: selected ? 'var(--accent)' : 'var(--text)' }}
                      >
                        {note.title.trim()
                          ? <HighlightedText text={note.title} query={searchQuery} />
                          : 'Chưa có tiêu đề'}
                      </h3>
                      <span className="text-xs text-tertiary flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                        {view.kind === 'trash' ? noteTime(note.trashedAt || note.updatedAt) : noteTime(note.updatedAt)}
                      </span>
                    </div>
                    <p
                      className="note-preview text-secondary text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {record?.bodyText ? <HighlightedText text={preview} query={searchQuery} /> : 'Chưa có nội dung'}
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
                      aria-label="Thao tác ghi chú"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>

                  {/* Dropdown menu */}
                  {menuFor === note.id && !mobileMode && (
                    <div
                      className="absolute right-2 top-9 z-50 w-48 rounded-xl shadow-xl border border-app py-1 animate-scale-in"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {view.kind !== 'trash' && (
                        <MenuItem icon={note.pinned ? <PinOff size={15} /> : <Pin size={15} />} label={note.pinned ? 'Bỏ ghim' : 'Ghim'} onClick={() => { onTogglePin(note.id); setMenuFor(null); }} />
                      )}
                      {view.kind !== 'trash' && (
                        <MenuItem icon={<Copy size={15} />} label="Tạo bản sao" onClick={() => { onDuplicate(note.id); setMenuFor(null); }} />
                      )}
                      {view.kind !== 'trash' && (
                        <MenuItem icon={note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} label={note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'} onClick={() => { handleArchive(note); setMenuFor(null); }} />
                      )}
                      {view.kind !== 'trash' && (
                        <div className="relative">
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover-bg text-left rounded-lg mx-1 transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onClick={() => setMoveFor(moveFor === note.id ? null : note.id)}
                          >
                            <FolderIcon size={15} />
                            <span className="flex-1">Chuyển đến...</span>
                            <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                          </button>
                          {moveFor === note.id && (
                            <div
                              className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl shadow-xl border border-app py-1 animate-scale-in"
                              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MenuItem label="Không có thư mục" onClick={() => { onMove(note.id, null); setMenuFor(null); setMoveFor(null); }} />
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
                          <MenuItem icon={<RotateCcw size={15} />} label="Khôi phục" onClick={() => { onRestore(note.id); setMenuFor(null); }} />
                          <MenuItem icon={<Trash2 size={15} />} label="Xóa vĩnh viễn" danger onClick={() => { handleDelete(note); setMenuFor(null); }} />
                        </>
                      ) : (
                        <MenuItem icon={<Trash2 size={15} />} label="Chuyển vào thùng rác" danger onClick={() => { handleTrash(note); setMenuFor(null); }} />
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
          aria-label="Ghi chú mới"
        >
          <Plus size={24} />
        </button>
      )}

      {mobileMode && menuNote && view.kind === 'trash' && <MobileTrashActionsSheet note={menuNote} open onClose={() => setMenuFor(null)} onRestore={onRestore} onPermanentDelete={() => { void handleDelete(menuNote); }} />}
      {mobileMode && menuNote && view.kind !== 'trash' && <MobileNoteActionsSheet
        note={menuNote}
        folders={folders}
        open
        onClose={() => setMenuFor(null)}
        onTogglePin={onTogglePin}
        onArchive={() => handleArchive(menuNote)}
        onMove={onMove}
        onDuplicate={onDuplicate}
        onTrash={(id) => { const target = sorted.find((item) => item.id === id); if (target) handleTrash(target); }}
      />}
      {mobileMode && <MobileBottomSheet open={mobileControlsOpen} title="Bộ lọc và sắp xếp" onClose={() => setMobileControlsOpen(false)} labelledBy="mobile-note-filters">
        <div className="tanooki-mobile-sheet-group">
          {filterControls}
          <label className="tanooki-mobile-sheet-select mt-3"><span>Sắp xếp</span><SortSelect value={sortMode} onChange={setSortMode} /></label>
          {hasSearchOrFilters && <button type="button" onClick={clearSearchAndFilters} className="mt-3 min-h-11 w-full rounded-lg font-medium" style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-light)' }}>Xóa bộ lọc và tìm kiếm</button>}
        </div>
      </MobileBottomSheet>}
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

function FilterControls({
  folders,
  tags,
  folderFilter,
  tagFilter,
  pinnedFilter,
  archiveFilter,
  showArchive,
  onFolderChange,
  onTagChange,
  onPinnedChange,
  onArchiveChange,
}: {
  folders: Folder[];
  tags: string[];
  folderFilter: string;
  tagFilter: string;
  pinnedFilter: 'all' | 'pinned' | 'unpinned';
  archiveFilter: 'current' | 'active' | 'archived' | 'all';
  showArchive: boolean;
  onFolderChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onPinnedChange: (value: 'all' | 'pinned' | 'unpinned') => void;
  onArchiveChange: (value: 'current' | 'active' | 'archived' | 'all') => void;
}) {
  const selectClass = 'mt-1 min-h-10 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-2';
  const selectStyle = { borderColor: 'var(--border)', backgroundColor: 'var(--bg)', color: 'var(--text)' };
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Thư mục
      <select className={selectClass} style={selectStyle} value={folderFilter} onChange={(event) => onFolderChange(event.target.value)} aria-label="Lọc theo thư mục">
        <option value="all">Tất cả thư mục</option>
        <option value="none">Không có thư mục</option>
        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>
    </label>
    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Thẻ
      <select className={selectClass} style={selectStyle} value={tagFilter} onChange={(event) => onTagChange(event.target.value)} aria-label="Lọc theo thẻ">
        <option value="all">Tất cả thẻ</option>
        {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
      </select>
    </label>
    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Ghim
      <select className={selectClass} style={selectStyle} value={pinnedFilter} onChange={(event) => onPinnedChange(event.target.value as 'all' | 'pinned' | 'unpinned')} aria-label="Lọc ghi chú đã ghim">
        <option value="all">Tất cả</option>
        <option value="pinned">Đã ghim</option>
        <option value="unpinned">Chưa ghim</option>
      </select>
    </label>
    {showArchive && <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Trạng thái lưu trữ
      <select className={selectClass} style={selectStyle} value={archiveFilter} onChange={(event) => onArchiveChange(event.target.value as 'current' | 'active' | 'archived' | 'all')} aria-label="Lọc theo trạng thái lưu trữ">
        <option value="current">Theo mục hiện tại</option>
        <option value="active">Đang hoạt động</option>
        <option value="archived">Đã lưu trữ</option>
        <option value="all">Tất cả (trừ thùng rác)</option>
      </select>
    </label>}
  </div>;
}

function SortSelect({ value, onChange }: { value: '' | 'updated' | 'created' | 'title-asc' | 'title-desc'; onChange: (value: '' | 'updated' | 'created' | 'title-asc' | 'title-desc') => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as typeof value)} aria-label="Sắp xếp ghi chú" className="min-h-9 max-w-40 rounded-lg border px-2 text-xs outline-none focus-visible:ring-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
    <option value="">Mặc định</option>
    <option value="updated">Cập nhật gần nhất</option>
    <option value="created">Mới tạo</option>
    <option value="title-asc">Tên A–Z</option>
    <option value="title-desc">Tên Z–A</option>
  </select>;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return <>{highlightSegments(text, query).map((segment, index) => segment.match
    ? <mark key={index} className="rounded-sm px-px" style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-light)' }}>{segment.text}</mark>
    : <span key={index}>{segment.text}</span>)}</>;
}

function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
    <Search size={36} className="mb-3" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
    <h2 className="mb-1 text-base font-semibold" style={{ color: 'var(--text)' }}>Không tìm thấy ghi chú phù hợp.</h2>
    <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Thử đổi từ khóa hoặc xóa các bộ lọc đang áp dụng.</p>
    <button type="button" onClick={onClear} className="min-h-10 rounded-lg px-4 text-sm font-semibold" style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-light)' }}>Xóa bộ lọc</button>
  </div>;
}

function EmptyState({ view }: { view: ViewType }) {
  let title = 'Chưa có ghi chú';
  let message = 'Tạo ghi chú đầu tiên để bắt đầu.';
  let icon = <Plus size={40} />;

  if (view.kind === 'pinned') {
    title = 'Chưa có ghi chú được ghim';
    message = 'Ghim ghi chú quan trọng để xem lại tại đây.';
    icon = <Pin size={40} />;
  } else if (view.kind === 'archived') {
    title = 'Chưa có ghi chú lưu trữ';
    message = 'Ghi chú lưu trữ sẽ xuất hiện tại đây.';
    icon = <Archive size={40} />;
  } else if (view.kind === 'trash') {
    title = 'Thùng rác đang trống';
    message = 'Ghi chú đã xóa sẽ xuất hiện tại đây.';
    icon = <Trash2 size={40} />;
  } else if (view.kind === 'folder') {
    title = 'Thư mục chưa có ghi chú';
    message = 'Tạo ghi chú hoặc chuyển ghi chú vào thư mục này.';
    icon = <FolderIcon size={40} />;
  } else if (view.kind === 'tag') {
    title = `Chưa có ghi chú với thẻ #${view.name}`;
    message = 'Thêm thẻ vào nội dung ghi chú để xem tại đây.';
    icon = <FolderIcon size={40} />;
  } else if (view.kind === 'recent') {
    title = 'Chưa có ghi chú gần đây';
    message = 'Các ghi chú đang hoạt động sẽ xuất hiện ở đây.';
    icon = <Clock3 size={40} />;
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
