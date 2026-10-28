import { useState, useRef, useEffect, useLayoutEffect, useMemo, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
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
  ChevronLeft,
  RotateCcw,
  Search,
  Clock3,
  X,
  Plus,
  ChevronRight,
  SlidersHorizontal,
  ArrowDownUp,
  Grid2X2,
  List,
  Check,
  Paperclip,
  MoveRight,
  Edit3,
  Image as ImageIcon,
  Share2,
} from 'lucide-react';
import type { Note, Folder, Attachment } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { sortNotes, formatTime } from '@/lib/utils';
import { buildSearchRecords, filterSearchRecords, getNotesInView, getSearchSnippet, highlightSegments, normalizeSearchText, rankSearchRecords, sortSearchNotes } from '@/lib/advancedSearch.js';
import { useToast } from '@/contexts/ToastContext';
import { MobileBottomSheet, MobileFolderRenameSheet } from '@/components/MobileEditorSheets';
import { confirmPermanentTrashDelete } from '@/lib/trashActions.js';
import { formatMobileAllNoteDate, groupMobileAllNotes } from '@/lib/mobileAllNotes.js';
import { getEffectiveRecentTime, getRecentNotes, groupMobileRecentNotes } from '@/lib/recentNotes.js';
import { getMobileChildFolders, getMobileFolderSummary } from '@/lib/mobileFolderArchive.js';
import { getFolderAncestorIds, getFolderHierarchy, getFolderOptionLabel } from '@/lib/folderHierarchy.js';
import { clearRecentSearches, loadRecentSearches, recordRecentSearch, removeRecentSearch } from '@/lib/recentSearches.js';
import { readMobileAllNotesGallery, writeMobileAllNotesGallery } from '@/lib/mobileAllNotesView.js';
import { refreshAttachmentUrl } from '@/lib/attachments';
import { MobileContextPopover } from '@/components/MobileContextPopover';
import { useMobileLongPress, type MobileContextTarget } from '@/components/useMobileLongPress';
import { DesktopContextMenu, type DesktopMenuPoint } from '@/components/DesktopContextMenu';
import { announceDesktopContextMenu, openDesktopMenuWithKeyboard } from '@/lib/desktopContextMenuEvents';
import { shareNoteContent } from '@/lib/shareNote';

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
  searchAccountId?: string | null;
  mobileSearchMode?: boolean;
  mobileAllNotesMode?: boolean;
  mobileRecentMode?: boolean;
  recentOpenedAt?: Record<string, number>;
  onBackFromRecent?: () => void;
  mobileTrashMode?: boolean;
  mobileWorkspaceMode?: boolean;
  onBackToHome?: () => void;
  onOpenFolder?: (id: string) => void;
  onAddFolder?: (name: string, parentId?: string | null) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  hideAddButton?: boolean;
  desktopMode?: boolean;
  mobileMode?: boolean;
  contextTitle?: string;
  attachments?: Attachment[];
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
  searchAccountId = null,
    onOpenSidebar,
  mobileSearchMode = false,
  mobileAllNotesMode = false,
  mobileRecentMode = false,
  recentOpenedAt = {},
  onBackFromRecent,
  mobileTrashMode = false,
  mobileWorkspaceMode = false,
  onBackToHome,
  onOpenFolder,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  hideAddButton = false,
  desktopMode = false,
  mobileMode = false,
  contextTitle = 'Tất cả ghi chú',
  attachments = [],
  }: NoteListProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [desktopContextMenu, setDesktopContextMenu] = useState<{ kind: 'note' | 'folder'; id: string; point: DesktopMenuPoint } | null>(null);
  const [longPressTarget, setLongPressTarget] = useState<MobileContextTarget | null>(null);
  const [longPressClosing, setLongPressClosing] = useState(false);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [pinnedFilter, setPinnedFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [archiveFilter, setArchiveFilter] = useState<'current' | 'active' | 'archived' | 'all'>('current');
  const [recentlyUpdated, setRecentlyUpdated] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'' | 'updated' | 'created' | 'title-asc' | 'title-desc'>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileAllNotesMenuOpen, setMobileAllNotesMenuOpen] = useState(false);
  const [mobileAllNotesGallery, setMobileAllNotesGallery] = useState(() => readMobileAllNotesGallery());
  const [mobileAllNotesSelectionMode, setMobileAllNotesSelectionMode] = useState(false);
  const [selectedAllNoteIds, setSelectedAllNoteIds] = useState<string[]>([]);
  const [mobileAllNotesMoveOpen, setMobileAllNotesMoveOpen] = useState(false);
  const [mobileAllNotesMoveFolder, setMobileAllNotesMoveFolder] = useState('none');
  const [mobileAttachmentsOpen, setMobileAttachmentsOpen] = useState(false);
  const [desktopAttachmentsOpen, setDesktopAttachmentsOpen] = useState(false);
  const [desktopAttachmentFilter, setDesktopAttachmentFilter] = useState<'all' | 'images' | 'drawings' | 'files'>('all');
  const [desktopMoveOpen, setDesktopMoveOpen] = useState(false);
  const [trashSelectionMode, setTrashSelectionMode] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState<string[]>([]);
  const [workspaceOptionsOpen, setWorkspaceOptionsOpen] = useState(false);
  const [desktopFolderCreateOpen, setDesktopFolderCreateOpen] = useState(false);
  const [desktopFolderName, setDesktopFolderName] = useState('');
  const [folderSectionExpanded, setFolderSectionExpanded] = useState(true);
  const [folderAction, setFolderAction] = useState<'menu' | 'rename' | 'add-child'>('menu');
  const [folderActionName, setFolderActionName] = useState('');
  const [contextFolderRenameId, setContextFolderRenameId] = useState<string | null>(null);
  const [contextFolderRenameName, setContextFolderRenameName] = useState('');
  const [contextMoveOpen, setContextMoveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileAllNotesMoreRef = useRef<HTMLButtonElement>(null);
  const mobileAllNotesMenuRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const notesScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const longPressCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const closeLongPress = (afterClose?: () => void) => {
    if (!longPressTarget) return;
    if (longPressCloseTimer.current) clearTimeout(longPressCloseTimer.current);
    setLongPressClosing(true);
    longPressCloseTimer.current = setTimeout(() => {
      setLongPressTarget(null);
      setLongPressClosing(false);
      longPressCloseTimer.current = null;
      afterClose?.();
    }, 150);
  };
  const longPressHandlers = useMobileLongPress((target) => {
    if (longPressCloseTimer.current) clearTimeout(longPressCloseTimer.current);
    longPressCloseTimer.current = null;
    setLongPressClosing(false);
    setContextMoveOpen(false);
    setLongPressTarget(target);
  });

  useEffect(() => () => {
    if (longPressCloseTimer.current) clearTimeout(longPressCloseTimer.current);
  }, []);

  useLayoutEffect(() => {
    if ((mobileAllNotesMode || mobileRecentMode) && notesScrollRef.current) notesScrollRef.current.scrollTop = 0;
  }, [mobileAllNotesMode, mobileRecentMode]);

  useEffect(() => {
    if (longPressCloseTimer.current) clearTimeout(longPressCloseTimer.current);
    longPressCloseTimer.current = null;
    setLongPressClosing(false);
    setLongPressTarget(null);
  }, [view]);

  useEffect(() => {
    setDesktopContextMenu(null);
    setMenuFor(null);
    setMoveFor(null);
  }, [view]);

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
    recentlyUpdated,
  }, view), [searchRecords, searchQuery, folderFilter, tagFilter, pinnedFilter, archiveFilter, recentlyUpdated, view]);
  const tagsInScope = useMemo(() => [...new Set(searchRecords.flatMap((record) => record.tags))].sort((a, b) => a.localeCompare(b)), [searchRecords]);
  const { sortBy, sortDir } = settings;
  const hasAdvancedFilters = folderFilter !== 'all' || tagFilter !== 'all' || pinnedFilter !== 'all' || recentlyUpdated || (view.kind === 'all' && archiveFilter !== 'current');
  const activeFilterCount = Number(folderFilter !== 'all') + Number(tagFilter !== 'all') + Number(pinnedFilter !== 'all') + Number(recentlyUpdated) + Number(view.kind === 'all' && archiveFilter !== 'current');
  const hasSearchOrFilters = Boolean(normalizeSearchText(searchQuery)) || hasAdvancedFilters;
  const sorted = useMemo(() => {
    const filteredNotes = visibleRecords.map((record) => record.note);
    return normalizeSearchText(searchQuery)
      ? rankSearchRecords(visibleRecords, searchQuery).map((record) => record.note)
      : view.kind === 'recent'
      ? getRecentNotes(filteredNotes, recentOpenedAt)
      : sortMode
      ? sortSearchNotes(filteredNotes, sortMode, view.kind !== 'trash')
      : view.kind === 'trash'
        ? [...filteredNotes].sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0))
        : sortNotes(filteredNotes, { sortBy, sortDir });
  }, [visibleRecords, sortMode, view.kind, sortBy, sortDir, recentOpenedAt, searchQuery]);
  const recordById = useMemo(() => new Map(visibleRecords.map((record) => [record.note.id, record])), [visibleRecords]);
  const mobileAllNoteGroups = useMemo(() => groupMobileAllNotes(sorted), [sorted]);
  const mobileRecentGroups = useMemo(() => groupMobileRecentNotes(sorted, recentOpenedAt), [sorted, recentOpenedAt]);
  const desktopWorkspaceMode = desktopMode && (view.kind === 'all' || view.kind === 'folder');
  const selectionWorkspaceMode = mobileAllNotesMode || desktopWorkspaceMode;
  const visibleNoteIdSet = useMemo(() => new Set(selectionWorkspaceMode ? sorted.map((note) => note.id) : []), [selectionWorkspaceMode, sorted]);
  const workspaceAttachments = useMemo(() => selectionWorkspaceMode ? attachments.filter((attachment) => visibleNoteIdSet.has(attachment.noteId)) : [], [attachments, selectionWorkspaceMode, visibleNoteIdSet]);
  const workspaceInlineImages = useMemo(() => sorted.flatMap((note) => {
    if (!selectionWorkspaceMode || typeof DOMParser === 'undefined') return [];
    const parsed = new DOMParser().parseFromString(note.content || '', 'text/html');
    return [...parsed.querySelectorAll('img[src]')].map((image, index) => ({
      src: image.getAttribute('src') || '',
      name: image.getAttribute('alt') || `${note.title.trim() || 'Ghi chú'} · Hình ảnh ${index + 1}`,
      noteTitle: note.title.trim() || 'Chưa có tiêu đề',
      noteId: note.id,
      drawing: image.hasAttribute('data-note-drawing') || image.classList.contains('noted-drawing') || (image.getAttribute('alt') || '').startsWith('tanooki-drawing-'),
    })).filter((image) => image.src);
  }), [selectionWorkspaceMode, sorted]);
  const workspaceAttachmentCount = workspaceAttachments.length + workspaceInlineImages.length;
  const mobileVisibleAttachments = mobileAllNotesMode ? workspaceAttachments : [];
  const mobileVisibleInlineImages = mobileAllNotesMode ? workspaceInlineImages : [];
  const visibleWorkspaceAttachments = useMemo(() => {
    const entries = [
      ...workspaceInlineImages.map((image) => ({ kind: image.drawing ? 'drawings' as const : 'images' as const, id: `inline:${image.noteId}:${image.src}`, name: image.name, noteTitle: image.noteTitle, noteId: image.noteId, type: 'image/*', url: image.src, storagePath: '' })),
      ...workspaceAttachments.map((attachment) => ({ kind: attachment.type.startsWith('image/') ? 'images' as const : 'files' as const, id: attachment.id, name: attachment.name, noteTitle: sorted.find((note) => note.id === attachment.noteId)?.title.trim() || 'Chưa có tiêu đề', noteId: attachment.noteId, type: attachment.type, url: attachment.url, storagePath: attachment.storagePath, attachment })),
    ];
    return desktopAttachmentFilter === 'all' ? entries : entries.filter((entry) => entry.kind === desktopAttachmentFilter);
  }, [desktopAttachmentFilter, sorted, workspaceAttachments, workspaceInlineImages]);
  const currentFolder = view.kind === 'folder' ? folders.find((folder) => folder.id === view.id) ?? null : null;
  const currentFolderAncestorIds = currentFolder ? getFolderAncestorIds(folders, currentFolder.id) : [];
  const currentFolderBreadcrumb = currentFolderAncestorIds.map((id) => folders.find((folder) => folder.id === id)?.name).filter(Boolean).join(' / ');
  const currentFolderId = view.kind === 'folder' ? view.id : null;
  const allChildFolders = useMemo(() => currentFolder ? getMobileChildFolders(folders, currentFolder.id) : [], [folders, currentFolder]);
  const childFolders = useMemo(() => currentFolder ? getMobileChildFolders(folders, currentFolder.id, searchQuery) : [], [folders, currentFolder, searchQuery]);
  const mobileWorkspaceSummary = view.kind === 'folder'
    ? getMobileFolderSummary(sorted.length, allChildFolders.length)
    : `${sorted.length} ghi chú`;

  const selectedAllNotes = sorted.filter((note) => selectedAllNoteIds.includes(note.id));

  useEffect(() => {
    writeMobileAllNotesGallery(mobileAllNotesGallery);
  }, [mobileAllNotesGallery]);

  useEffect(() => {
    if (!selectionWorkspaceMode) {
      setMobileAllNotesMenuOpen(false);
      setMobileAllNotesSelectionMode(false);
      setSelectedAllNoteIds([]);
      return;
    }
    setSelectedAllNoteIds((current) => current.filter((id) => sorted.some((note) => note.id === id)));
  }, [selectionWorkspaceMode, sorted]);

  useEffect(() => {
    if (!mobileAllNotesMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileAllNotesMenuOpen(false);
        mobileAllNotesMoreRef.current?.focus();
      }
    };
    const frame = window.requestAnimationFrame(() => mobileAllNotesMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    document.addEventListener('keydown', closeOnEscape);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('keydown', closeOnEscape); };
  }, [mobileAllNotesMenuOpen]);

  const toggleAllNoteSelection = (id: string) => setSelectedAllNoteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const leaveAllNotesSelection = () => { setMobileAllNotesSelectionMode(false); setSelectedAllNoteIds([]); };
  const archiveSelectedAllNotes = () => {
    const archive = mobileAllNotesMode || selectedAllNotes.some((note) => !note.archived);
    selectedAllNotes.forEach((note) => onArchive(note.id, archive));
    leaveAllNotesSelection();
  };
  const trashSelectedAllNotes = () => {
    selectedAllNotes.forEach((note) => onTrash(note.id));
    leaveAllNotesSelection();
  };
  const moveSelectedAllNotes = () => {
    const folderId = mobileAllNotesMoveFolder === 'none' ? null : mobileAllNotesMoveFolder;
    selectedAllNotes.forEach((note) => onMove(note.id, folderId));
    setMobileAllNotesMoveOpen(false);
    setDesktopMoveOpen(false);
    leaveAllNotesSelection();
  };

  useEffect(() => {
    setFolderSectionExpanded(true);
    setWorkspaceOptionsOpen(false);
    setFolderAction('menu');
  }, [view.kind, currentFolderId]);

  useEffect(() => {
    if (!mobileTrashMode) {
      setTrashSelectionMode(false);
      setSelectedTrashIds([]);
    }
  }, [mobileTrashMode]);

  const clearSearchAndFilters = () => {
    onSearchChange('');
    setFolderFilter('all');
    setTagFilter('all');
    setPinnedFilter('all');
    setArchiveFilter('current');
    setRecentlyUpdated(false);
    setSortMode('');
    setFilterOpen(false);
    setMobileControlsOpen(false);
  };

  useEffect(() => {
    if (!mobileSearchMode) return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Search remains available without storage. */ }
    setRecentSearches(loadRecentSearches(storage, searchAccountId));
  }, [mobileSearchMode, searchAccountId]);

  useEffect(() => {
    if (!mobileSearchMode || !normalizeSearchText(searchQuery)) return;
    const timer = window.setTimeout(() => {
      let storage: Storage | null = null;
      try { storage = window.localStorage; } catch { /* Search remains available without storage. */ }
      setRecentSearches(recordRecentSearch(storage, searchAccountId, searchQuery));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [mobileSearchMode, searchAccountId, searchQuery]);

  useEffect(() => {
    if (mobileSearchMode) searchInputRef.current?.focus({ preventScroll: true });
  }, [mobileSearchMode]);

  const forgetRecentSearch = (query: string) => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Search remains available without storage. */ }
    setRecentSearches(removeRecentSearch(storage, searchAccountId, query));
  };

  const forgetAllRecentSearches = () => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Search remains available without storage. */ }
    setRecentSearches(clearRecentSearches(storage, searchAccountId));
  };

  const filterControls = <FilterControls
    folders={folders}
    tags={tagsInScope}
    folderFilter={folderFilter}
    tagFilter={tagFilter}
    pinnedFilter={pinnedFilter}
    archiveFilter={archiveFilter}
    recentlyUpdated={recentlyUpdated}
    showArchive={view.kind === 'all'}
    onFolderChange={setFolderFilter}
    onTagChange={setTagFilter}
    onPinnedChange={setPinnedFilter}
    onArchiveChange={setArchiveFilter}
    onRecentlyUpdatedChange={setRecentlyUpdated}
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

  useEffect(() => {
    if (mobileMode) return;
    const closeOtherMenu = () => {
      setMenuFor(null);
      setMoveFor(null);
    };
    window.addEventListener('tanooki:desktop-context-menu-open', closeOtherMenu);
    return () => window.removeEventListener('tanooki:desktop-context-menu-open', closeOtherMenu);
  }, [mobileMode]);

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

  const handleShare = async (note: Note) => {
    try {
      const result = await shareNoteContent(note.title.trim() || 'Ghi chú', recordById.get(note.id)?.bodyText || '');
      if (result === 'copied') toast('Đã sao chép nội dung ghi chú');
      if (result === 'unsupported') toast('Thiết bị này không hỗ trợ chia sẻ trực tiếp.');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) toast('Không thể chia sẻ ghi chú');
    }
  };

  const createDesktopChildFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentFolder || !desktopFolderName.trim()) return;
    onAddFolder?.(desktopFolderName.trim(), currentFolder.id);
    setDesktopFolderName('');
    setDesktopFolderCreateOpen(false);
  };

  const handleDelete = async (note: Note) => {
    const currentNote = view.kind === 'trash'
      ? sorted.find((candidate) => candidate.id === note.id && candidate.trashed)
      : undefined;
    if (!currentNote) return;
    try {
      await confirmPermanentTrashDelete(currentNote, {
        isMobile: mobileTrashMode,
        confirm: (message) => window.confirm(message),
        permanentDelete: onPermanentDelete,
      });
    } catch {
      // The parent reports the error and the note remains visible.
    }
  };

  const canCreateNote = view.kind !== 'trash' && view.kind !== 'settings' && view.kind !== 'archived';
  const showAddButton = !hideAddButton && !mobileAllNotesMode && !mobileRecentMode && canCreateNote;
  const toggleTrashSelection = (id: string) => setSelectedTrashIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const deleteSelectedTrash = async () => {
    const selected = sorted.filter((note) => selectedTrashIds.includes(note.id));
    if (!selected.length || !window.confirm(`Xóa vĩnh viễn ${selected.length} ghi chú đã chọn?`)) return;
    for (const note of selected) {
      try { await onPermanentDelete(note.id); } catch { /* parent reports failure; continue remaining selected notes */ }
    }
    setSelectedTrashIds([]);
    setTrashSelectionMode(false);
  };

  return (
    <div className={`${mobileAllNotesMode || mobileRecentMode || mobileTrashMode || mobileWorkspaceMode ? '' : 'h-full'} w-full max-lg:min-w-0 max-lg:max-w-full ${mobileAllNotesMode || mobileRecentMode ? 'tanooki-mobile-all-notes' : mobileTrashMode ? 'tanooki-mobile-trash' : mobileWorkspaceMode ? 'tanooki-mobile-workspace' : 'max-lg:pb-[calc(72px+env(safe-area-inset-bottom))]'} flex flex-col bg-app ${desktopMode ? 'tanooki-desktop-note-list' : ''}`} style={{ backgroundColor: 'var(--bg)' }}>
      {desktopMode && (desktopWorkspaceMode ? <header className="tanooki-desktop-workspace-header">
        {currentFolder && currentFolderAncestorIds.length > 0 && <nav className="tanooki-desktop-folder-breadcrumb" aria-label="Đường dẫn thư mục">{currentFolderAncestorIds.map((id) => { const ancestor = folders.find((folder) => folder.id === id); return ancestor ? <span key={id}><button type="button" onClick={() => onOpenFolder?.(id)}>{ancestor.name}</button><span aria-hidden="true"> / </span></span> : null; })}<strong>{currentFolder.name}</strong></nav>}
        <div className="tanooki-desktop-workspace-title"><h2>{contextTitle}</h2><span>{sorted.length} ghi chú</span></div>
        <label className="tanooki-desktop-workspace-search"><Search size={16} aria-hidden="true" /><input ref={searchInputRef} value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Tìm kiếm ghi chú..." aria-label="Tìm kiếm ghi chú" data-global-search />{searchQuery && <button type="button" onClick={() => onSearchChange('')} aria-label="Xóa nội dung tìm kiếm"><X size={15} aria-hidden="true" /></button>}</label>
        <div className="tanooki-desktop-workspace-actions">
          <div className="relative" ref={filterPanelRef}>
            <button type="button" className={`tanooki-desktop-workspace-action${activeFilterCount ? ' is-active' : ''}`} onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} aria-label={activeFilterCount ? `Bộ lọc, ${activeFilterCount} bộ lọc đang bật` : 'Bộ lọc'} title="Bộ lọc"><SlidersHorizontal size={15} aria-hidden="true" /><span>Lọc</span>{activeFilterCount > 0 && <small>{activeFilterCount}</small>}</button>
            {filterOpen && <div className="tanooki-desktop-filter-popover">{filterControls}{hasAdvancedFilters && <button type="button" onClick={clearSearchAndFilters}>Xóa bộ lọc</button>}</div>}
          </div>
          <label className="tanooki-desktop-sort-control" title="Sắp xếp ghi chú"><ArrowDownUp size={15} aria-hidden="true" /><SortSelect value={sortMode} onChange={setSortMode} /></label>
          <div className="tanooki-desktop-view-toggle" role="group" aria-label="Cách hiển thị ghi chú">
            <button type="button" className={!mobileAllNotesGallery ? 'is-active' : ''} onClick={() => setMobileAllNotesGallery(false)} aria-label="Xem dạng danh sách" aria-pressed={!mobileAllNotesGallery} title="Danh sách"><List size={16} aria-hidden="true" /></button>
            <button type="button" className={mobileAllNotesGallery ? 'is-active' : ''} onClick={() => setMobileAllNotesGallery(true)} aria-label="Xem dạng bộ sưu tập" aria-pressed={mobileAllNotesGallery} title="Bộ sưu tập"><Grid2X2 size={16} aria-hidden="true" /></button>
          </div>
          <button type="button" className={`tanooki-desktop-workspace-action${mobileAllNotesSelectionMode ? ' is-active' : ''}`} onClick={() => mobileAllNotesSelectionMode ? leaveAllNotesSelection() : (setMobileAllNotesSelectionMode(true), setSelectedAllNoteIds([]))} aria-pressed={mobileAllNotesSelectionMode} title={mobileAllNotesSelectionMode ? 'Xong' : 'Chọn ghi chú'}><Check size={15} aria-hidden="true" /><span>{mobileAllNotesSelectionMode ? 'Xong' : 'Chọn'}</span></button>
          <button type="button" className={`tanooki-desktop-workspace-action${desktopAttachmentsOpen ? ' is-active' : ''}`} onClick={() => setDesktopAttachmentsOpen((open) => !open)} aria-pressed={desktopAttachmentsOpen} title="Tệp đính kèm"><Paperclip size={15} aria-hidden="true" /><span>Tệp</span></button>
        </div>
        {mobileAllNotesSelectionMode && <div className="tanooki-desktop-bulk-toolbar" aria-label="Thao tác ghi chú đã chọn">
          <strong>{selectedAllNotes.length} ghi chú đã chọn</strong>
          <div className="relative"><button type="button" disabled={!selectedAllNotes.length} onClick={() => setDesktopMoveOpen((open) => !open)}><MoveRight size={14} aria-hidden="true" />Di chuyển</button>{desktopMoveOpen && <div className="tanooki-desktop-move-popover"><label htmlFor="desktop-bulk-move-folder">Thư mục đích</label><select id="desktop-bulk-move-folder" value={mobileAllNotesMoveFolder} onChange={(event) => setMobileAllNotesMoveFolder(event.target.value)}><option value="none">Không có thư mục</option>{getFolderHierarchy(folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{getFolderOptionLabel(folder, depth)}</option>)}</select><button type="button" disabled={!selectedAllNotes.length} onClick={moveSelectedAllNotes}>Di chuyển ghi chú</button></div>}</div>
          <button type="button" disabled={!selectedAllNotes.length} onClick={archiveSelectedAllNotes} title={selectedAllNotes.some((note) => !note.archived) ? 'Lưu trữ ghi chú đã chọn' : 'Bỏ lưu trữ ghi chú đã chọn'}>{selectedAllNotes.some((note) => !note.archived) ? <Archive size={14} aria-hidden="true" /> : <ArchiveRestore size={14} aria-hidden="true" />}{selectedAllNotes.some((note) => !note.archived) ? 'Lưu trữ' : 'Bỏ lưu trữ'}</button>
          <button type="button" className="is-danger" disabled={!selectedAllNotes.length} onClick={trashSelectedAllNotes}><Trash2 size={14} aria-hidden="true" />Thùng rác</button>
        </div>}
      </header> : <div className="tanooki-desktop-list-heading px-4 pt-4">{currentFolder && currentFolderAncestorIds.length > 0 && <nav className="tanooki-desktop-folder-breadcrumb" aria-label="Đường dẫn thư mục">{currentFolderAncestorIds.map((id) => { const ancestor = folders.find((folder) => folder.id === id); return ancestor ? <span key={id}><button type="button" onClick={() => onOpenFolder?.(id)}>{ancestor.name}</button><span aria-hidden="true"> / </span></span> : null; })}<strong>{currentFolder.name}</strong></nav>}<h2>{contextTitle}</h2><span>{sorted.length} ghi chú</span></div>)}
      {mobileTrashMode && <header className="tanooki-mobile-trash-header">
        <div className="tanooki-mobile-trash-navigation">
          <button type="button" onClick={onBackToHome} aria-label="Quay lại Thư mục"><ChevronLeft size={22} aria-hidden="true" /><span>Thư mục</span></button>
          <button type="button" onClick={() => { setTrashSelectionMode((current) => !current); setSelectedTrashIds([]); }} aria-pressed={trashSelectionMode}>{trashSelectionMode ? 'Xong' : 'Sửa'}</button>
        </div>
        <h1>Đã xóa gần đây</h1>
        <label className="tanooki-mobile-trash-search"><Search size={21} aria-hidden="true" /><input data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Tìm kiếm ghi chú..." aria-label="Tìm kiếm ghi chú đã xóa" /></label>
        <p className="tanooki-mobile-trash-retention">Ghi chú đã xóa có thể được khôi phục trong 7 ngày.</p>
        {trashSelectionMode && <div className="tanooki-mobile-trash-bulk" aria-label="Thao tác ghi chú đã chọn">
          <span>{selectedTrashIds.length} đã chọn</span>
          <button type="button" disabled={!selectedTrashIds.length} onClick={() => { selectedTrashIds.forEach(onRestore); setSelectedTrashIds([]); setTrashSelectionMode(false); }}>Khôi phục</button>
          <button type="button" disabled={!selectedTrashIds.length} onClick={() => { void deleteSelectedTrash(); }}>Xóa vĩnh viễn</button>
        </div>}
      </header>}
      {mobileAllNotesMode && <header className="tanooki-mobile-all-notes-header">
        <div className="tanooki-mobile-all-notes-navigation">
          <button type="button" onClick={onBackToHome} aria-label="Quay lại Thư mục"><ChevronLeft size={22} aria-hidden="true" /><span>Thư mục</span></button>
          <button ref={mobileAllNotesMoreRef} type="button" onClick={() => setMobileAllNotesMenuOpen(true)} aria-label="Tùy chọn ghi chú" title="Tùy chọn ghi chú" aria-expanded={mobileAllNotesMenuOpen} aria-haspopup="menu"><MoreHorizontal size={22} aria-hidden="true" /></button>
        </div>
        <h1>Tất cả ghi chú</h1>
        <div className="tanooki-mobile-all-notes-search">
          <Search size={21} aria-hidden="true" />
          <input data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Tìm kiếm ghi chú..." aria-label="Tìm kiếm ghi chú" />
          {searchQuery && <button type="button" onClick={() => onSearchChange('')} aria-label="Xóa nội dung tìm kiếm"><X size={17} aria-hidden="true" /></button>}
        </div>
        {mobileAllNotesSelectionMode && <div className="tanooki-mobile-all-notes-selection-toolbar" aria-label="Thao tác ghi chú đã chọn">
          <span>{selectedAllNotes.length} đã chọn</span>
          <button type="button" disabled={!selectedAllNotes.length} onClick={() => setMobileAllNotesMoveOpen(true)} aria-label="Di chuyển ghi chú đã chọn"><MoveRight size={17} aria-hidden="true" /><span>Di chuyển</span></button>
          <button type="button" disabled={!selectedAllNotes.some((note) => !note.archived)} onClick={archiveSelectedAllNotes} aria-label="Lưu trữ ghi chú đã chọn"><Archive size={17} aria-hidden="true" /><span>Lưu trữ</span></button>
          <button type="button" disabled={!selectedAllNotes.length} onClick={trashSelectedAllNotes} aria-label="Chuyển ghi chú đã chọn vào thùng rác"><Trash2 size={17} aria-hidden="true" /><span>Xóa</span></button>
          <button type="button" onClick={leaveAllNotesSelection} aria-label="Thoát chế độ chọn"><X size={17} aria-hidden="true" /></button>
        </div>}
      </header>}
      {mobileRecentMode && <header className="tanooki-mobile-all-notes-header">
        <div className="tanooki-mobile-all-notes-navigation">
          <button type="button" onClick={onBackFromRecent ?? onBackToHome} aria-label="Quay lại"><ChevronLeft size={22} aria-hidden="true" /><span>Quay lại</span></button>
          <button type="button" onClick={() => setMobileControlsOpen(true)} aria-label="Tùy chọn ghi chú" title="Bộ lọc và sắp xếp"><MoreHorizontal size={22} aria-hidden="true" /></button>
        </div>
        <h1>Ghi chú gần đây</h1>
        <div className="tanooki-mobile-all-notes-search">
          <Search size={21} aria-hidden="true" />
          <input data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Tìm kiếm ghi chú..." aria-label="Tìm kiếm ghi chú gần đây" />
          {searchQuery && <button type="button" onClick={() => onSearchChange('')} aria-label="Xóa nội dung tìm kiếm"><X size={17} aria-hidden="true" /></button>}
        </div>
      </header>}
      {mobileWorkspaceMode && <header className="tanooki-mobile-workspace-header">
        <div className="tanooki-mobile-workspace-navigation">
          <button type="button" onClick={onBackToHome} aria-label="Quay lại Thư mục"><ChevronLeft size={22} aria-hidden="true" /><span>Thư mục</span></button>
          <div>
            {view.kind === 'folder' ? <button type="button" onClick={() => { setFolderAction('menu'); setWorkspaceOptionsOpen(true); }} aria-label="Tùy chọn thư mục"><MoreHorizontal size={22} aria-hidden="true" /></button> : <button type="button" onClick={() => setMobileControlsOpen(true)} aria-label="Tùy chọn ghi chú"><MoreHorizontal size={22} aria-hidden="true" /></button>}
          </div>
        </div>
        {currentFolderBreadcrumb && <p className="tanooki-mobile-workspace-breadcrumb" aria-label={`Đường dẫn thư mục: ${currentFolderBreadcrumb}`}>{currentFolderBreadcrumb}</p>}
        <h1>{view.kind === 'folder' ? currentFolder?.name || 'Thư mục' : 'Lưu trữ'}</h1>
        <label className="tanooki-mobile-workspace-search"><Search size={21} aria-hidden="true" /><input data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Tìm kiếm ghi chú, thư mục..." aria-label="Tìm kiếm ghi chú, thư mục" />{searchQuery && <button type="button" onClick={() => onSearchChange('')} aria-label="Xóa nội dung tìm kiếm"><X size={17} aria-hidden="true" /></button>}</label>
      </header>}
      {/* Search bar */}
      {!mobileAllNotesMode && !mobileRecentMode && !mobileTrashMode && !mobileWorkspaceMode && !desktopWorkspaceMode && <div className="px-4 pt-2 pb-2 sticky top-0 z-10 bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {mobileSearchMode && <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={onBackToHome} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-1 text-sm font-medium" style={{ color: 'var(--accent)' }} aria-label="Quay lại">
          <ChevronLeft size={20} aria-hidden="true" /><span>Quay lại</span>
        </button>
        <h1 className="min-w-0 flex-1 text-center text-xl font-bold" style={{ color: 'var(--text)' }}>Tìm kiếm</h1>
        <span className="w-[72px] shrink-0" aria-hidden="true" />
      </div>}
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
              ref={searchInputRef}
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
                onClick={() => { onSearchChange(''); searchInputRef.current?.focus({ preventScroll: true }); }}
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
        </div>}

      {/* Notes list */}
      <div ref={notesScrollRef} className={`flex-1 min-h-0 overflow-y-auto ${mobileAllNotesMode || mobileRecentMode ? 'tanooki-mobile-all-notes-scroll' : mobileTrashMode ? 'tanooki-mobile-trash-scroll' : mobileWorkspaceMode ? 'tanooki-mobile-workspace-scroll' : 'px-2'}`} {...(mobileMode ? longPressHandlers : {})}>
        {desktopAttachmentsOpen && desktopWorkspaceMode ? <DesktopAttachmentBrowser
          entries={visibleWorkspaceAttachments}
          count={workspaceAttachmentCount}
          filter={desktopAttachmentFilter}
          onFilterChange={setDesktopAttachmentFilter}
          onOpenNote={(id) => { setDesktopAttachmentsOpen(false); onSelectNote(id); }}
          onOpenImage={(url) => { window.open(url, '_blank', 'noopener,noreferrer'); }}
          onOpenAttachment={async (attachment) => {
            try {
              const url = attachment.url || await refreshAttachmentUrl(attachment.storagePath);
              if (url) window.open(url, '_blank', 'noopener,noreferrer');
              else toast('Không thể mở tệp');
            } catch { toast('Không thể mở tệp'); }
          }}
        /> : <>
        {desktopMode && currentFolder && <section className="tanooki-desktop-folder-children" aria-labelledby="tanooki-desktop-folder-children-heading">
          <div className="tanooki-desktop-folder-section-heading"><h3 id="tanooki-desktop-folder-children-heading">Thư mục</h3><button type="button" onClick={() => setDesktopFolderCreateOpen(true)}><Plus size={15} aria-hidden="true" />Thư mục mới</button></div>
          {desktopFolderCreateOpen && <form className="tanooki-desktop-folder-create" onSubmit={createDesktopChildFolder}><input autoFocus value={desktopFolderName} onChange={(event) => setDesktopFolderName(event.target.value)} placeholder={`Thư mục con trong ${currentFolder.name}`} aria-label={`Tên thư mục con trong ${currentFolder.name}`} /><button type="submit" disabled={!desktopFolderName.trim()}>Tạo</button><button type="button" onClick={() => { setDesktopFolderCreateOpen(false); setDesktopFolderName(''); }}>Hủy</button></form>}
          {childFolders.length > 0 ? <div className="tanooki-desktop-folder-children-card">{childFolders.map((folder) => <button key={folder.id} type="button" className={`tanooki-desktop-folder-child-row${desktopContextMenu?.kind === 'folder' && desktopContextMenu.id === folder.id ? ' is-context-open' : ''}`} onKeyDown={desktopMode && !mobileMode ? openDesktopMenuWithKeyboard : undefined} onClick={() => onOpenFolder?.(folder.id)} onContextMenu={(event) => { if (mobileMode || !desktopMode) return; event.preventDefault(); event.stopPropagation(); announceDesktopContextMenu(); setDesktopContextMenu({ kind: 'folder', id: folder.id, point: { x: event.clientX, y: event.clientY } }); }}><FolderIcon size={18} aria-hidden="true" /><strong>{folder.name}</strong><span>{notes.filter((note) => note.folderId === folder.id && !note.trashed && !note.archived).length}</span><ChevronRight size={17} aria-hidden="true" /></button>)}</div> : allChildFolders.length > 0 && searchQuery.trim() ? <p className="tanooki-desktop-folder-no-match">Không tìm thấy thư mục con phù hợp.</p> : null}
        </section>}
        {desktopMode && currentFolder && sorted.length > 0 && <h3 className="tanooki-desktop-folder-notes-heading">Ghi chú</h3>}
        {mobileSearchMode && !normalizeSearchText(searchQuery) ? <section className="px-4 pb-8 pt-3" aria-label="Tìm kiếm gần đây">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Tìm kiếm gần đây</h2>
            {recentSearches.length > 0 && <button type="button" onClick={forgetAllRecentSearches} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Xóa tất cả</button>}
          </div>
          {recentSearches.length > 0 ? <ul className="divide-y rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            {recentSearches.map((query) => <li key={query} className="flex min-h-12 items-center gap-3 px-3">
              <Clock3 size={17} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
              <button type="button" className="min-w-0 flex-1 truncate py-3 text-left text-sm" style={{ color: 'var(--text)' }} onClick={() => { onSearchChange(query); searchInputRef.current?.focus({ preventScroll: true }); }}>{query}</button>
              <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ color: 'var(--text-tertiary)' }} aria-label={`Xóa tìm kiếm gần đây: ${query}`} onClick={() => forgetRecentSearch(query)}><X size={16} aria-hidden="true" /></button>
            </li>)}
          </ul> : <p className="py-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>Chưa có tìm kiếm gần đây</p>}
        </section> : mobileSearchMode && normalizeSearchText(searchQuery) ? <p className="px-4 pb-1 pt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>{sorted.length} ghi chú</p> : null}
        {view.kind === 'trash' && !mobileTrashMode && (
          <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Ghi chú đã xóa có thể được khôi phục trong 7 ngày.
          </p>
        )}
        {mobileSearchMode && !normalizeSearchText(searchQuery) ? null : sorted.length === 0 && !(mobileWorkspaceMode && view.kind === 'folder' && childFolders.length > 0) && !(desktopMode && view.kind === 'folder' && allChildFolders.length > 0) ? (
          (mobileSearchMode && normalizeSearchText(searchQuery)) || (hasSearchOrFilters && filterSource.length > 0)
            ? mobileSearchMode ? <div className="px-4 py-8 text-center"><p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Không tìm thấy ghi chú</p>{hasAdvancedFilters && <button type="button" onClick={clearSearchAndFilters} className="mt-2 text-sm font-medium" style={{ color: 'var(--accent)' }}>Xóa bộ lọc</button>}</div> : <FilteredEmptyState onClear={clearSearchAndFilters} />
            : desktopMode && view.kind === 'folder' ? <div className="tanooki-desktop-folder-empty"><FolderIcon size={28} aria-hidden="true" /><strong>Thư mục trống</strong><span>Tạo ghi chú hoặc thư mục con để bắt đầu.</span></div>
            : mobileTrashMode ? <div className="tanooki-mobile-trash-empty">Không có ghi chú đã xóa</div> : mobileWorkspaceMode && view.kind === 'archived' ? <div className="tanooki-mobile-workspace-empty">Không có ghi chú đã lưu trữ</div> : mobileWorkspaceMode && view.kind === 'folder' ? <div className="tanooki-mobile-workspace-empty">{searchQuery ? 'Không tìm thấy nội dung phù hợp' : 'Thư mục này chưa có ghi chú'}</div> : <EmptyState view={view} />
        ) : (
          mobileTrashMode ? <div className="tanooki-mobile-trash-card">
            {sorted.map((note) => {
              const record = recordById.get(note.id);
              const fn = folderName(note.folderId);
              const preview = record?.bodyText ? record.bodyText.slice(0, 120) : 'Chưa có nội dung';
              const selected = selectedTrashIds.includes(note.id);
              const rowContent = <>
                <strong>{note.title.trim() || 'Chưa có tiêu đề'}</strong>
                <span>{noteTime(note.trashedAt || note.updatedAt)}<span aria-hidden="true"> · </span><span className="tanooki-mobile-trash-preview">{preview}</span></span>
                {fn && <span className="tanooki-mobile-trash-folder"><FolderIcon size={13} aria-hidden="true" /><span>{fn}</span></span>}
              </>;
              return <div className={`tanooki-mobile-trash-row${selected ? ' is-selected' : ''}`} key={note.id} data-mobile-context-kind={!trashSelectionMode ? 'note' : undefined} data-mobile-context-id={!trashSelectionMode ? note.id : undefined} data-mobile-context-title={!trashSelectionMode ? note.title.trim() || 'Chưa có tiêu đề' : undefined} data-mobile-context-detail={!trashSelectionMode ? preview : undefined} data-mobile-context-preview={!trashSelectionMode ? record?.bodyText.slice(0, 1600) || '' : undefined}>
                {trashSelectionMode && <button type="button" className="tanooki-mobile-trash-check" aria-label={`${selected ? 'Bỏ chọn' : 'Chọn'} ${note.title.trim() || 'Chưa có tiêu đề'}`} aria-pressed={selected} onClick={() => toggleTrashSelection(note.id)}><span /></button>}
                {trashSelectionMode
                  ? <button type="button" className="tanooki-mobile-trash-row-main" onClick={() => toggleTrashSelection(note.id)}>{rowContent}</button>
                  : <div className="tanooki-mobile-trash-row-main">{rowContent}</div>}
              </div>;
            })}
          </div> : mobileWorkspaceMode ? <div className="tanooki-mobile-workspace-content">
            {view.kind === 'folder' && allChildFolders.length > 0 && <section className="tanooki-mobile-workspace-folder-section">
              <button type="button" className="tanooki-mobile-workspace-section-heading" aria-expanded={folderSectionExpanded} onClick={() => setFolderSectionExpanded((expanded) => !expanded)}><span>Thư mục</span><ChevronRight size={20} aria-hidden="true" /></button>
              {folderSectionExpanded && (childFolders.length > 0 ? <div className="tanooki-mobile-workspace-folder-card">
                {childFolders.map((folder) => {
                  const count = notes.filter((note) => note.folderId === folder.id && !note.trashed && !note.archived).length;
                  return <button type="button" key={folder.id} data-mobile-context-kind="folder" data-mobile-context-id={folder.id} data-mobile-context-title={folder.name} data-mobile-context-detail={`${count} ghi chú`} className="tanooki-mobile-workspace-folder-row" onClick={() => onOpenFolder?.(folder.id)}><FolderIcon size={27} aria-hidden="true" /><strong>{folder.name}</strong><span>{count}</span><ChevronRight size={21} aria-hidden="true" /></button>;
                })}
              </div> : searchQuery ? <p className="tanooki-mobile-workspace-empty">Không tìm thấy thư mục phù hợp</p> : null)}
            </section>}
            {sorted.length > 0 && <div className="tanooki-mobile-all-notes-groups">
              {mobileAllNoteGroups.map((group) => <section key={group.label} className="tanooki-mobile-all-notes-group"><h2>{group.label}</h2><div className="tanooki-mobile-all-notes-card">
                {group.notes.map((note) => {
                  const record = recordById.get(note.id);
                  const fn = folderName(note.folderId);
                  const bodyMatched = Boolean(normalizeSearchText(searchQuery) && record?.bodyNormalized.includes(normalizeSearchText(searchQuery)));
                  const preview = record?.bodyText ? bodyMatched ? getSearchSnippet(record.bodyText, searchQuery) : record.bodyText.length > 120 ? `${record.bodyText.slice(0, 120)}…` : record.bodyText : 'Chưa có nội dung';
                  return <MobileAllNoteRow key={note.id} note={note} selected={note.id === selectedNoteId} date={formatMobileAllNoteDate(note.updatedAt)} preview={preview} contextPreview={record?.bodyText || ''} query={searchQuery} folderName={fn} onOpen={() => onSelectNote(note.id)} />;
                })}
              </div></section>)}
            </div>}
          </div> : mobileAllNotesMode || mobileRecentMode ? <div className="tanooki-mobile-all-notes-groups">
            {(mobileRecentMode ? mobileRecentGroups : mobileAllNoteGroups).map((group) => <section key={group.label} className="tanooki-mobile-all-notes-group">
              <h2>{group.label}</h2>
              <div className={`tanooki-mobile-all-notes-card${mobileAllNotesMode && mobileAllNotesGallery ? ' is-gallery' : ''}`}>
                {group.notes.map((note) => {
                  const record = recordById.get(note.id);
                  const fn = folderName(note.folderId);
                  const bodyMatched = Boolean(normalizeSearchText(searchQuery) && record?.bodyNormalized.includes(normalizeSearchText(searchQuery)));
                  const preview = record?.bodyText
                    ? bodyMatched ? getSearchSnippet(record.bodyText, searchQuery) : record.bodyText.length > 120 ? `${record.bodyText.slice(0, 120)}…` : record.bodyText
                    : 'Chưa có nội dung';
                  if (mobileAllNotesMode && mobileAllNotesGallery) return <MobileAllNoteGalleryCard
                    key={note.id}
                    note={note}
                    preview={preview}
                    contextPreview={record?.bodyText || ''}
                    date={formatMobileAllNoteDate(note.updatedAt)}
                    folderName={fn}
                    selected={selectedAllNoteIds.includes(note.id)}
                    selectionMode={mobileAllNotesSelectionMode}
                    onOpen={() => mobileAllNotesSelectionMode ? toggleAllNoteSelection(note.id) : onSelectNote(note.id)}
                  />;
                  return <MobileAllNoteRow
                    key={note.id}
                    note={note}
                    selected={mobileAllNotesSelectionMode ? selectedAllNoteIds.includes(note.id) : note.id === selectedNoteId}
                    date={formatMobileAllNoteDate(mobileRecentMode ? getEffectiveRecentTime(note, recentOpenedAt) : note.updatedAt)}
                    preview={preview}
                    contextPreview={record?.bodyText || ''}
                    query={searchQuery}
                    folderName={fn}
                    selectionMode={mobileAllNotesMode && mobileAllNotesSelectionMode}
                    onToggleSelection={() => toggleAllNoteSelection(note.id)}
                    onOpen={() => mobileAllNotesSelectionMode ? toggleAllNoteSelection(note.id) : onSelectNote(note.id)}
                  />;
                })}
              </div>
            </section>)}
          </div> : desktopWorkspaceMode && mobileAllNotesGallery ? <div className="tanooki-desktop-gallery">
            {sorted.map((note) => {
              const record = recordById.get(note.id);
              const fn = folderName(note.folderId);
              const bodyMatched = Boolean(normalizeSearchText(searchQuery) && record?.bodyNormalized.includes(normalizeSearchText(searchQuery)));
              const preview = record?.bodyText ? bodyMatched ? getSearchSnippet(record.bodyText, searchQuery) : record.bodyText : 'Chưa có nội dung';
              const selected = selectedAllNoteIds.includes(note.id);
              return <DesktopNoteGalleryCard key={note.id} note={note} preview={preview} date={noteTime(note.updatedAt)} folderName={fn} selected={selected} selectionMode={mobileAllNotesSelectionMode} onOpen={() => mobileAllNotesSelectionMode ? toggleAllNoteSelection(note.id) : onSelectNote(note.id)} onContextMenu={(event) => { if (mobileAllNotesSelectionMode) return; event.preventDefault(); event.stopPropagation(); announceDesktopContextMenu(); setContextMoveOpen(false); setDesktopContextMenu({ kind: 'note', id: note.id, point: { x: event.clientX, y: event.clientY } }); }} contextOpen={desktopContextMenu?.kind === 'note' && desktopContextMenu.id === note.id} />;
            })}
          </div> : <div className={`space-y-0.5${desktopWorkspaceMode ? ` tanooki-desktop-note-rows${mobileAllNotesSelectionMode ? ' is-selecting' : ''}` : ''}`}>
            {sorted.map((note) => {
              const selected = mobileAllNotesSelectionMode && desktopWorkspaceMode ? selectedAllNoteIds.includes(note.id) : note.id === selectedNoteId;
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
                  onKeyDown={desktopMode && !mobileMode ? openDesktopMenuWithKeyboard : undefined}
                  onContextMenu={(event) => {
                    if (mobileMode || !desktopMode || (mobileAllNotesSelectionMode && desktopWorkspaceMode)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    announceDesktopContextMenu();
                    setMenuFor(null);
                    setMoveFor(null);
                    setContextMoveOpen(false);
                    setDesktopContextMenu({ kind: 'note', id: note.id, point: { x: event.clientX, y: event.clientY } });
                  }}
                >
                  <button
                    onClick={() => mobileAllNotesSelectionMode && desktopWorkspaceMode ? toggleAllNoteSelection(note.id) : onSelectNote(note.id)}
                    aria-pressed={mobileAllNotesSelectionMode && desktopWorkspaceMode ? selected : undefined}
                    className={`tanooki-desktop-note-row w-full text-left px-3 py-3 rounded-lg transition-colors ${desktopContextMenu?.kind === 'note' && desktopContextMenu.id === note.id ? 'is-context-open' : ''} ${selected ? 'is-selected' : ''} ${
                      selected ? 'bg-accent-light' : 'hover-bg'
                    } ${menuFor === note.id ? 'bg-accent-light' : ''}`}
                    data-mobile-context-kind={mobileMode ? 'note' : undefined}
                    data-mobile-context-id={mobileMode ? note.id : undefined}
                    data-mobile-context-title={mobileMode ? (note.title.trim() || 'Chưa có tiêu đề') : undefined}
                    data-mobile-context-detail={mobileMode ? preview : undefined}
                    data-mobile-context-preview={mobileMode ? record?.bodyText.slice(0, 1600) || '' : undefined}
                    style={selected || menuFor === note.id ? { backgroundColor: desktopMode && selected ? 'color-mix(in srgb, var(--tanooki-red) 10%, var(--bg-secondary))' : 'var(--accent-light)' } : undefined}
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

                  {mobileAllNotesSelectionMode && desktopWorkspaceMode && <span className={`tanooki-desktop-note-check${selected ? ' is-selected' : ''}`} aria-hidden="true">{selected && <Check size={12} />}</span>}
                  {!mobileMode && !(mobileAllNotesSelectionMode && desktopWorkspaceMode) && <div
                    className="absolute right-2 top-2"
                  >
                    <button
                      data-context-ignore
                      onClick={(e) => {
                        e.stopPropagation();
                        announceDesktopContextMenu();
                        setDesktopContextMenu(null);
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
                  </div>}

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
                      {view.kind !== 'trash' && <MenuItem icon={<Share2 size={15} />} label="Chia sẻ" onClick={() => { void handleShare(note); setMenuFor(null); }} />}
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
                              <DesktopFolderMoveOptions folders={folders} onSelect={(folderId) => { onMove(note.id, folderId); setMenuFor(null); setMoveFor(null); }} />
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
        </>}
      </div>

      {desktopMode && desktopContextMenu && (() => {
        const close = () => { setDesktopContextMenu(null); setContextMoveOpen(false); };
        if (desktopContextMenu.kind === 'folder') {
          const folder = folders.find((item) => item.id === desktopContextMenu.id);
          if (!folder) return null;
          return <DesktopContextMenu point={desktopContextMenu.point} onClose={close} label={`Thao tác thư mục ${folder.name}`}>
            <button type="button" role="menuitem" onClick={() => { close(); const name = window.prompt('Đổi tên thư mục', folder.name); if (name?.trim()) onRenameFolder?.(folder.id, name.trim()); }}><Edit3 size={15} aria-hidden="true" />Đổi tên</button>
            <button type="button" role="menuitem" className="is-danger" onClick={() => { close(); if (window.confirm(`Xóa thư mục “${folder.name}”? Ghi chú trực tiếp sẽ được chuyển về Tất cả ghi chú; thư mục con sẽ được chuyển lên cấp cha.`)) onDeleteFolder?.(folder.id); }}><Trash2 size={15} aria-hidden="true" />Xóa thư mục</button>
          </DesktopContextMenu>;
        }
        const note = sorted.find((item) => item.id === desktopContextMenu.id);
        if (!note) return null;
        return <DesktopContextMenu point={desktopContextMenu.point} onClose={close} label={`Thao tác ghi chú ${note.title || 'Chưa có tiêu đề'}`}>
          {view.kind === 'trash' ? <>
            <button type="button" role="menuitem" onClick={() => { close(); onRestore(note.id); }}><RotateCcw size={15} aria-hidden="true" />Khôi phục</button>
            <button type="button" role="menuitem" className="is-danger" onClick={() => { close(); void handleDelete(note); }}><Trash2 size={15} aria-hidden="true" />Xóa vĩnh viễn</button>
          </> : <>
            <button type="button" role="menuitem" onClick={() => { close(); onTogglePin(note.id); }}>{note.pinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}{note.pinned ? 'Bỏ ghim' : 'Ghim'}</button>
            <button type="button" role="menuitem" onClick={() => { close(); void handleShare(note); }}><Share2 size={15} aria-hidden="true" />Chia sẻ</button>
            <button type="button" role="menuitem" onClick={() => { close(); handleArchive(note); }}>{note.archived ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}{note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}</button>
            <button type="button" role="menuitem" onClick={() => setContextMoveOpen((open) => !open)}><FolderIcon size={15} aria-hidden="true" />Di chuyển<ChevronRight className="ml-auto" size={14} aria-hidden="true" /></button>
            {contextMoveOpen && <div className="tanooki-desktop-context-folder-options"><DesktopFolderMoveOptions folders={folders} onSelect={(folderId) => { close(); onMove(note.id, folderId); }} /></div>}
            <button type="button" role="menuitem" onClick={() => { close(); onDuplicate(note.id); }}><Copy size={15} aria-hidden="true" />Tạo bản sao</button>
            <div className="tanooki-desktop-context-separator" />
            <button type="button" role="menuitem" className="is-danger" onClick={() => { close(); handleTrash(note); }}><Trash2 size={15} aria-hidden="true" />Chuyển vào thùng rác</button>
          </>}
        </DesktopContextMenu>;
      })()}

      {mobileTrashMode && <footer className="tanooki-mobile-trash-footer"><span>{sorted.length} ghi chú</span></footer>}
      {(mobileAllNotesMode || mobileRecentMode) && <footer className="tanooki-mobile-all-notes-footer">
        <span>{sorted.length} ghi chú</span>
        {canCreateNote && <button type="button" onClick={onAddNote} aria-label="Tạo ghi chú mới" title="Tạo ghi chú mới"><Plus size={26} aria-hidden="true" /></button>}
      </footer>}
      {mobileWorkspaceMode && <footer className="tanooki-mobile-all-notes-footer"><span>{mobileWorkspaceSummary}</span><button type="button" onClick={onAddNote} aria-label="Tạo ghi chú mới" title="Tạo ghi chú mới"><Plus size={26} aria-hidden="true" /></button></footer>}

      {mobileMode && longPressTarget && <MobileContextPopover target={longPressTarget} closing={longPressClosing} onClose={() => closeLongPress()} labelledBy="mobile-long-press-menu">
        {longPressTarget.kind === 'note' && sorted.find((item) => item.id === longPressTarget.id) ? (() => {
          const targetNote = sorted.find((item) => item.id === longPressTarget.id)!;
          const run = (action: () => void) => closeLongPress(action);
          if (view.kind === 'trash') return <>
            <button type="button" role="menuitem" onClick={() => run(() => onRestore(targetNote.id))}><RotateCcw size={18} aria-hidden="true" /><span>Khôi phục</span></button>
            <button type="button" role="menuitem" className="is-danger" onClick={() => run(() => { void handleDelete(targetNote); })}><Trash2 size={18} aria-hidden="true" /><span>Xóa vĩnh viễn</span></button>
          </>;
          return <>
            <button type="button" role="menuitem" onClick={() => run(() => onTogglePin(targetNote.id))}>{targetNote.pinned ? <PinOff size={18} aria-hidden="true" /> : <Pin size={18} aria-hidden="true" />}<span>{targetNote.pinned ? 'Bỏ ghim' : 'Ghim'}</span></button>
            <button type="button" role="menuitem" onClick={() => setContextMoveOpen((open) => !open)}><FolderIcon size={18} aria-hidden="true" /><span>Di chuyển</span><ChevronRight className="ml-auto" size={17} aria-hidden="true" /></button>
            {contextMoveOpen && <div className="tanooki-mobile-context-submenu">
              <DesktopFolderMoveOptions mobile folders={folders} onSelect={(folderId) => run(() => onMove(targetNote.id, folderId))} />
            </div>}
            <button type="button" role="menuitem" onClick={() => run(() => handleArchive(targetNote))}>{targetNote.archived ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}<span>{targetNote.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}</span></button>
            <button type="button" role="menuitem" onClick={() => run(() => onDuplicate(targetNote.id))}><Copy size={18} aria-hidden="true" /><span>Tạo bản sao</span></button>
            <div className="tanooki-mobile-context-divider" />
            <button type="button" role="menuitem" className="is-danger" onClick={() => run(() => onTrash(targetNote.id))}><Trash2 size={18} aria-hidden="true" /><span>{mobileTrashMode ? 'Xóa' : 'Chuyển vào thùng rác'}</span></button>
          </>;
        })() : longPressTarget.kind === 'folder' ? <>
          <button type="button" role="menuitem" onClick={() => closeLongPress(() => { setContextFolderRenameId(longPressTarget.id); setContextFolderRenameName(longPressTarget.title); })}><Edit3 size={18} aria-hidden="true" /><span>Đổi tên</span></button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { const folder = folders.find((item) => item.id === longPressTarget.id); closeLongPress(() => { if (folder && window.confirm(`Xóa thư mục “${folder.name}”? Ghi chú trực tiếp sẽ được chuyển về Tất cả ghi chú; thư mục con sẽ được chuyển lên cấp cha.`)) onDeleteFolder?.(folder.id); }); }}><Trash2 size={18} aria-hidden="true" /><span>Xóa thư mục</span></button>
        </> : null}
      </MobileContextPopover>}
      {mobileMode && contextFolderRenameId && <MobileFolderRenameSheet open folderName={contextFolderRenameName} onClose={() => setContextFolderRenameId(null)} onRename={(name) => onRenameFolder?.(contextFolderRenameId, name)} />}

      {mobileAllNotesMode && mobileAllNotesMenuOpen && <div className="tanooki-mobile-all-notes-menu-layer">
        <button type="button" tabIndex={-1} className="tanooki-mobile-all-notes-menu-backdrop" aria-label="Đóng tùy chọn ghi chú" onClick={() => { setMobileAllNotesMenuOpen(false); mobileAllNotesMoreRef.current?.focus(); }} />
        <div ref={mobileAllNotesMenuRef} className="tanooki-mobile-all-notes-menu" role="menu" aria-label="Tùy chọn ghi chú" onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { setMobileAllNotesGallery((current) => !current); setMobileAllNotesMenuOpen(false); }}>
            <span>{mobileAllNotesGallery ? 'Xem dưới dạng danh sách' : 'Xem dưới dạng bộ sưu tập'}</span>{mobileAllNotesGallery ? <List size={20} aria-hidden="true" /> : <Grid2X2 size={20} aria-hidden="true" />}
          </button>
          <button type="button" role="menuitem" onClick={() => { setMobileAllNotesSelectionMode(true); setSelectedAllNoteIds([]); setMobileAllNotesMenuOpen(false); }}>
            <span>Chọn ghi chú</span><Check size={20} aria-hidden="true" />
          </button>
          <button type="button" role="menuitem" onClick={() => { setMobileAttachmentsOpen(true); setMobileAllNotesMenuOpen(false); }}>
            <span>Xem tệp đính kèm</span><Paperclip size={20} aria-hidden="true" />
          </button>
          <button type="button" role="menuitem" onClick={() => { setMobileControlsOpen(true); setMobileAllNotesMenuOpen(false); }}>
            <span>Bộ lọc &amp; sắp xếp</span><SlidersHorizontal size={20} aria-hidden="true" />
          </button>
        </div>
      </div>}

      {mobileAllNotesMode && <MobileBottomSheet open={mobileAllNotesMoveOpen} title={`Di chuyển ${selectedAllNotes.length} ghi chú`} onClose={() => setMobileAllNotesMoveOpen(false)} labelledBy="mobile-all-notes-move">
        <div className="tanooki-mobile-sheet-group">
          <label className="tanooki-mobile-sheet-select"><span>Thư mục đích</span><select value={mobileAllNotesMoveFolder} onChange={(event) => setMobileAllNotesMoveFolder(event.target.value)} aria-label="Chọn thư mục đích"><option value="none">Không có thư mục</option>{getFolderHierarchy(folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{getFolderOptionLabel(folder, depth)}</option>)}</select></label>
          <button type="button" disabled={!selectedAllNotes.length} onClick={moveSelectedAllNotes} className="mt-3 min-h-11 w-full rounded-lg font-medium" style={{ color: 'white', backgroundColor: 'var(--accent)' }}>Di chuyển</button>
        </div>
      </MobileBottomSheet>}

      {mobileAllNotesMode && <MobileBottomSheet open={mobileAttachmentsOpen} title={`Tệp đính kèm (${mobileVisibleAttachments.length + mobileVisibleInlineImages.length})`} onClose={() => setMobileAttachmentsOpen(false)} labelledBy="mobile-all-notes-attachments">
        {mobileVisibleAttachments.length + mobileVisibleInlineImages.length === 0 ? <p className="tanooki-mobile-attachment-empty">Không có tệp đính kèm trong các ghi chú đang hiển thị</p> : <div className="tanooki-mobile-attachment-browser">
          {mobileVisibleInlineImages.map((image) => <article className="tanooki-mobile-attachment-card is-image" key={`${image.src}:${image.noteTitle}`}>
            <button type="button" className="tanooki-mobile-attachment-preview" onClick={() => window.open(image.src, '_blank', 'noopener,noreferrer')} aria-label={`Mở ${image.name}`}><img src={image.src} alt="" loading="lazy" /></button>
            <div className="tanooki-mobile-attachment-meta"><strong title={image.name}>{image.name}</strong><span>{image.noteTitle}</span></div>
          </article>)}
          {mobileVisibleAttachments.map((attachment) => <article className={`tanooki-mobile-attachment-card${attachment.type.startsWith('image/') ? ' is-image' : ''}`} key={attachment.id}>
            <button type="button" className="tanooki-mobile-attachment-preview" onClick={() => { void (async () => { try { const url = attachment.url || await refreshAttachmentUrl(attachment.storagePath); if (url) window.open(url, '_blank', 'noopener,noreferrer'); else toast('Không thể mở tệp'); } catch { toast('Không thể mở tệp'); } })(); }} aria-label={`Mở ${attachment.name}`}>
              {attachment.type.startsWith('image/') && attachment.url ? <img src={attachment.url} alt="" loading="lazy" /> : <Paperclip size={23} aria-hidden="true" />}
            </button>
            <div className="tanooki-mobile-attachment-meta"><strong title={attachment.name}>{attachment.name}</strong><span>{sorted.find((note) => note.id === attachment.noteId)?.title.trim() || 'Chưa có tiêu đề'}</span></div>
          </article>)}
        </div>}
      </MobileBottomSheet>}

      {mobileWorkspaceMode && currentFolder && <MobileBottomSheet open={workspaceOptionsOpen} title={folderAction === 'rename' ? 'Đổi tên thư mục' : folderAction === 'add-child' ? 'Thêm thư mục con' : currentFolder.name} onClose={() => setWorkspaceOptionsOpen(false)} labelledBy="mobile-folder-actions">
        {folderAction === 'menu' ? <div className="tanooki-mobile-sheet-actions">
          <button type="button" onClick={() => { setWorkspaceOptionsOpen(false); setMobileControlsOpen(true); }}><ArrowDownUp size={19} />Lọc và sắp xếp ghi chú</button>
          <button type="button" onClick={() => { setFolderActionName(currentFolder.name); setFolderAction('rename'); }}><FolderIcon size={19} />Đổi tên thư mục</button>
          <button type="button" onClick={() => { setFolderActionName(''); setFolderAction('add-child'); }}><Plus size={19} />Thêm thư mục con</button>
          <button type="button" className="is-danger" onClick={() => { if (window.confirm(`Xóa thư mục “${currentFolder.name}”? Ghi chú trực tiếp sẽ được chuyển về Tất cả ghi chú; thư mục con sẽ được chuyển lên cấp cha.`)) { onDeleteFolder?.(currentFolder.id); setWorkspaceOptionsOpen(false); } }}><Trash2 size={19} />Xóa thư mục</button>
        </div> : <form className="tanooki-mobile-folder-form" onSubmit={(event) => { event.preventDefault(); if (!folderActionName.trim()) return; if (folderAction === 'rename') onRenameFolder?.(currentFolder.id, folderActionName.trim()); else onAddFolder?.(folderActionName.trim(), currentFolder.id); setWorkspaceOptionsOpen(false); }}>
          <label htmlFor="mobile-folder-action-name">Tên thư mục</label><input id="mobile-folder-action-name" autoFocus value={folderActionName} onChange={(event) => setFolderActionName(event.target.value)} maxLength={80} />
          <div><button type="button" className="is-cancel" onClick={() => { setFolderAction('menu'); setFolderActionName(''); }}>Hủy</button><button type="submit" className="is-save" disabled={!folderActionName.trim()}>{folderAction === 'rename' ? 'Lưu' : 'Tạo'}</button></div>
        </form>}
      </MobileBottomSheet>}

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

      {mobileMode && <MobileBottomSheet open={mobileControlsOpen} title="Bộ lọc và sắp xếp" onClose={() => setMobileControlsOpen(false)} labelledBy="mobile-note-filters">
        <div className="tanooki-mobile-sheet-group">
          {filterControls}
          {view.kind !== 'recent' && <label className="tanooki-mobile-sheet-select mt-3"><span>Sắp xếp</span><SortSelect value={sortMode} onChange={setSortMode} /></label>}
          {hasSearchOrFilters && <button type="button" onClick={clearSearchAndFilters} className="mt-3 min-h-11 w-full rounded-lg font-medium" style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-light)' }}>Xóa bộ lọc và tìm kiếm</button>}
        </div>
      </MobileBottomSheet>}
    </div>
  );
}

type DesktopAttachmentEntry = {
  kind: 'images' | 'drawings' | 'files';
  id: string;
  name: string;
  noteTitle: string;
  noteId: string;
  type: string;
  url: string | null;
  storagePath: string;
  attachment?: Attachment;
};

function DesktopAttachmentBrowser({
  entries,
  count,
  filter,
  onFilterChange,
  onOpenNote,
  onOpenImage,
  onOpenAttachment,
}: {
  entries: DesktopAttachmentEntry[];
  count: number;
  filter: 'all' | 'images' | 'drawings' | 'files';
  onFilterChange: (filter: 'all' | 'images' | 'drawings' | 'files') => void;
  onOpenNote: (id: string) => void;
  onOpenImage: (url: string, name: string) => void;
  onOpenAttachment: (attachment: Attachment) => void;
}) {
  const filters = [
    ['all', 'Tất cả'],
    ['images', 'Hình ảnh'],
    ['drawings', 'Bản vẽ'],
    ['files', 'Tệp'],
  ] as const;
  return <section className="tanooki-desktop-attachment-browser" aria-label="Tệp đính kèm">
    <div className="tanooki-desktop-attachment-heading"><div><h3>Tệp đính kèm</h3><span>{count} mục trong ghi chú đang hiển thị</span></div><div className="tanooki-desktop-attachment-filters" role="group" aria-label="Lọc tệp đính kèm">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => onFilterChange(value)}>{label}</button>)}</div></div>
    {entries.length ? <div className="tanooki-desktop-attachment-grid">{entries.map((entry) => <article key={entry.id} className="tanooki-desktop-attachment-card">
      <button type="button" className="tanooki-desktop-attachment-preview" onClick={() => entry.attachment ? onOpenAttachment(entry.attachment) : entry.url && onOpenImage(entry.url, entry.name)} aria-label={`Mở ${entry.name}`}>
        {entry.kind !== 'files' && entry.url ? <img src={entry.url} alt="" loading="lazy" /> : entry.kind === 'files' ? <Paperclip size={25} aria-hidden="true" /> : <ImageIcon size={25} aria-hidden="true" />}
      </button>
      <div className="tanooki-desktop-attachment-meta"><strong title={entry.name}>{entry.name}</strong><span>{entry.kind === 'drawings' ? 'Bản vẽ' : entry.kind === 'images' ? 'Hình ảnh' : entry.type || 'Tệp'}</span><button type="button" onClick={() => onOpenNote(entry.noteId)} title="Mở ghi chú chứa tệp này">{entry.noteTitle}</button></div>
    </article>)}</div> : <p className="tanooki-desktop-attachment-empty">{count ? 'Không có mục nào trong bộ lọc này.' : 'Không có tệp đính kèm trong các ghi chú đang hiển thị.'}</p>}
  </section>;
}

