import { useState } from 'react';
import { ArrowRight, Clock3, FileText, Folder as FolderIcon, Pin, Plus, Search } from 'lucide-react';
import type { Folder, Note } from '@/types';
import { formatTime, getPreview } from '@/lib/utils';
import { getDashboardPinnedNotes, getDashboardRecentNotes } from '@/lib/dashboardData.js';
import { TanookiMark } from '@/components/TanookiBrand';
import { MobileCreateFolderSheet } from '@/components/MobileEditorSheets';
import { LiveSearchResults } from '@/components/LiveSearchResults';
import { normalizeSearchText } from '@/lib/advancedSearch.js';

interface MobileHomeProps {
  notes: Note[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onOpenNote: (id: string) => void;
  onViewRecent: () => void;
}

export function MobileHome({ notes, searchQuery, onSearchChange, onSearchSubmit, onOpenNote, onViewRecent }: MobileHomeProps) {
  const activeNotes = notes.filter((note) => !note.trashed && !note.archived);
  const hasQuery = Boolean(normalizeSearchText(searchQuery));
  const pinned = getDashboardPinnedNotes(notes, 4);
  const recent = getDashboardRecentNotes(notes, 5);

  return <div className="tanooki-mobile-page">
    <header className="tanooki-mobile-home-header">
      <div className="tanooki-mobile-home-brand"><TanookiMark /><span>Tanooki</span></div>
      <p>Ý tưởng của bạn, được lưu giữ dịu dàng.</p>
      <div className="tanooki-mobile-search">
        <Search size={19} aria-hidden="true" />
        <input data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="Tìm kiếm ghi chú..." aria-label="Tìm kiếm ghi chú" />
      </div>
    </header>

    {hasQuery && <LiveSearchResults notes={activeNotes} query={searchQuery} onOpenNote={onOpenNote} onShowAll={onSearchSubmit} />}

    {!hasQuery && <section className="tanooki-mobile-section" aria-labelledby="mobile-pinned-heading">
      <div className="tanooki-mobile-section-heading"><h2 id="mobile-pinned-heading"><Pin size={18} /> Đã ghim</h2></div>
      {pinned.length ? <div className="tanooki-mobile-pinned-strip">
        {pinned.map((note) => <button type="button" className="tanooki-mobile-pinned-card" key={note.id} onClick={() => onOpenNote(note.id)}>
          <span className="tanooki-mobile-card-icon"><FileText size={21} /></span>
          <span className="tanooki-mobile-card-title">{note.title.trim() || 'Chưa có tiêu đề'}</span>
          <span className="tanooki-mobile-card-preview">{getPreview(note.content, 80) || 'Chưa có nội dung'}</span>
          <span className="tanooki-mobile-card-time">{formatTime(note.updatedAt)}</span>
        </button>)}
      </div> : <p className="tanooki-mobile-empty">Ghi chú bạn ghim sẽ xuất hiện ở đây.</p>}
    </section>}

    {!hasQuery && <section className="tanooki-mobile-section" aria-labelledby="mobile-recent-heading">
      <div className="tanooki-mobile-section-heading"><h2 id="mobile-recent-heading"><Clock3 size={18} /> Gần đây</h2><button type="button" onClick={onViewRecent}>Xem tất cả <ArrowRight size={15} /></button></div>
      {recent.length ? <div className="tanooki-mobile-recent-list">
        {recent.map((note) => <button type="button" className="tanooki-mobile-recent-row" key={note.id} onClick={() => onOpenNote(note.id)}>
          <span className="tanooki-mobile-recent-icon"><FileText size={20} /></span>
          <span className="tanooki-mobile-recent-copy"><strong>{note.title.trim() || 'Chưa có tiêu đề'}</strong><span>{getPreview(note.content, 92) || 'Chưa có nội dung'}</span></span>
          <time>{formatTime(note.updatedAt)}</time>
        </button>)}
      </div> : <p className="tanooki-mobile-empty">Ghi chú mới của bạn sẽ xuất hiện ở đây.</p>}
    </section>}
  </div>;
}

export function MobileFoldersView({ folders, notes, onOpenFolder, onAddFolder }: { folders: Folder[]; notes: Note[]; onOpenFolder: (id: string) => void; onAddFolder: (name: string) => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  return <div className="tanooki-mobile-page">
    <header className="tanooki-mobile-page-heading"><div><h1>Thư mục</h1><p>Ghi chú được sắp xếp theo chủ đề.</p></div><button type="button" aria-label="Tạo thư mục" onClick={() => setCreateOpen(true)}><Plus size={20} /></button></header>
    {folders.length ? <div className="tanooki-mobile-folder-list">
      {folders.map((folder, index) => {
        const count = notes.filter((note) => note.folderId === folder.id && !note.trashed && !note.archived).length;
        return <button type="button" key={folder.id} onClick={() => onOpenFolder(folder.id)}>
          <span className={`tanooki-mobile-folder-icon tone-${index % 4}`}><FolderIcon /></span>
          <span><strong>{folder.name}</strong><small>{count} ghi chú</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>;
      })}
    </div> : <p className="tanooki-mobile-empty">Chưa có thư mục nào.</p>}
    <MobileCreateFolderSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={onAddFolder} />
  </div>;
}
