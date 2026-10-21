import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ChevronRight, Copy, Edit3, FileText, Folder, Pencil, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Folder as FolderRecord, Note } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { getMobileHomeCounts, getMobileHomeFolderCount, getMatchingMobileHomeFolders } from '@/lib/mobileHome.js';
import { TanookiMark } from '@/components/TanookiBrand';
import { MobileCreateFolderSheet, MobileFolderRenameSheet } from '@/components/MobileEditorSheets';
import { MobileContextPopover } from '@/components/MobileContextPopover';
import { useMobileLongPress, type MobileContextTarget } from '@/components/useMobileLongPress';
import { LiveSearchResults } from '@/components/LiveSearchResults';
import { getFolderDisplayPath, getFolderHierarchy } from '@/lib/folderHierarchy.js';

interface MobileHomeProps {
  notes: Note[];
  folders: FolderRecord[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onOpenNote: (id: string) => void;
  onOpenView: (view: ViewType) => void;
  onOpenFolder: (id: string) => void;
  onAddFolder: (name: string) => void;
  onCreateNote: () => void;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
}

export function MobileHome({ notes, folders, searchQuery, onSearchChange, onSearchSubmit, onOpenNote, onOpenView, onOpenFolder, onAddFolder, onCreateNote, onTogglePin, onTrash, onDuplicate, onArchive, onMove, onRenameFolder, onDeleteFolder }: MobileHomeProps) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [contextTarget, setContextTarget] = useState<MobileContextTarget | null>(null);
  const [contextClosing, setContextClosing] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<MobileContextTarget | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const contextCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeContext = (afterClose?: () => void) => {
    if (!contextTarget) return;
    if (contextCloseTimer.current) clearTimeout(contextCloseTimer.current);
    setContextClosing(true);
    contextCloseTimer.current = setTimeout(() => {
      setContextTarget(null);
      setContextClosing(false);
      setMoveOpen(false);
      contextCloseTimer.current = null;
      afterClose?.();
    }, 150);
  };
  const longPressHandlers = useMobileLongPress((target) => {
    if (contextCloseTimer.current) clearTimeout(contextCloseTimer.current);
    contextCloseTimer.current = null;
    setContextClosing(false);
    setMoveOpen(false);
    setContextTarget(target);
  });
  useEffect(() => () => { if (contextCloseTimer.current) clearTimeout(contextCloseTimer.current); }, []);
  const counts = useMemo(() => getMobileHomeCounts(notes), [notes]);
  const folderMatches = useMemo(() => getMatchingMobileHomeFolders(folders, searchQuery), [folders, searchQuery]);
  const folderHierarchy = useMemo(() => getFolderHierarchy(folders), [folders]);
  const matchingFolderIds = useMemo(() => new Set(folderMatches.map((folder) => folder.id)), [folderMatches]);
  const searching = Boolean(searchQuery.trim());
  const activeNotes = useMemo(() => notes.filter((note) => !note.trashed && !note.archived), [notes]);

  return <div className="tanooki-mobile-home" {...longPressHandlers}>
    <header className="tanooki-mobile-home-header">
      <button type="button" className="tanooki-mobile-home-brand" onClick={() => window.location.reload()} aria-label="Tải lại Tanooki" title="Tải lại Tanooki"><TanookiMark /><span>Tanooki</span></button>
      <label className="tanooki-mobile-home-search">
        <Search size={22} aria-hidden="true" />
        <input data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="Tìm kiếm ghi chú, thư mục..." aria-label="Tìm kiếm ghi chú, thư mục" />
      </label>
    </header>

    <div className="tanooki-mobile-home-scroll">
      {searching ? <div className="tanooki-mobile-home-search-results">
        {folderMatches.length > 0 && <section className="tanooki-mobile-home-match-section" aria-label="Thư mục phù hợp">
          <h2>Thư mục</h2>
          <div className="tanooki-mobile-home-grouped-card">
            {folderHierarchy.filter(({ folder }) => matchingFolderIds.has(folder.id)).map(({ folder, depth }) => <FolderRow key={folder.id} folder={folder} depth={depth} context={depth ? getFolderDisplayPath(folders, folder.id) : undefined} count={getMobileHomeFolderCount(notes, folder.id)} onClick={() => onOpenFolder(folder.id)} />)}
          </div>
        </section>}
        <LiveSearchResults notes={activeNotes} query={searchQuery} onOpenNote={onOpenNote} onShowAll={onSearchSubmit} />
      </div> : <>
        <button type="button" className="tanooki-mobile-home-all-notes" onClick={() => onOpenView({ kind: 'all' })}>
          <span className="tanooki-mobile-home-all-icon"><FileText size={27} aria-hidden="true" /></span>
          <strong>Tất cả ghi chú</strong>
          <span className="tanooki-mobile-home-count">{counts.active}</span>
          <ChevronRight size={23} aria-hidden="true" />
        </button>

        <section className="tanooki-mobile-home-section" aria-labelledby="tanooki-mobile-home-folders">
          <h1 id="tanooki-mobile-home-folders">Thư mục</h1>
          {folders.length > 0 ? <div className="tanooki-mobile-home-grouped-card">
            {folderHierarchy.filter(({ depth }) => depth === 0).map(({ folder }) => <FolderRow key={folder.id} folder={folder} count={getMobileHomeFolderCount(notes, folder.id)} onClick={() => onOpenFolder(folder.id)} />)}
          </div> : <p className="tanooki-mobile-home-empty-folders">Chưa có thư mục nào.</p>}
        </section>

        <div className="tanooki-mobile-home-grouped-card tanooki-mobile-home-archive-group">
          <HomeViewRow icon={Archive} label="Lưu trữ" count={counts.archived} iconClass="is-archive" onClick={() => onOpenView({ kind: 'archived' })} />
          <HomeViewRow icon={Trash2} label="Đã xóa gần đây" count={counts.trashed} iconClass="is-trash" onClick={() => onOpenView({ kind: 'trash' })} />
        </div>
      </>}
    </div>

