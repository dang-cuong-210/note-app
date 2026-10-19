import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const noteList = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const retention = await readFile(new URL('../src/lib/trashRetention.js', import.meta.url), 'utf8');

test('mobile Recently Deleted uses a dedicated responsive screen and returns to Home', () => {
  assert.match(app, /mobileTrashMode=\{!isDesktop && view\.kind === 'trash'\}/);
  assert.match(app, /const showEditor = view\.kind !== 'settings' && view\.kind !== 'trash'/);
  assert.match(app, /onBackToHome=\{openMobileHome\}/);
  assert.match(app, /mobileDestination !== 'all' && view\.kind !== 'trash'/);
  assert.match(noteList, /mobileTrashMode && <header className="tanooki-mobile-trash-header"/);
  assert.match(noteList, /onClick=\{onBackToHome\} aria-label="Quay lại Thư mục"/);
  assert.match(noteList, /<h1>Đã xóa gần đây<\/h1>/);
  assert.match(noteList, /placeholder="Tìm kiếm ghi chú\.\.\."/);
  assert.match(noteList, /Các ghi chú đã xóa sẽ được lưu trong 7 ngày/);
});

test('mobile trash screen retains the seven-day retention policy and scopes search to current trash view', () => {
  assert.match(retention, /TRASH_RETENTION_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(noteList, /const viewNotes = useMemo\(\(\) => getNotesInView\(notes, view\)/);
  assert.match(noteList, /filterSearchRecords\(searchRecords, \{[\s\S]*?query: searchQuery/);
  assert.match(noteList, /mobileTrashMode \? 'tanooki-mobile-trash-scroll'/);
});

test('mobile trash rows keep title, deletion timestamp, preview, More actions and safe fallbacks', () => {
  assert.match(noteList, /mobileTrashMode \? <div className="tanooki-mobile-trash-card"/);
  assert.match(noteList, /note\.title\.trim\(\) \|\| 'Chưa có tiêu đề'/);
  assert.match(noteList, /noteTime\(note\.trashedAt \|\| note\.updatedAt\)/);
  assert.match(noteList, /record\?\.bodyText \? record\.bodyText\.slice\(0, 120\) : 'Chưa có nội dung'/);
  assert.match(noteList, /const fn = folderName\(note\.folderId\)/);
  assert.match(noteList, /tanooki-mobile-trash-folder/);
  assert.match(noteList, /className="tanooki-mobile-trash-more"/);
  assert.match(noteList, /MobileTrashActionsSheet note=\{menuNote\}/);
  assert.match(noteList, /onRestore=\{onRestore\}/);
  assert.match(noteList, /onPermanentDelete=\{\(\) => \{ void handleDelete\(menuNote\); \}\}/);
  assert.match(noteList, /confirmPermanentTrashDelete\(currentNote, \{[\s\S]*?isMobile: mobileTrashMode/);
});

test('mobile Trash normal rows are non-interactive and cannot change note selection', () => {
  const trashRows = noteList.match(/mobileTrashMode \? <div className="tanooki-mobile-trash-card">([\s\S]*?)<\/div> : mobileWorkspaceMode/)[1];
  assert.match(trashRows, /trashSelectionMode\s*\? <button[^>]*className="tanooki-mobile-trash-row-main" onClick=\{\(\) => toggleTrashSelection\(note\.id\)\}>\{rowContent\}<\/button>\s*: <div className="tanooki-mobile-trash-row-main">\{rowContent\}<\/div>/);
  assert.doesNotMatch(trashRows, /onSelectNote\(note\.id\)/);
  assert.match(trashRows, /className="tanooki-mobile-trash-more"[^>]*onClick=\{\(\) => \{ setMenuFor\(note\.id\)/);
});

test('mobile Trash edit mode toggles row selection and exposes selected state', () => {
  const trashRows = noteList.match(/mobileTrashMode \? <div className="tanooki-mobile-trash-card">([\s\S]*?)<\/div> : mobileWorkspaceMode/)[1];
  assert.match(noteList, /setTrashSelectionMode\(\(current\) => !current\); setSelectedTrashIds\(\[\]\)/);
  assert.match(trashRows, /const selected = selectedTrashIds\.includes\(note\.id\)/);
  assert.match(trashRows, /tanooki-mobile-trash-row\$\{selected \? ' is-selected' : ''\}/);
  assert.match(trashRows, /className="tanooki-mobile-trash-check"[^>]*aria-pressed=\{selected\}[^>]*onClick=\{\(\) => toggleTrashSelection\(note\.id\)\}/);
  assert.match(trashRows, /onClick=\{\(\) => toggleTrashSelection\(note\.id\)\}/);
  assert.match(noteList, /if \(!mobileTrashMode\) \{\s*setTrashSelectionMode\(false\);\s*setSelectedTrashIds\(\[\]\);/);
});

test('mobile Trash selection control has a 44px target while preserving its visual indicator', () => {
  assert.match(css, /\.tanooki-mobile-trash-check \{[^}]*width: 44px; min-width: 44px/);
  assert.match(css, /\.tanooki-mobile-trash-check > span \{[^}]*width: 21px; height: 21px/);
});

test('desktop Trash row selection, restore and permanent-delete behavior remain unchanged', () => {
  assert.match(noteList, /<button\s+onClick=\{\(\) => onSelectNote\(note\.id\)\}[\s\S]*?className=\{`tanooki-desktop-note-row/);
  assert.match(noteList, /<MenuItem icon=\{<RotateCcw size=\{15\} \/>\} label="Khôi phục" onClick=\{\(\) => \{ onRestore\(note\.id\); setMenuFor\(null\); \}\} \/>/);
  assert.match(noteList, /label="Xóa vĩnh viễn" danger onClick=\{\(\) => \{ handleDelete\(note\); setMenuFor\(null\); \}\}/);
  assert.match(noteList, /confirmPermanentTrashDelete\(currentNote, \{[\s\S]*?permanentDelete: onPermanentDelete/);
});

test('mobile trash edit mode supports multi-select, restore and confirmed permanent deletion', () => {
  assert.match(noteList, /setTrashSelectionMode\(\(current\) => !current\)/);
  assert.match(noteList, /selectedTrashIds\.forEach\(onRestore\)/);
  assert.match(noteList, /Xóa vĩnh viễn \$\{selected\.length\} ghi chú đã chọn/);
  assert.match(noteList, /for \(const note of selected\)[\s\S]*?await onPermanentDelete\(note\.id\)/);
  assert.match(noteList, /selectedTrashIds\.includes\(note\.id\)/);
});

test('mobile trash layout handles safe areas, scrolling, truncation and hides the legacy bottom tabs', () => {
  assert.match(css, /\.tanooki-mobile-trash \{[^}]*height: 100dvh[^}]*safe-area-inset-top/);
  assert.match(css, /\.tanooki-mobile-trash-scroll \{[^}]*overflow-y: auto/);
  assert.match(css, /\.tanooki-mobile-trash-footer \{[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.tanooki-mobile-trash-row-main > strong \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.tanooki-mobile-trash-preview \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.tanooki-mobile-trash \{ display: none; \}/);
});

test('mobile trash empty state is concise and does not create a placeholder card', () => {
  assert.match(noteList, /mobileTrashMode \? <div className="tanooki-mobile-trash-empty">Không có ghi chú đã xóa<\/div>/);
  assert.match(noteList, /<footer className="tanooki-mobile-trash-footer"><span>\{sorted\.length\} ghi chú<\/span><\/footer>/);
});
