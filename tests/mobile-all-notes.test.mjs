import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatMobileAllNoteDate, groupMobileAllNotes } from '../src/lib/mobileAllNotes.js';
import { getMobileDestinationAfterView } from '../src/lib/mobileNavigation.js';
import { readMobileAllNotesGallery, writeMobileAllNotesGallery, MOBILE_ALL_NOTES_GALLERY_KEY } from '../src/lib/mobileAllNotesView.js';

const localDate = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();
const note = (id, updatedAt, fields = {}) => ({
  id, title: id, content: '', folderId: null, pinned: false, archived: false,
  trashed: false, trashedAt: null, createdAt: updatedAt, updatedAt, ...fields,
});

test('mobile All Notes groups newest notes into today, recent week, then chronological months', () => {
  const now = new Date(2026, 9, 13, 15);
  const groups = groupMobileAllNotes([
    note('oct-old', localDate(2026, 10, 1)),
    note('today', localDate(2026, 10, 13, 9)),
    note('week', localDate(2026, 10, 10)),
    note('week-boundary', localDate(2026, 10, 6)),
    note('sep', localDate(2026, 9, 20)),
    note('nov-previous-year', localDate(2025, 11, 2)),
  ], now);
  assert.deepEqual(groups.map(({ label }) => label), ['Hôm nay', '7 ngày trước', 'Tháng 10', 'Tháng 9', 'Tháng 11, 2025']);
  assert.deepEqual(groups.flatMap(({ notes: groupNotes }) => groupNotes.map(({ id }) => id)), ['today', 'week', 'week-boundary', 'oct-old', 'sep', 'nov-previous-year']);
  assert.equal(groups.reduce((count, group) => count + group.notes.length, 0), 6);
});

test('All Notes date metadata uses Vietnamese time, weekday and date formats', () => {
  const now = new Date(2026, 9, 13, 15);
  assert.equal(formatMobileAllNoteDate(localDate(2026, 10, 13, 9), now), '09:00');
  assert.equal(formatMobileAllNoteDate(localDate(2026, 10, 10), now), 'Thứ Bảy');
  assert.equal(formatMobileAllNoteDate(localDate(2026, 10, 6), now), 'Thứ Ba');
  assert.equal(formatMobileAllNoteDate(localDate(2026, 9, 20), now), '20/9');
});

test('All Notes entry has its own mobile destination while the Search tab remains separate', () => {
  assert.equal(getMobileDestinationAfterView({ kind: 'all' }), 'all');
  assert.equal(getMobileDestinationAfterView({ kind: 'recent' }), 'search');
});

test('All Notes uses existing note opening, folder names, filtered results and a count/create utility bar', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(list, /onOpen=\{\(\) => onSelectNote\(note\.id\)\}/);
  assert.match(list, /folderName=\{fn\}/);
  assert.match(list, /onClick=\{onBackToHome\}/);
  assert.match(list, /<span>\{sorted\.length\} ghi chú<\/span>/);
  assert.match(list, /aria-label="Tạo ghi chú mới"/);
  assert.match(app, /mobileAllNotesMode=\{!isDesktop && mobileDestination === 'all' && view\.kind === 'all'\}/);
  assert.match(app, /mobileDestination !== 'all'/);
});

test('mobile All Notes keeps search and opens a compact popover from the more button', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  assert.match(list, /data-global-search value=\{searchQuery\} onChange=\{\(event\) => onSearchChange\(event\.target\.value\)\}/);
  assert.match(list, /onClick=\{\(\) => setMobileAllNotesMenuOpen\(true\)\} aria-label="Tùy chọn ghi chú"/);
  assert.match(list, /role="menu" aria-label="Tùy chọn ghi chú"/);
  assert.match(list, /const closeOnEscape = \(event: KeyboardEvent\)/);
  assert.match(list, /aria-label="Đóng tùy chọn ghi chú" onClick=\{\(\) => \{ setMobileAllNotesMenuOpen\(false\); mobileAllNotesMoreRef\.current\?\.focus\(\); \}\}/);
  assert.match(list, /Bộ lọc &amp; sắp xếp/);
  assert.match(list, /setMobileControlsOpen\(true\); setMobileAllNotesMenuOpen\(false\)/);
  assert.match(list, /<MobileBottomSheet open=\{mobileControlsOpen\} title="Bộ lọc và sắp xếp"/);
});

