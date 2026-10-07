import { useEffect, useRef, useState } from 'react';
import { Archive, Clock3, FileText, Folder as FolderIcon, LogOut, MoreHorizontal, Pin, Plus, Search, Settings as SettingsIcon, Tag as TagIcon, Trash2 } from 'lucide-react';
import { TanookiMark } from '@/components/TanookiBrand';
import type { Folder, Note } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { getAllTags } from '@/lib/utils';
import { getDirectFolderNoteCount } from '@/lib/dashboardData.js';

interface DesktopSidebarProps {
  notes: Note[];
  folders: Folder[];
  currentView: ViewType;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onViewChange: (view: ViewType) => void;
  onAddNote: () => void;
  onAddFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onSignOut: () => void;
  hideSearch?: boolean;
}

const navItems = [
  { label: 'Trang chủ', icon: FileText, view: { kind: 'home' } as ViewType },
  { label: 'Tất cả ghi chú', icon: FileText, view: { kind: 'all' } as ViewType, count: 'all' },
  { label: 'Đã ghim', icon: Pin, view: { kind: 'pinned' } as ViewType, count: 'pinned' },
  { label: 'Gần đây', icon: Clock3, view: { kind: 'recent' } as ViewType },
  { label: 'Lưu trữ', icon: Archive, view: { kind: 'archived' } as ViewType, count: 'archived' },
  { label: 'Thùng rác', icon: Trash2, view: { kind: 'trash' } as ViewType, count: 'trash' },
];

