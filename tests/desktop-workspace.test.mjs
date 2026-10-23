import test from 'node:test';
import assert from 'node:assert/strict';
import { getDesktopNoteProperties, getDesktopViewLabel } from '../src/lib/desktopWorkspace.js';

test('desktop workspace labels known views in Vietnamese', () => {
  const folder = { id: 'f1', name: 'Công việc' };
  assert.equal(getDesktopViewLabel({ kind: 'home' }, []), 'Trang chủ');
  assert.equal(getDesktopViewLabel({ kind: 'all' }, []), 'Tất cả ghi chú');
  assert.equal(getDesktopViewLabel({ kind: 'recent' }, []), 'Gần đây');
  assert.equal(getDesktopViewLabel({ kind: 'pinned' }, []), 'Đã ghim');
  assert.equal(getDesktopViewLabel({ kind: 'archived' }, []), 'Lưu trữ');
  assert.equal(getDesktopViewLabel({ kind: 'trash' }, []), 'Thùng rác');
  assert.equal(getDesktopViewLabel({ kind: 'settings' }, []), 'Cài đặt');
  assert.equal(getDesktopViewLabel({ kind: 'folder', id: 'f1' }, [folder]), 'Công việc');
  assert.equal(getDesktopViewLabel({ kind: 'folder', id: 'missing' }, [folder]), 'Thư mục');
  assert.equal(getDesktopViewLabel({ kind: 'tag', name: 'ideas' }, []), '#ideas');
});

test('desktop note properties are derived from existing note, folder, attachment, and content data', () => {
  const note = { id: 'n1', createdAt: 10, updatedAt: 20, folderId: 'f1', pinned: true, archived: false };
  const folders = [{ id: 'f1', name: 'Công việc' }];
  const attachments = [{ id: 'a1' }, { id: 'a2' }];
  const properties = getDesktopNoteProperties(note, folders, attachments, 'Ghi chú thử nghiệm hôm nay', ['ideas', 'việc']);

  assert.deepEqual(properties, {
    createdAt: 10,
    updatedAt: 20,
    folderName: 'Công việc',
    tags: ['ideas', 'việc'],
    attachmentCount: 2,
    wordCount: 6,
    characterCount: 26,
    pinned: true,
    archived: false,
  });
});

test('desktop note properties support empty content and unfiled notes', () => {
  const properties = getDesktopNoteProperties(
    { id: 'n2', createdAt: 1, updatedAt: 2, folderId: null, pinned: false, archived: true },
    [], [], '', [],
  );

  assert.equal(properties.folderName, null);
  assert.equal(properties.attachmentCount, 0);
  assert.equal(properties.wordCount, 0);
  assert.equal(properties.characterCount, 0);
  assert.deepEqual(properties.tags, []);
});

test('desktop All Notes workspace exposes search, filters, sort, list/gallery, selection, and attachments', async () => {
  const { readFile } = await import('node:fs/promises');
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(list, /const desktopWorkspaceMode = desktopMode && \(view\.kind === 'all' \|\| view\.kind === 'folder'\)/);
  assert.match(list, /className="tanooki-desktop-workspace-header"/);
  assert.match(list, /placeholder="Tìm kiếm ghi chú\.\.\." aria-label="Tìm kiếm ghi chú" data-global-search/);
  assert.match(list, /className="tanooki-desktop-filter-popover"/);
  assert.match(list, /<SortSelect value=\{sortMode\} onChange=\{setSortMode\} \/>/);
  assert.match(list, /aria-label="Xem dạng danh sách" aria-pressed=\{!mobileAllNotesGallery\}/);
  assert.match(list, /aria-label="Xem dạng bộ sưu tập" aria-pressed=\{mobileAllNotesGallery\}/);
  assert.match(list, /aria-pressed=\{mobileAllNotesSelectionMode\}/);
  assert.match(list, /aria-pressed=\{desktopAttachmentsOpen\}/);
  assert.match(app, /attachments=\{data\.attachments\}/);
});

test('desktop Gallery and multi-select use the same filtered and sorted notes as List', async () => {
  const { readFile } = await import('node:fs/promises');
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');

  assert.match(list, /const sorted = useMemo\(\(\) =>/);
  assert.match(list, /const selectedAllNotes = sorted\.filter\(\(note\) => selectedAllNoteIds\.includes\(note\.id\)\)/);
  assert.match(list, /desktopWorkspaceMode && mobileAllNotesGallery \? <div className="tanooki-desktop-gallery">\s*\{sorted\.map/);
  assert.match(list, /function DesktopNoteGalleryCard/);
  assert.match(list, /mobileAllNotesSelectionMode \? toggleAllNoteSelection\(note\.id\) : onSelectNote\(note\.id\)/);
  assert.match(list, /const leaveAllNotesSelection = \(\) =>/);
  assert.match(list, /const archiveSelectedAllNotes = \(\) =>/);
  assert.match(list, /const trashSelectedAllNotes = \(\) =>/);
  assert.match(list, /const moveSelectedAllNotes = \(\) =>/);
  assert.match(list, /className="tanooki-desktop-bulk-toolbar"[\s\S]*?Di chuyển ghi chú[\s\S]*?Lưu trữ[\s\S]*?Thùng rác/);
  assert.match(list, /onClick=\{\(\) => mobileAllNotesSelectionMode && desktopWorkspaceMode \? toggleAllNoteSelection\(note\.id\) : onSelectNote\(note\.id\)\}/);
});

test('desktop attachment browser scopes metadata and inline images to visible notes and retains folder context', async () => {
  const { readFile } = await import('node:fs/promises');
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');

  assert.match(list, /attachments\.filter\(\(attachment\) => visibleNoteIdSet\.has\(attachment\.noteId\)\)/);
  assert.match(list, /new DOMParser\(\)\.parseFromString\(note\.content \|\| '', 'text\/html'\)/);
  assert.match(list, /<DesktopAttachmentBrowser[\s\S]*?entries=\{visibleWorkspaceAttachments\}/);
  assert.match(list, /function DesktopAttachmentBrowser/);
  assert.match(list, /Tất cả[\s\S]*Hình ảnh[\s\S]*Bản vẽ[\s\S]*Tệp/);
  assert.match(list, /refreshAttachmentUrl\(attachment\.storagePath\)/);
  assert.match(list, /onOpenNote=\{\(id\) => \{ setDesktopAttachmentsOpen\(false\); onSelectNote\(id\); \}\}/);
  assert.match(list, /currentFolderAncestorIds\.map/);
  assert.match(list, /desktopWorkspaceMode = desktopMode && \(view\.kind === 'all' \|\| view\.kind === 'folder'\)/);
});

test('desktop workspace presentation is isolated from mobile All Notes and nested folder rendering', async () => {
  const { readFile } = await import('node:fs/promises');
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(list, /mobileAllNotesMode && <header className="tanooki-mobile-all-notes-header"/);
  assert.match(list, /mobileAllNotesMode && mobileAllNotesMenuOpen/);
  assert.match(list, /desktopMode && currentFolder && <section className="tanooki-desktop-folder-children"/);
  assert.match(list, /className="tanooki-desktop-folder-breadcrumb"/);
  assert.match(css, /\.tanooki-desktop-gallery \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 170px\), 1fr\)\)/);
  assert.match(css, /\.tanooki-desktop-workspace-header/);
});
