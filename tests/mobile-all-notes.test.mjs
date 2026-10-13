import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatMobileAllNoteDate, groupMobileAllNotes } from '../src/lib/mobileAllNotes.js';
import { getMobileDestinationAfterView } from '../src/lib/mobileNavigation.js';

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

test('mobile All Notes keeps its search input and opens the existing filter and sort sheet', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  assert.match(list, /data-global-search value=\{searchQuery\} onChange=\{\(event\) => onSearchChange\(event\.target\.value\)\}/);
  assert.match(list, /onClick=\{\(\) => setMobileControlsOpen\(true\)\} aria-label="Tùy chọn ghi chú"/);
  assert.match(list, /<MobileBottomSheet open=\{mobileControlsOpen\} title="Bộ lọc và sắp xếp"/);
});

test('mobile All Notes layout uses safe-area padding, a scrollable grouped list and truncating rows', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.tanooki-mobile-all-notes \{[^}]*height: 100dvh/);
  assert.match(css, /\.tanooki-mobile-all-notes \{[^}]*safe-area-inset-top/);
  assert.match(css, /\.tanooki-mobile-all-notes-footer \{[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.tanooki-mobile-all-notes-scroll \{[^}]*overflow-y: auto/);
  assert.match(css, /\.tanooki-mobile-all-notes-folder > span \{[^}]*text-overflow: ellipsis/);
});