export function DesktopSidebar(props: DesktopSidebarProps) {
  const { notes, folders, currentView, searchQuery, onSearchChange, onSearchSubmit, onViewChange, onAddNote, onAddFolder, onRenameFolder, onDeleteFolder, onSignOut, hideSearch = false } = props;
  const [folderInputOpen, setFolderInputOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const folderTriggerRef = useRef<HTMLButtonElement>(null);
  const renameCommitted = useRef(false);
  const activeNotes = notes.filter((note) => !note.trashed);
  const tags = getAllTags(activeNotes);
  const count = {
    all: activeNotes.filter((note) => !note.archived).length,
    pinned: activeNotes.filter((note) => !note.archived && note.pinned).length,
    archived: activeNotes.filter((note) => note.archived).length,
    trash: notes.filter((note) => note.trashed).length,
  };

  useEffect(() => {
    if (!folderMenuFor) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (folderMenuRef.current?.contains(target) || folderTriggerRef.current?.contains(target))) return;
      setFolderMenuFor(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [folderMenuFor]);

  const isActive = (view: ViewType) => JSON.stringify(view) === JSON.stringify(currentView);
  const submitFolder = () => {
    if (!folderName.trim()) return;
    onAddFolder(folderName.trim());
    setFolderName('');
    setFolderInputOpen(false);
  };
  const beginRename = (folder: Folder) => {
    renameCommitted.current = false;
    setEditName(folder.name);
    setEditingFolder(folder.id);
    setFolderMenuFor(null);
  };
  const commitRename = (folder: Folder) => {
    if (renameCommitted.current) return;
    renameCommitted.current = true;
    if (editName.trim()) onRenameFolder(folder.id, editName.trim());
    setEditingFolder(null);
  };

  return <aside className="tanooki-desktop-sidebar h-full w-[260px] shrink-0">
    <div className="flex items-center gap-2 px-5 py-5">
      <TanookiMark />
      <div className="min-w-0"><div className="tanooki-desktop-wordmark">Tanooki</div><div className="text-[11px] text-tertiary">Ý tưởng của bạn, được lưu giữ.</div></div>
    </div>

    <div className="px-4 pb-3">
      <button type="button" onClick={onAddNote} className="tanooki-desktop-create"><Plus size={18} />Ghi chú mới</button>
    </div>

    {currentView.kind !== 'home' && !hideSearch && <div className="px-4 pb-3">
      <form onSubmit={(event) => { event.preventDefault(); onSearchSubmit(searchQuery.trim()); }} className="relative">
        <label htmlFor="tanooki-sidebar-search" className="sr-only">Tìm kiếm ghi chú</label>
        <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
        <input id="tanooki-sidebar-search" data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Tìm ghi chú..." className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2" style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
      </form>
    </div>}

    <nav aria-label="Điều hướng chính" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2">
      <div className="space-y-1">
        {navItems.map(({ label, icon: Icon, view, count: countKey }) => <button key={label} type="button" onClick={() => onViewChange(view)} aria-current={isActive(view) ? 'page' : undefined} className={`tanooki-desktop-nav-item ${isActive(view) ? 'is-active' : ''}`}>
          <Icon size={18} aria-hidden="true" /><span className="flex-1">{label}</span>{countKey && count[countKey as keyof typeof count] > 0 && <span className="text-xs text-tertiary">{count[countKey as keyof typeof count]}</span>}
        </button>)}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">Thư mục</h2>
          <button type="button" aria-label="Thêm thư mục" title="Thêm thư mục" onClick={() => setFolderInputOpen(true)} className="rounded p-1 hover-bg"><Plus size={16} /></button>
        </div>
        {folderInputOpen && <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitFolder(); if (event.key === 'Escape') { setFolderInputOpen(false); setFolderName(''); } }} onBlur={submitFolder} placeholder="Tên thư mục" aria-label="Tên thư mục mới" className="mb-1 w-full rounded-lg border bg-transparent px-2 py-2 text-sm outline-none focus-visible:ring-2" style={{ borderColor: 'var(--border)' }} />}
        {folders.map((folder, index) => <div key={folder.id} className="group relative mb-0.5">
          {editingFolder === folder.id ? <input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitRename(folder); if (event.key === 'Escape') { renameCommitted.current = true; setEditingFolder(null); } }} onBlur={() => commitRename(folder)} aria-label={`Đổi tên ${folder.name}`} className="w-full rounded-lg border bg-transparent px-2 py-2 text-sm outline-none focus-visible:ring-2" style={{ borderColor: 'var(--border)' }} /> : <>
            <button type="button" onClick={() => onViewChange({ kind: 'folder', id: folder.id })} aria-current={isActive({ kind: 'folder', id: folder.id }) ? 'page' : undefined} className={`tanooki-desktop-nav-item pr-9 ${isActive({ kind: 'folder', id: folder.id }) ? 'is-active' : ''}`}>
              <FolderIcon size={17} aria-hidden="true" style={{ color: ['var(--tanooki-red)', 'var(--tanooki-orange)', 'var(--tanooki-ochre)', 'var(--tanooki-brown)'][index % 4] }} /><span className="flex-1 truncate">{folder.name}</span><span className="text-xs text-tertiary">{getDirectFolderNoteCount(activeNotes, folder.id)}</span>
            </button>
            <button ref={folderMenuFor === folder.id ? folderTriggerRef : undefined} type="button" aria-label={`Tùy chọn thư mục ${folder.name}`} aria-expanded={folderMenuFor === folder.id} onClick={() => setFolderMenuFor(folderMenuFor === folder.id ? null : folder.id)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover-bg"><MoreHorizontal size={16} /></button>
            {folderMenuFor === folder.id && <div ref={folderMenuRef} role="menu" className="absolute right-0 top-9 z-30 w-40 rounded-xl border p-1 shadow-lg" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              <button type="button" role="menuitem" onClick={() => beginRename(folder)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover-bg">Đổi tên</button>
              <button type="button" role="menuitem" onClick={() => { setFolderMenuFor(null); if (window.confirm(`Xóa thư mục “${folder.name}”? Các ghi chú trong đó sẽ được chuyển vào Tất cả ghi chú.`)) onDeleteFolder(folder.id); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover-bg">Xóa thư mục</button>
            </div>}
          </>}
        </div>)}
        {!folders.length && !folderInputOpen && <p className="px-2 py-1 text-xs text-tertiary">Chưa có thư mục</p>}
      </div>

      <div className="mt-5">
        <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-tertiary">Thẻ</h2>
        <div className="space-y-0.5">{tags.slice(0, 12).map((tag) => <button key={tag.name} type="button" onClick={() => onViewChange({ kind: 'tag', name: tag.name })} aria-current={isActive({ kind: 'tag', name: tag.name }) ? 'page' : undefined} className={`tanooki-desktop-nav-item ${isActive({ kind: 'tag', name: tag.name }) ? 'is-active' : ''}`}><TagIcon size={16} aria-hidden="true" /><span className="flex-1 truncate">{tag.name}</span><span className="text-xs text-tertiary">{tag.count}</span></button>)}</div>
      </div>
    </nav>

    <div className="space-y-1 border-t p-3" style={{ borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => onViewChange({ kind: 'settings' })} aria-current={currentView.kind === 'settings' ? 'page' : undefined} className={`tanooki-desktop-nav-item ${currentView.kind === 'settings' ? 'is-active' : ''}`}><SettingsIcon size={18} /><span>Cài đặt</span></button>
      <button type="button" onClick={onSignOut} className="tanooki-desktop-nav-item"><LogOut size={18} /><span>Đăng xuất</span></button>
    </div>
  </aside>;
}