function DesktopNoteGalleryCard({ note, preview, date, folderName, selected, selectionMode, onOpen, onContextMenu, contextOpen }: {
  note: Note;
  preview: string;
  date: string;
  folderName: string | null;
  selected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  contextOpen: boolean;
}) {
  return <article className={`tanooki-desktop-gallery-card${selected ? ' is-selected' : ''}${contextOpen ? ' is-context-open' : ''}`} onKeyDown={openDesktopMenuWithKeyboard} onContextMenu={onContextMenu}>
    {selectionMode && <button type="button" className="tanooki-desktop-gallery-check" onClick={onOpen} aria-label={`${selected ? 'Bỏ chọn' : 'Chọn'} ${note.title.trim() || 'Chưa có tiêu đề'}`} aria-pressed={selected}><span>{selected && <Check size={12} aria-hidden="true" />}</span></button>}
    <button type="button" className="tanooki-desktop-gallery-main" onClick={onOpen}>
      <strong>{note.title.trim() || 'Chưa có tiêu đề'}</strong><time>{date}</time><span className="tanooki-desktop-gallery-preview">{preview}</span>
      <span className="tanooki-desktop-gallery-meta">{note.pinned && <Pin size={12} fill="currentColor" aria-label="Đã ghim" />}{folderName && <><FolderIcon size={12} aria-hidden="true" /><span>{folderName}</span></>}</span>
    </button>
  </article>;
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

export function DesktopFolderMoveOptions({ folders, onSelect, mobile = false }: { folders: Folder[]; onSelect: (folderId: string | null) => void; mobile?: boolean }) {
  return <>
    <button type="button" role="menuitem" onClick={() => onSelect(null)} className={mobile ? undefined : 'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 transition-colors text-left hover-bg'}>
      {!mobile && <FolderIcon size={14} aria-hidden="true" />}Không có thư mục
    </button>
    {getFolderHierarchy(folders).map(({ folder, depth }) => <button key={folder.id} type="button" role="menuitem" onClick={() => onSelect(folder.id)} className={mobile ? undefined : 'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 transition-colors text-left hover-bg'}>
      {!mobile && <FolderIcon size={14} aria-hidden="true" />}{getFolderOptionLabel(folder, depth)}
    </button>)}
  </>;
}

function MobileAllNoteRow({
  note,
  selected,
  date,
  preview,
  contextPreview,
  query,
  folderName,
  onOpen,
  selectionMode = false,
  onToggleSelection,
}: {
  note: Note;
  selected: boolean;
  date: string;
  preview: string;
  contextPreview: string;
  query: string;
  folderName: string | null;
  onOpen: () => void;
  selectionMode?: boolean;
  onToggleSelection?: () => void;
}) {
  return <article className={`tanooki-mobile-all-notes-row${selected ? ' is-selected' : ''}`} data-mobile-context-kind={!selectionMode ? 'note' : undefined} data-mobile-context-id={!selectionMode ? note.id : undefined} data-mobile-context-title={!selectionMode ? note.title.trim() || 'Chưa có tiêu đề' : undefined} data-mobile-context-detail={!selectionMode ? preview : undefined} data-mobile-context-preview={!selectionMode ? contextPreview.slice(0, 1600) : undefined}>
    {selectionMode && <button type="button" className="tanooki-mobile-all-notes-check" onClick={onToggleSelection} aria-label={`${selected ? 'Bỏ chọn' : 'Chọn'} ${note.title.trim() || 'Chưa có tiêu đề'}`} aria-pressed={selected}><span>{selected && <Check size={14} aria-hidden="true" />}</span></button>}
    <button type="button" className="tanooki-mobile-all-notes-row-main" onClick={onOpen}>
      <strong>{note.title.trim() ? <HighlightedText text={note.title} query={query} /> : 'Chưa có tiêu đề'}</strong>
      <span className="tanooki-mobile-all-notes-summary"><time>{date}</time><span aria-hidden="true">·</span><span className="tanooki-mobile-all-notes-preview">{recordPreview(preview, query)}</span></span>
      {folderName && <span className="tanooki-mobile-all-notes-folder"><FolderIcon size={15} fill="currentColor" aria-hidden="true" /><span>{folderName}</span></span>}
    </button>
  </article>;
}

function MobileAllNoteGalleryCard({ note, preview, contextPreview, date, folderName, selected, selectionMode, onOpen }: {
  note: Note;
  preview: string;
  contextPreview: string;
  date: string;
  folderName: string | null;
  selected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
}) {
  return <article className={`tanooki-mobile-all-notes-gallery-card${selected ? ' is-selected' : ''}`} data-mobile-context-kind={!selectionMode ? 'note' : undefined} data-mobile-context-id={!selectionMode ? note.id : undefined} data-mobile-context-title={!selectionMode ? note.title.trim() || 'Chưa có tiêu đề' : undefined} data-mobile-context-detail={!selectionMode ? preview : undefined} data-mobile-context-preview={!selectionMode ? contextPreview.slice(0, 1600) : undefined}>
    {selectionMode && <button type="button" className="tanooki-mobile-all-notes-gallery-check" aria-label={`${selected ? 'Bỏ chọn' : 'Chọn'} ${note.title.trim() || 'Chưa có tiêu đề'}`} aria-pressed={selected} onClick={onOpen}><span>{selected && <Check size={14} aria-hidden="true" />}</span></button>}
    <button type="button" className="tanooki-mobile-all-notes-gallery-main" onClick={onOpen}>
      <strong>{note.title.trim() || 'Chưa có tiêu đề'}</strong>
      <span className="tanooki-mobile-all-notes-gallery-date">{date}</span>
      <span className="tanooki-mobile-all-notes-gallery-preview">{preview}</span>
      {folderName && <span className="tanooki-mobile-all-notes-folder"><FolderIcon size={14} fill="currentColor" aria-hidden="true" /><span>{folderName}</span></span>}
    </button>
  </article>;
}

function recordPreview(preview: string, query: string) {
  return query ? <HighlightedText text={preview} query={query} /> : preview;
}

function FilterControls({
  folders,
  tags,
  folderFilter,
  tagFilter,
  pinnedFilter,
  archiveFilter,
  recentlyUpdated,
  showArchive,
  onFolderChange,
  onTagChange,
  onPinnedChange,
  onArchiveChange,
  onRecentlyUpdatedChange,
}: {
  folders: Folder[];
  tags: string[];
  folderFilter: string;
  tagFilter: string;
  pinnedFilter: 'all' | 'pinned' | 'unpinned';
  archiveFilter: 'current' | 'active' | 'archived' | 'all';
  recentlyUpdated: boolean;
  showArchive: boolean;
  onFolderChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onPinnedChange: (value: 'all' | 'pinned' | 'unpinned') => void;
  onArchiveChange: (value: 'current' | 'active' | 'archived' | 'all') => void;
  onRecentlyUpdatedChange: (value: boolean) => void;
}) {
  const selectClass = 'mt-1 min-h-10 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-2';
  const selectStyle = { borderColor: 'var(--border)', backgroundColor: 'var(--bg)', color: 'var(--text)' };
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Thư mục
      <select className={selectClass} style={selectStyle} value={folderFilter} onChange={(event) => onFolderChange(event.target.value)} aria-label="Lọc theo thư mục">
        <option value="all">Tất cả thư mục</option>
        <option value="none">Không có thư mục</option>
        {getFolderHierarchy(folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{getFolderOptionLabel(folder, depth)}</option>)}
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
    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Thời gian
      <select className={selectClass} style={selectStyle} value={recentlyUpdated ? 'recent' : 'all'} onChange={(event) => onRecentlyUpdatedChange(event.target.value === 'recent')} aria-label="Lọc ghi chú cập nhật gần đây">
        <option value="all">Mọi thời điểm</option>
        <option value="recent">Cập nhật trong 7 ngày</option>
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
