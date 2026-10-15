import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMobileHomeCounts, getMobileHomeFolderCount, getMatchingMobileHomeFolders } from '../src/lib/mobileHome.js';
import { getMobileFolderState, shouldShowMobileBottomNav } from '../src/lib/mobileNavigation.js';

const note = (id, fields = {}) => ({ id, title: id, content: '', folderId: null, archived: false, trashed: false, ...fields });
const folders = [
  { id: 'f1', name: 'Ghi chú cá nhân', parentId: null, createdAt: 1 },
  { id: 'f2', name: 'Japanese', parentId: null, createdAt: 2 },
];

test('new mobile Home renders the branded search and folder landing structure', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /<TanookiMark\s*\/>/);
  assert.match(home, /Tìm kiếm ghi chú, thư mục\.\.\./);
  assert.match(home, /Tất cả ghi chú/);
  assert.match(home, /id="tanooki-mobile-home-folders">Thư mục/);
  assert.match(home, /Lưu trữ/);
  assert.match(home, /Đã xóa gần đây/);
});

test('the old bottom navigation is hidden while the new mobile Home is open', () => {
  assert.equal(shouldShowMobileBottomNav(false, null, { kind: 'home' }), false);
  assert.equal(shouldShowMobileBottomNav(false, null, { kind: 'all' }), true);
});

test('returning to mobile Home clears the prior search query', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const openMobileHome = \(\) => \{[\s\S]*?setView\(\{ kind: 'home' \}\);\s*setSearchQuery\(''\);/);
});

test('All Notes count excludes archived and trashed notes, matching the existing active view', () => {
  const counts = getMobileHomeCounts([note('active'), note('archive', { archived: true }), note('trash', { trashed: true })]);
  assert.deepEqual(counts, { active: 1, archived: 1, trashed: 1 });
});

test('folder rows render from existing folder records without sorting or mutating them', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /folders\.map\(\(folder\) => <FolderRow/);
  assert.deepEqual(folders.map(({ id }) => id), ['f1', 'f2']);
});

test('folder note counts include direct active notes only', () => {
  const notes = [note('direct', { folderId: 'f1' }), note('other', { folderId: 'f2' }), note('archived', { folderId: 'f1', archived: true }), note('trashed', { folderId: 'f1', trashed: true })];
  assert.equal(getMobileHomeFolderCount(notes, 'f1'), 1);
});

test('All Notes card invokes the existing all-notes view callback', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /onClick=\{\(\) => onOpenView\(\{ kind: 'all' \}\)\}/);
});

test('tapping a folder keeps its id and opens the existing folder view', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.deepEqual(getMobileFolderState('f1'), { destination: 'search', view: { kind: 'folder', id: 'f1' }, selectedNoteId: null });
  assert.match(app, /onOpenFolder=\{\(id\) => \{ const destination = getMobileFolderState\(id\); setView\(destination\.view\);/);
});

test('Archive row opens the existing archived view', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /label="Lưu trữ"[\s\S]*?onOpenView\(\{ kind: 'archived' \}\)/);
});

test('Recently Deleted row opens the existing trash view', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /label="Đã xóa gần đây"[\s\S]*?onOpenView\(\{ kind: 'trash' \}\)/);
});

test('Add Folder opens the existing creation sheet and submits through addFolder', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(home, /onClick=\{\(\) => setCreateFolderOpen\(true\)\}/);
  assert.match(home, /<MobileCreateFolderSheet open=\{createFolderOpen\} onClose=\{\(\) => setCreateFolderOpen\(false\)\} onCreate=\{onAddFolder\}/);
  assert.match(app, /onAddFolder=\{data\.addFolder\}/);
});

test('Create New uses the existing immediate note-creation flow', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(home, /onClick=\{onCreateNote\}/);
  assert.match(app, /const createMobileNote = \(\) => \{\s*const note = registerNewDraft\(data\.addNote\(null\)\);/);
  assert.match(app, /onCreateNote=\{createMobileNote\}/);
});

test('desktop Dashboard remains on its existing separate rendering branch', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const showHome = view\.kind === 'home' && isDesktop/);
  assert.match(app, /\{showHome \? \([\s\S]*?<TanookiDashboard/);
  assert.match(app, /\) : showMobileHome \? \([\s\S]*?<MobileHome/);
});

test('the Home layout constrains widths and truncates long folder names on 390px screens', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.tanooki-mobile-home \{[^}]*width: 100%[^}]*min-width: 0/);
  assert.match(css, /\.tanooki-mobile-home-row \{[^}]*width: 100%[^}]*min-width: 0/);
  assert.match(css, /\.tanooki-mobile-home-row strong \{[^}]*overflow: hidden[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/);
});

test('360px layout keeps counts and chevrons flex-fixed and reduces row gaps', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.tanooki-mobile-home \{ padding-inline: 13px; \}/);
  assert.match(css, /\.tanooki-mobile-home-count \{ flex: none/);
  assert.match(css, /\.tanooki-mobile-home-row > svg:last-child \{ flex: none/);
});

test('Home search keeps the existing live note search and adds local folder-name matches', async () => {
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  const matches = getMatchingMobileHomeFolders(folders, ' GHI chú ');
  assert.deepEqual(matches.map(({ id }) => id), ['f1']);
  assert.match(home, /<LiveSearchResults notes=\{activeNotes\} query=\{searchQuery\}/);
  assert.match(home, /getMatchingMobileHomeFolders\(folders, searchQuery\)/);
});

test('search submit still routes to the existing note list, and the mobile Home does not mount its old tab bar', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const home = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  assert.match(app, /onSearchSubmit=\{handleSearchSubmit\}/);
  assert.match(app, /\{showMobileBottomNav && \(/);
  assert.doesNotMatch(home, /MobileBottomNav/);
});
