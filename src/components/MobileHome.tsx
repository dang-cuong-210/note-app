import { useMemo, useState } from 'react';
import { Archive, ChevronRight, FileText, Folder, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Folder as FolderRecord, Note } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { getMobileHomeCounts, getMobileHomeFolderCount, getMatchingMobileHomeFolders } from '@/lib/mobileHome.js';
import { TanookiMark } from '@/components/TanookiBrand';
import { MobileCreateFolderSheet } from '@/components/MobileEditorSheets';
import { LiveSearchResults } from '@/components/LiveSearchResults';

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
}

export function MobileHome({ notes, folders, searchQuery, onSearchChange, onSearchSubmit, onOpenNote, onOpenView, onOpenFolder, onAddFolder, onCreateNote }: MobileHomeProps) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const counts = useMemo(() => getMobileHomeCounts(notes), [notes]);
  const folderMatches = useMemo(() => getMatchingMobileHomeFolders(folders, searchQuery), [folders, searchQuery]);
  const searching = Boolean(searchQuery.trim());
  const activeNotes = useMemo(() => notes.filter((note) => !note.trashed && !note.archived), [notes]);

  return <div className="tanooki-mobile-home">
    <div className="tanooki-mobile-home-scroll">
      <header className="tanooki-mobile-home-header">
        <div className="tanooki-mobile-home-brand"><TanookiMark /><span>Tanooki</span></div>
        <label className="tanooki-mobile-home-search">
          <Search size={22} aria-hidden="true" />
          <input data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="Tìm kiếm ghi chú, thư mục..." aria-label="Tìm kiếm ghi chú, thư mục" />
        </label>
      </header>

      {searching ? <div className="tanooki-mobile-home-search-results">
        {folderMatches.length > 0 && <section className="tanooki-mobile-home-match-section" aria-label="Thư mục phù hợp">
          <h2>Thư mục</h2>
          <div className="tanooki-mobile-home-grouped-card">
            {folderMatches.map((folder) => <FolderRow key={folder.id} folder={folder} count={getMobileHomeFolderCount(notes, folder.id)} onClick={() => onOpenFolder(folder.id)} />)}
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
            {folders.map((folder) => <FolderRow key={folder.id} folder={folder} count={getMobileHomeFolderCount(notes, folder.id)} onClick={() => onOpenFolder(folder.id)} />)}
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
  </div>;
}

function FolderRow({ folder, count, onClick }: { folder: FolderRecord; count: number; onClick: () => void }) {
  return <button type="button" className="tanooki-mobile-home-row" onClick={onClick}>
    <span className="tanooki-mobile-home-folder-icon"><Folder size={29} fill="currentColor" aria-hidden="true" /></span>
    <strong>{folder.name}</strong><span className="tanooki-mobile-home-count">{count}</span><ChevronRight size={23} aria-hidden="true" />
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

export function MobileFoldersView({ folders, notes, onOpenFolder, onAddFolder }: { folders: FolderRecord[]; notes: Note[]; onOpenFolder: (id: string) => void; onAddFolder: (name: string) => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  return <div className="tanooki-mobile-page">
    <header className="tanooki-mobile-page-heading"><div><h1>Thư mục</h1><p>Ghi chú được sắp xếp theo chủ đề.</p></div><button type="button" aria-label="Tạo thư mục" onClick={() => setCreateOpen(true)}><Plus size={20} /></button></header>
    {folders.length ? <div className="tanooki-mobile-folder-list">
      {folders.map((folder, index) => {
        const count = notes.filter((note) => note.folderId === folder.id && !note.trashed && !note.archived).length;
        return <button type="button" key={folder.id} onClick={() => onOpenFolder(folder.id)}>
          <span className={`tanooki-mobile-folder-icon tone-${index % 4}`}><Folder /></span>
          <span><strong>{folder.name}</strong><small>{count} ghi chú</small></span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>;
      })}
    </div> : <p className="tanooki-mobile-empty">Chưa có thư mục nào.</p>}
    <MobileCreateFolderSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={onAddFolder} />
  </div>;
}
