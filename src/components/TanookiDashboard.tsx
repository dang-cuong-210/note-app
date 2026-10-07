import type { FormEvent } from 'react';
import { ArrowRight, Clock3, FileText, Folder as FolderIcon, Pin, Search, Tag as TagIcon } from 'lucide-react';
import type { Folder, Note, TagInfo } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { formatTime, getAllTags, getPreview, noteHasTag } from '@/lib/utils';
import { getDashboardActiveNotes, getDashboardPinnedNotes, getDashboardQuickTags, getDashboardRecentNotes, getDirectFolderNoteCount } from '@/lib/dashboardData.js';
import { TanookiMark } from '@/components/TanookiBrand';

interface TanookiDashboardProps {
  notes: Note[];
  folders: Folder[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onViewChange: (view: ViewType) => void;
  onOpenNote: (noteId: string) => void;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Chào buổi sáng!';
  if (hour < 18) return 'Chào buổi chiều!';
  return 'Chào buổi tối!';
}

function NoteTags({ note, tags, onOpenTag }: { note: Note; tags: TagInfo[]; onOpenTag: (tag: string) => void }) {
  const matching = tags.filter((tag) => noteHasTag(note, tag.name)).slice(0, 3);
  if (!matching.length) return null;
  return <div className="flex flex-wrap gap-1.5">
    {matching.map((tag) => <button key={tag.name} type="button" onClick={() => onOpenTag(tag.name)} className="tanooki-dashboard-tag">#{tag.name}</button>)}
  </div>;
}

export function TanookiDashboard({ notes, folders, searchQuery, onSearchChange, onSearchSubmit, onViewChange, onOpenNote }: TanookiDashboardProps) {
  const activeNotes = getDashboardActiveNotes(notes);
  const pinnedNotes = getDashboardPinnedNotes(activeNotes);
  const recentNotes = getDashboardRecentNotes(activeNotes);
  const tags = getAllTags(activeNotes);
  const quickTags = getDashboardQuickTags(tags);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = searchQuery.trim();
    onSearchChange(value);
    onSearchSubmit(value);
  };

  const openTag = (name: string) => onViewChange({ kind: 'tag', name });

  return <div className="tanooki-dashboard flex-1 min-w-0 h-full overflow-y-auto">
    <div className="tanooki-dashboard-header flex flex-wrap items-center justify-between gap-5 px-7 py-7 xl:px-9">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Tiếp tục viết, tiếp tục sáng tạo.</p>
      </div>
      <form onSubmit={submitSearch} className="tanooki-dashboard-search relative w-full max-w-md">
        <label htmlFor="tanooki-dashboard-search" className="sr-only">Tìm kiếm ghi chú</label>
        <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
        <input id="tanooki-dashboard-search" data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Tìm kiếm ghi chú..." className="w-full rounded-xl border py-3 pl-11 pr-4 text-sm outline-none transition-colors focus-visible:ring-2" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
      </form>
    </div>

    <div className="grid grid-cols-1 gap-5 px-5 pb-8 xl:grid-cols-[minmax(0,1fr)_minmax(250px,0.34fr)] xl:px-7 2xl:px-9">
      <div className="min-w-0 space-y-5">
        <section className="tanooki-dashboard-panel" aria-labelledby="dashboard-pinned-heading">
          <div className="tanooki-dashboard-section-heading">
            <h2 id="dashboard-pinned-heading"><Pin size={19} aria-hidden="true" /> Ghi chú đã ghim</h2>
            <button type="button" onClick={() => onViewChange({ kind: 'pinned' })} className="tanooki-dashboard-view-all">Xem tất cả <ArrowRight size={15} /></button>
          </div>
          {pinnedNotes.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {pinnedNotes.map((note) => <article key={note.id} className="tanooki-dashboard-note-card">
              <button type="button" className="tanooki-dashboard-note-open" onClick={() => onOpenNote(note.id)} aria-label={`Mở ghi chú ${note.title || 'Chưa có tiêu đề'}`}>
                <span className="tanooki-dashboard-note-icon"><FileText size={23} /></span>
                <span className="tanooki-dashboard-note-title">{note.title.trim() || 'Chưa có tiêu đề'}</span>
                <span className="tanooki-dashboard-preview">{getPreview(note.content, 78) || 'Chưa có nội dung'}</span>
                <span className="tanooki-dashboard-updated">Đã sửa {formatTime(note.updatedAt)}</span>
              </button>
              <div className="mt-3 flex items-center justify-between gap-2"><NoteTags note={note} tags={tags} onOpenTag={openTag} /><Pin size={15} aria-label="Đã ghim" className="shrink-0 text-accent" /></div>
            </article>)}
          </div> : <p className="tanooki-dashboard-empty">Chưa có ghi chú nào được ghim.</p>}
        </section>

        <section className="tanooki-dashboard-panel" aria-labelledby="dashboard-recent-heading">
          <div className="tanooki-dashboard-section-heading">
            <h2 id="dashboard-recent-heading"><Clock3 size={19} aria-hidden="true" /> Ghi chú gần đây</h2>
            <button type="button" onClick={() => onViewChange({ kind: 'recent' })} className="tanooki-dashboard-view-all">Xem tất cả <ArrowRight size={15} /></button>
          </div>
          {recentNotes.length ? <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recentNotes.map((note) => <div key={note.id} className="tanooki-dashboard-recent-row">
              <button type="button" className="tanooki-dashboard-recent-open" onClick={() => onOpenNote(note.id)} aria-label={`Mở ghi chú ${note.title || 'Chưa có tiêu đề'}`}>
                <span className="tanooki-dashboard-recent-icon"><FileText size={21} /></span>
                <span className="min-w-0 flex-1"><span className="tanooki-dashboard-note-title">{note.title.trim() || 'Chưa có tiêu đề'}</span><span className="tanooki-dashboard-preview">{getPreview(note.content, 90) || 'Chưa có nội dung'}</span></span>
              </button>
              <div className="hidden min-w-0 xl:block"><NoteTags note={note} tags={tags} onOpenTag={openTag} /></div>
              <span className="hidden whitespace-nowrap text-xs text-tertiary md:block">{formatTime(note.updatedAt)}</span>
              {note.pinned && <Pin size={15} aria-label="Đã ghim" className="hidden shrink-0 text-accent sm:block" />}
            </div>)}
          </div> : <p className="tanooki-dashboard-empty">Chưa có ghi chú gần đây.</p>}
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="tanooki-dashboard-panel" aria-labelledby="dashboard-folders-heading">
          <div className="tanooki-dashboard-section-heading"><h2 id="dashboard-folders-heading"><FolderIcon size={19} aria-hidden="true" /> Thư mục</h2></div>
          {folders.length ? <div className="grid grid-cols-2 gap-2.5">
            {folders.map((folder, index) => <button key={folder.id} type="button" onClick={() => onViewChange({ kind: 'folder', id: folder.id })} className="tanooki-dashboard-folder">
              <FolderIcon size={21} style={{ color: ['var(--tanooki-red)', 'var(--tanooki-orange)', 'var(--tanooki-ochre)', 'var(--tanooki-brown)'][index % 4] }} />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{folder.name}</span><span className="block text-xs text-tertiary">{getDirectFolderNoteCount(activeNotes, folder.id)} ghi chú</span></span>
            </button>)}
          </div> : <p className="tanooki-dashboard-empty">Chưa có thư mục.</p>}
        </section>

        <section className="tanooki-dashboard-panel" aria-labelledby="dashboard-tags-heading">
          <div className="tanooki-dashboard-section-heading"><h2 id="dashboard-tags-heading"><TagIcon size={19} aria-hidden="true" /> Thẻ nhanh</h2></div>
          {quickTags.length ? <div className="flex flex-wrap gap-2">{quickTags.map((tag) => <button key={tag.name} type="button" onClick={() => openTag(tag.name)} className="tanooki-dashboard-tag"><span className="tanooki-dashboard-tag-dot" />{tag.name}<span className="text-tertiary">{tag.count}</span></button>)}</div> : <p className="tanooki-dashboard-empty">Thêm thẻ bằng cách viết #tên-thẻ trong ghi chú.</p>}
        </section>

        <section className="tanooki-dashboard-quote" aria-label="Lời nhắc Tanooki">
          <div><p>“Mỗi ngày một chút,<br />ý tưởng sẽ thành hình.”</p><span>Tanooki</span></div>
          <TanookiMark />
        </section>
      </aside>
    </div>
  </div>;
}