    {!searching && <footer className="tanooki-mobile-home-actions">
      <button type="button" className="tanooki-mobile-home-action is-folder" onClick={() => setCreateFolderOpen(true)}>
        <span><FolderPlusIcon /></span><strong>Thêm thư mục</strong>
      </button>
      <button type="button" className="tanooki-mobile-home-action is-new" onClick={onCreateNote}>
        <span><Pencil size={31} aria-hidden="true" /></span><strong>Tạo mới</strong>
      </button>
    </footer>}
    <MobileCreateFolderSheet open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} onCreate={onAddFolder} />
    <MobileContextPopover target={contextTarget} closing={contextClosing} onClose={() => closeContext()} labelledBy="mobile-home-context-menu">
      {contextTarget?.kind === 'note' ? (() => {
        const note = notes.find((item) => item.id === contextTarget.id && !item.trashed && !item.archived);
        if (!note) return null;
        const run = (action: () => void) => closeContext(action);
        return <>
          <button type="button" role="menuitem" onClick={() => run(() => onTogglePin(note.id))}>{note.pinned ? <PinOff size={18} /> : <Pin size={18} />}<span>{note.pinned ? 'Bỏ ghim' : 'Ghim'}</span></button>
          <button type="button" role="menuitem" onClick={() => setMoveOpen((open) => !open)}><Folder size={18} /><span>Di chuyển</span><ChevronRight className="ml-auto" size={17} /></button>
          {moveOpen && <div className="tanooki-mobile-context-submenu"><button type="button" role="menuitem" onClick={() => run(() => onMove(note.id, null))}>Không có thư mục</button>{folders.map((folder) => <button type="button" role="menuitem" key={folder.id} onClick={() => run(() => onMove(note.id, folder.id))}>{folder.name}</button>)}</div>}
          <button type="button" role="menuitem" onClick={() => run(() => onArchive(note.id, !note.archived))}>{note.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}<span>{note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}</span></button>
          <button type="button" role="menuitem" onClick={() => run(() => onDuplicate(note.id))}><Copy size={18} /><span>Tạo bản sao</span></button>
          <div className="tanooki-mobile-context-divider" />
          <button type="button" role="menuitem" className="is-danger" onClick={() => run(() => onTrash(note.id))}><Trash2 size={18} /><span>Chuyển vào thùng rác</span></button>
        </>;
      })() : contextTarget?.kind === 'folder' ? <>
        <button type="button" role="menuitem" onClick={() => closeContext(() => setRenameFolderTarget(contextTarget))}><Edit3 size={18} /><span>Đổi tên</span></button>
        <button type="button" role="menuitem" className="is-danger" onClick={() => { const folder = folders.find((item) => item.id === contextTarget.id); closeContext(() => { if (folder && window.confirm(`Xóa thư mục “${folder.name}”? Ghi chú trực tiếp sẽ được chuyển về Tất cả ghi chú; thư mục con sẽ được chuyển lên cấp cha.`)) onDeleteFolder(folder.id); }); }}><Trash2 size={18} /><span>Xóa thư mục</span></button>
      </> : null}
    </MobileContextPopover>
    {renameFolderTarget && <MobileFolderRenameSheet open folderName={renameFolderTarget.title} onClose={() => setRenameFolderTarget(null)} onRename={(name) => onRenameFolder(renameFolderTarget.id, name)} />}
  </div>;
}