test('mobile note cards use tap and long-press while the screen-level All Notes menu and desktop actions remain', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const longPress = await readFile(new URL('../src/components/useMobileLongPress.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(list, /tanooki-mobile-all-notes-(?:gallery-)?more|tanooki-mobile-trash-more/);
  assert.doesNotMatch(list, /onMore=\{\(\) => \{ setMenuFor\(note\.id\)/);
  assert.match(list, /onOpen=\{\(\) => onSelectNote\(note\.id\)\}/);
  assert.match(list, /data-mobile-context-kind=\{!selectionMode \? 'note' : undefined\}/);
  assert.match(list, /onClick=\{\(\) => setMobileAllNotesMenuOpen\(true\)\} aria-label="Tùy chọn ghi chú"/);
  for (const action of ['Xem dưới dạng bộ sưu tập', 'Chọn ghi chú', 'Xem tệp đính kèm', 'Bộ lọc &amp; sắp xếp']) assert.ok(list.includes(action), `missing screen-level action: ${action}`);
  assert.match(longPress, /onOpenRef\.current\(pending\.target\)/);
  assert.match(list, /\{!mobileMode && <div[\s\S]*?aria-label="Thao tác ghi chú"/);
});

test('All Notes Gallery/List preference persists locally and gallery uses a two-column layout', async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readMobileAllNotesGallery(storage), false);
  writeMobileAllNotesGallery(true, storage);
  assert.equal(values.get(MOBILE_ALL_NOTES_GALLERY_KEY), 'true');
  assert.equal(readMobileAllNotesGallery(storage), true);
  writeMobileAllNotesGallery(false, storage);
  assert.equal(readMobileAllNotesGallery(storage), false);
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(list, /mobileAllNotesGallery \? 'Xem dưới dạng danh sách' : 'Xem dưới dạng bộ sưu tập'/);
  assert.match(list, /function MobileAllNoteGalleryCard/);
  assert.match(css, /\.tanooki-mobile-all-notes-card\.is-gallery \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('All Notes selection mode selects only visible notes and offers supported bulk actions', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  assert.match(list, /setMobileAllNotesSelectionMode\(true\); setSelectedAllNoteIds\(\[\]\)/);
  assert.match(list, /const selectedAllNotes = sorted\.filter\(\(note\) => selectedAllNoteIds\.includes\(note\.id\)\)/);
  assert.match(list, /onOpen=\{\(\) => mobileAllNotesSelectionMode \? toggleAllNoteSelection\(note\.id\) : onSelectNote\(note\.id\)\}/);
  assert.match(list, /archiveSelectedAllNotes/);
  assert.match(list, /trashSelectedAllNotes/);
  assert.match(list, /moveSelectedAllNotes/);
  assert.match(list, /const leaveAllNotesSelection = \(\) => \{ setMobileAllNotesSelectionMode\(false\); setSelectedAllNoteIds\(\[\]\); \}/);
});

test('All Notes attachment action opens a real scope-filtered browser with existing URL refresh support', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(list, /Xem tệp đính kèm/);
  assert.match(list, /attachments\.filter\(\(attachment\) => visibleNoteIdSet\.has\(attachment\.noteId\)\)/);
  assert.match(list, /refreshAttachmentUrl\(attachment\.storagePath\)/);
  assert.match(list, /mobileVisibleInlineImages/);
  assert.match(app, /attachments=\{data\.attachments\}/);
  assert.match(list, /Không có tệp đính kèm trong các ghi chú đang hiển thị/);
});

test('mobile All Notes layout uses safe-area padding, a scrollable grouped list and truncating rows', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.tanooki-mobile-all-notes \{[^}]*height: 100dvh/);
  assert.match(css, /\.tanooki-mobile-all-notes \{[^}]*safe-area-inset-top/);
  assert.match(css, /\.tanooki-mobile-all-notes-footer \{[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.tanooki-mobile-all-notes-scroll \{[^}]*overflow-y: auto/);
  assert.match(css, /\.tanooki-mobile-all-notes-folder > span \{[^}]*text-overflow: ellipsis/);
  assert.match(list, /mobileAllNoteGroups\.map\(\(group\) => <section[^>]*>[\s\S]*?<h2>\{group\.label\}<\/h2>/);
  assert.match(list, /useLayoutEffect\(\(\) => \{\s*if \(\(mobileAllNotesMode \|\| mobileRecentMode\) && notesScrollRef\.current\) notesScrollRef\.current\.scrollTop = 0;/);
  assert.match(list, /<div ref=\{notesScrollRef\} className=\{`flex-1 min-h-0 overflow-y-auto/);
});
