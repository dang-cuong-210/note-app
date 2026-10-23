import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowRight, Clock3, Copy, FileText, Folder as FolderIcon, Pin, PinOff, Search, Share2, Tag as TagIcon, Trash2, ChevronRight } from 'lucide-react';
import type { Folder, Note, TagInfo } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { formatTime, getAllTags, getPreview, htmlToText, noteHasTag } from '@/lib/utils';
import { getDashboardActiveNotes, getDashboardPinnedNotes, getDashboardQuickTags, getDashboardRecentNotes, getDirectFolderNoteCount } from '@/lib/dashboardData.js';
import { TanookiMark } from '@/components/TanookiBrand';
import { LiveSearchResults } from '@/components/LiveSearchResults';
import { normalizeSearchText } from '@/lib/advancedSearch.js';
import { getEffectiveRecentTime } from '@/lib/recentNotes.js';
import { DesktopContextMenu, type DesktopMenuPoint } from '@/components/DesktopContextMenu';
import { announceDesktopContextMenu } from '@/lib/desktopContextMenuEvents';
import { DesktopFolderMoveOptions } from '@/components/NoteList';
import { shareNoteContent } from '@/lib/shareNote';
import { useToast } from '@/contexts/ToastContext';

interface TanookiDashboardProps {
  notes: Note[];
  folders: Folder[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onViewChange: (view: ViewType) => void;
  onOpenNote: (noteId: string) => void;
  recentOpenedAt?: Record<string, number>;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
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

export function TanookiDashboard({ notes, folders, searchQuery, onSearchChange, onSearchSubmit, onViewChange, onOpenNote, recentOpenedAt = {}, onTogglePin, onTrash, onDuplicate, onArchive, onMove, onRenameFolder, onDeleteFolder }: TanookiDashboardProps) {
  const [contextMenu, setContextMenu] = useState<{ kind: 'note' | 'folder'; id: string; point: DesktopMenuPoint } | null>(null);
  const [contextMoveOpen, setContextMoveOpen] = useState(false);
  const { toast } = useToast();
  const activeNotes = getDashboardActiveNotes(notes);
  const pinnedNotes = getDashboardPinnedNotes(activeNotes);
  const recentNotes = getDashboardRecentNotes(activeNotes, 5, recentOpenedAt);
  const tags = getAllTags(activeNotes);
  const quickTags = getDashboardQuickTags(tags);
  const hasQuery = Boolean(normalizeSearchText(searchQuery));

  const openTag = (name: string) => onViewChange({ kind: 'tag', name });
  const openContextMenu = (event: React.MouseEvent<HTMLElement>, kind: 'note' | 'folder', id: string) => {
    event.preventDefault();
    event.stopPropagation();
    announceDesktopContextMenu();
    setContextMoveOpen(false);
    setContextMenu({ kind, id, point: { x: event.clientX, y: event.clientY } });
  };
  const closeContextMenu = () => { setContextMenu(null); setContextMoveOpen(false); };
  const shareNote = async (note: Note) => {
    try {
      const result = await shareNoteContent(note.title.trim() || 'Ghi chú', htmlToText(note.content));
      if (result === 'copied') toast('Đã sao chép nội dung ghi chú');
      if (result === 'unsupported') toast('Thiết bị này không hỗ trợ chia sẻ trực tiếp.');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) toast('Không thể chia sẻ ghi chú');
    }
  };

  return <div className="tanooki-dashboard flex-1 min-w-0 h-full overflow-y-auto">
    <div className="tanooki-dashboard-header flex flex-wrap items-center justify-between gap-5 px-7 py-7 xl:px-9">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Tiếp tục viết, tiếp tục sáng tạo.</p>
      </div>
      <div className="tanooki-dashboard-search relative w-full max-w-md">
        <label htmlFor="tanooki-dashboard-search" className="sr-only">Tìm kiếm ghi chú</label>
        <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
        <input id="tanooki-dashboard-search" data-global-search value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Tìm kiếm ghi chú..." className="w-full rounded-xl border py-3 pl-11 pr-4 text-sm outline-none transition-colors focus-visible:ring-2" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
      </div>
    </div>

    {hasQuery ? <div className="px-5 pb-8 xl:px-7 2xl:px-9"><LiveSearchResults notes={activeNotes} query={searchQuery} onOpenNote={onOpenNote} onShowAll={onSearchSubmit} /></div> : <div className="tanooki-dashboard-columns grid gap-5 px-5 pb-8 xl:px-7 2xl:px-9">
      <div className="min-w-0 space-y-5">
        <section className={`tanooki-dashboard-panel tanooki-dashboard-pinned-panel${pinnedNotes.length ? '' : ' is-empty'}`} aria-labelledby="dashboard-pinned-heading">
          <div className="tanooki-dashboard-section-heading">
            <h2 id="dashboard-pinned-heading"><Pin size={19} aria-hidden="true" /> Ghi chú đã ghim</h2>
            <button type="button" onClick={() => onViewChange({ kind: 'pinned' })} className="tanooki-dashboard-view-all">Xem tất cả <ArrowRight size={15} /></button>
          </div>
          {pinnedNotes.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {pinnedNotes.map((note) => <article key={note.id} onContextMenu={(event) => openContextMenu(event, 'note', note.id)} className={`tanooki-dashboard-note-card${contextMenu?.kind === 'note' && contextMenu.id === note.id ? ' is-context-open' : ''}`}>
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
            {recentNotes.map((note) => <div key={note.id} onContextMenu={(event) => openContextMenu(event, 'note', note.id)} className={`tanooki-dashboard-recent-row${contextMenu?.kind === 'note' && contextMenu.id === note.id ? ' is-context-open' : ''}`}>
              <button type="button" className="tanooki-dashboard-recent-open" onClick={() => onOpenNote(note.id)} aria-label={`Mở ghi chú ${note.title || 'Chưa có tiêu đề'}`}>
                <span className="tanooki-dashboard-recent-icon"><FileText size={21} /></span>
                <span className="min-w-0 flex-1"><span className="tanooki-dashboard-note-title">{note.title.trim() || 'Chưa có tiêu đề'}</span><span className="tanooki-dashboard-preview">{getPreview(note.content, 90) || 'Chưa có nội dung'}</span></span>
              </button>
              <div className="hidden min-w-0 xl:block"><NoteTags note={note} tags={tags} onOpenTag={openTag} /></div>
              <span className="hidden whitespace-nowrap text-xs text-tertiary md:block">{recentOpenedAt[note.id] > note.updatedAt ? 'Đã mở' : 'Đã sửa'} {formatTime(getEffectiveRecentTime(note, recentOpenedAt))}</span>
              {note.pinned && <Pin size={15} aria-label="Đã ghim" className="hidden shrink-0 text-accent sm:block" />}
            </div>)}
          </div> : <p className="tanooki-dashboard-empty">Chưa có ghi chú gần đây.</p>}
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="tanooki-dashboard-panel" aria-labelledby="dashboard-folders-heading">
          <div className="tanooki-dashboard-section-heading"><h2 id="dashboard-folders-heading"><FolderIcon size={19} aria-hidden="true" /> Thư mục</h2></div>
          {folders.length ? <div className="grid grid-cols-2 gap-2.5">
            {folders.map((folder, index) => <button key={folder.id} type="button" onClick={() => onViewChange({ kind: 'folder', id: folder.id })} onContextMenu={(event) => openContextMenu(event, 'folder', folder.id)} className={`tanooki-dashboard-folder${contextMenu?.kind === 'folder' && contextMenu.id === folder.id ? ' is-context-open' : ''}`}>
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
    </div>}
    {contextMenu?.kind === 'note' && (() => {
      const note = notes.find((candidate) => candidate.id === contextMenu.id && !candidate.trashed);
      if (!note) return null;
      return <DesktopContextMenu point={contextMenu.point} onClose={closeContextMenu} label={`Thao tác ghi chú ${note.title || 'Chưa có tiêu đề'}`}>
        <button type="button" role="menuitem" onClick={() => { closeContextMenu(); onTogglePin(note.id); }}>{note.pinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}{note.pinned ? 'Bỏ ghim' : 'Ghim'}</button>
        <button type="button" role="menuitem" onClick={() => { closeContextMenu(); void shareNote(note); }}><Share2 size={15} aria-hidden="true" />Chia sẻ</button>
        <button type="button" role="menuitem" onClick={() => setContextMoveOpen((open) => !open)}><FolderIcon size={15} aria-hidden="true" />Di chuyển<ChevronRight className="ml-auto" size={14} aria-hidden="true" /></button>
        {contextMoveOpen && <div className="tanooki-desktop-context-folder-options"><DesktopFolderMoveOptions folders={folders} onSelect={(folderId) => { closeContextMenu(); onMove(note.id, folderId); }} /></div>}
        <button type="button" role="menuitem" onClick={() => { closeContextMenu(); onArchive(note.id, !note.archived); }}>{note.archived ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}{note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}</button>
        <button type="button" role="menuitem" onClick={() => { closeContextMenu(); onDuplicate(note.id); }}><Copy size={15} aria-hidden="true" />Tạo bản sao</button>
        <div className="tanooki-desktop-context-separator" />
        <button type="button" role="menuitem" className="is-danger" onClick={() => { closeContextMenu(); onTrash(note.id); }}><Trash2 size={15} aria-hidden="true" />Chuyển vào thùng rác</button>
      </DesktopContextMenu>;
    })()}
    {contextMenu?.kind === 'folder' && (() => {
      const folder = folders.find((candidate) => candidate.id === contextMenu.id);
      if (!folder) return null;
      return <DesktopContextMenu point={contextMenu.point} onClose={closeContextMenu} label={`Thao tác thư mục ${folder.name}`}>
        <button type="button" role="menuitem" onClick={() => { closeContextMenu(); const name = window.prompt('Đổi tên thư mục', folder.name); if (name?.trim()) onRenameFolder(folder.id, name.trim()); }}>Đổi tên</button>
        <button type="button" role="menuitem" className="is-danger" onClick={() => { closeContextMenu(); if (window.confirm(`Xóa thư mục “${folder.name}”? Ghi chú trực tiếp sẽ được chuyển về Tất cả ghi chú; thư mục con sẽ được chuyển lên cấp cha.`)) onDeleteFolder(folder.id); }}><Trash2 size={15} aria-hidden="true" />Xóa thư mục</button>
      </DesktopContextMenu>;
    })()}
  </div>;
}