function FolderRow({ folder, count, depth = 0, context, onClick }: { folder: FolderRecord; count: number; depth?: number; context?: string; onClick: () => void }) {
  return <button type="button" className="tanooki-mobile-home-row" data-mobile-context-kind="folder" data-mobile-context-id={folder.id} data-mobile-context-title={folder.name} data-mobile-context-detail={`${count} ghi chú`} data-folder-depth={depth} style={{ paddingLeft: `calc(var(--mobile-home-folder-row-inset, 11px) + ${depth * 16}px)` }} onClick={onClick} aria-label={context ? `${folder.name}, trong ${context}` : folder.name}>
    <span className="tanooki-mobile-home-folder-icon"><Folder size={29} fill="currentColor" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><strong className="block truncate">{folder.name}</strong>{context && <small className="block truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>{context}</small>}</span><span className="tanooki-mobile-home-count">{count}</span><ChevronRight size={23} aria-hidden="true" />
  </button>;
}

function HomeViewRow({ icon: Icon, label, count, iconClass, onClick }: { icon: LucideIcon; label: string; count: number; iconClass: string; onClick: () => void }) {
  return <button type="button" className="tanooki-mobile-home-row" onClick={onClick}>
    <span className={`tanooki-mobile-home-view-icon ${iconClass}`}><Icon size={23} aria-hidden="true" /></span>
    <strong>{label}</strong><span className="tanooki-mobile-home-count">{count}</span><ChevronRight size={23} aria-hidden="true" />
  </button>;
}

function FolderPlusIcon() {
  return <span className="tanooki-mobile-home-folder-plus" aria-hidden="true"><Folder size={34} /><Plus size={17} /></span>;
}

export function MobileFoldersView({ folders, notes, onOpenFolder, onAddFolder, onRenameFolder, onDeleteFolder }: { folders: FolderRecord[]; notes: Note[]; onOpenFolder: (id: string) => void; onAddFolder: (name: string) => void; onRenameFolder: (id: string, name: string) => void; onDeleteFolder: (id: string) => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [contextTarget, setContextTarget] = useState<MobileContextTarget | null>(null);
  const [contextClosing, setContextClosing] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<MobileContextTarget | null>(null);
  const contextCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeContext = (afterClose?: () => void) => {
    if (!contextTarget) return;
    if (contextCloseTimer.current) clearTimeout(contextCloseTimer.current);
    setContextClosing(true);
    contextCloseTimer.current = setTimeout(() => {
      setContextTarget(null);
      setContextClosing(false);
      contextCloseTimer.current = null;
      afterClose?.();
    }, 150);
  };
  const folderHierarchy = useMemo(() => getFolderHierarchy(folders), [folders]);
  const longPressHandlers = useMobileLongPress((target) => {
    if (contextCloseTimer.current) clearTimeout(contextCloseTimer.current);
    contextCloseTimer.current = null;
    setContextClosing(false);
    setContextTarget(target);
  });
  useEffect(() => () => { if (contextCloseTimer.current) clearTimeout(contextCloseTimer.current); }, []);
  return <div className="tanooki-mobile-page">
    <header className="tanooki-mobile-page-heading"><div><h1>Thư mục</h1><p>Ghi chú được sắp xếp theo chủ đề.</p></div><button type="button" aria-label="Tạo thư mục" onClick={() => setCreateOpen(true)}><Plus size={20} /></button></header>
      {folderHierarchy.some(({ depth }) => depth === 0) ? <div className="tanooki-mobile-folder-list" {...longPressHandlers}>
      {folderHierarchy.filter(({ depth }) => depth === 0).map(({ folder }, index) => {
        const count = notes.filter((note) => note.folderId === folder.id && !note.trashed && !note.archived).length;
        return <button type="button" key={folder.id} data-mobile-context-kind="folder" data-mobile-context-id={folder.id} data-mobile-context-title={folder.name} data-mobile-context-detail={`${count} ghi chú`} onClick={() => onOpenFolder(folder.id)} aria-label={folder.name}>
          <span className={`tanooki-mobile-folder-icon tone-${index % 4}`}><Folder /></span>
          <span><strong>{folder.name}</strong><small>{count} ghi chú</small></span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>;
      })}
    </div> : <p className="tanooki-mobile-empty">Chưa có thư mục nào.</p>}
    <MobileCreateFolderSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={onAddFolder} />
    <MobileContextPopover target={contextTarget} closing={contextClosing} onClose={() => closeContext()} labelledBy="mobile-folders-context-menu">
      {contextTarget?.kind === 'folder' && <>
        <button type="button" role="menuitem" onClick={() => closeContext(() => setRenameFolderTarget(contextTarget))}><Edit3 size={18} /><span>Đổi tên</span></button>
        <button type="button" role="menuitem" className="is-danger" onClick={() => { const folder = folders.find((item) => item.id === contextTarget.id); closeContext(() => { if (folder && window.confirm(`Xóa thư mục “${folder.name}”? Ghi chú trực tiếp sẽ được chuyển về Tất cả ghi chú; thư mục con sẽ được chuyển lên cấp cha.`)) onDeleteFolder(folder.id); }); }}><Trash2 size={18} /><span>Xóa thư mục</span></button>
      </>}
    </MobileContextPopover>
    {renameFolderTarget && <MobileFolderRenameSheet open folderName={renameFolderTarget.title} onClose={() => setRenameFolderTarget(null)} onRename={(name) => onRenameFolder(renameFolderTarget.id, name)} />}
  </div>;
}
