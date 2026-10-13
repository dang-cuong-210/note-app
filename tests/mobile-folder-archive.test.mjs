import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMobileChildFolders, getMobileFolderSummary } from '../src/lib/mobileFolderArchive.js';

const folders = [
  { id: 'root', name: 'Worldbuilding', parentId: null },
  { id: 'child-a', name: 'Project A', parentId: 'root' },
  { id: 'child-b', name: 'Art Project', parentId: 'root' },
  { id: 'unrelated', name: 'Japanese', parentId: null },
];

test('mobile folder workspace lists and searches only direct child folders', () => {
  assert.deepEqual(getMobileChildFolders(folders, 'root').map(({ id }) => id), ['child-a', 'child-b']);
  assert.deepEqual(getMobileChildFolders(folders, 'root', 'ART').map(({ id }) => id), ['child-b']);
});

test('mobile folder footer summarizes note and child-folder counts without invented metadata', () => {
  assert.equal(getMobileFolderSummary(12, 4), '12 ghi chú · 4 thư mục');
  assert.equal(getMobileFolderSummary(12, 0), '12 ghi chú');
  assert.equal(getMobileFolderSummary(0, 4), 'Không có ghi chú · 4 thư mục');
  assert.equal(getMobileFolderSummary(0, 0), 'Không có ghi chú');
});

test('mobile Folder and Archive use current view filtering and existing note open/action callbacks', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(list, /getNotesInView\(notes, view\)/);
  assert.match(list, /placeholder="Tìm kiếm ghi chú, thư mục\.\.\."/);
  assert.match(list, /onOpen=\{\(\) => onSelectNote\(note\.id\)\}/);
  assert.match(list, /label=\{note\.archived \? 'Bỏ lưu trữ' : 'Lưu trữ'\}/);
  assert.match(list, /onOpenFolder\?\.\(folder\.id\)/);
  assert.match(app, /mobileWorkspaceMode/);
  assert.match(app, /onBackToHome=\{openMobileHome\}/);
  assert.match(app, /onAddFolder=\{data\.addFolder\}/);
  assert.match(app, /const note = data\.addNote\(view\.id\)/);
  assert.match(app, /!showMobileWorkspace/);
});

test('folder actions reuse existing rename, nested add, delete and archive-note handlers', async () => {
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  assert.match(list, /onRenameFolder\?\.\(currentFolder\.id, folderActionName\.trim\(\)\)/);
  assert.match(list, /onAddFolder\?\.\(folderActionName\.trim\(\), currentFolder\.id\)/);
  assert.match(list, /onDeleteFolder\?\.\(currentFolder\.id\)/);
  assert.match(list, /MobileNoteActionsSheet/);
  assert.match(list, /setWorkspaceOptionsOpen\(false\); setMobileControlsOpen\(true\)/);
});

test('mobile Folder and Archive layout has safe-area footer, scroll region and truncated folder labels', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.tanooki-mobile-workspace \{[^}]*100dvh[^}]*safe-area-inset-top/);
  assert.match(css, /\.tanooki-mobile-workspace-scroll \{[^}]*overflow-y: auto/);
  assert.match(css, /\.tanooki-mobile-workspace-folder-row > strong \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.tanooki-mobile-all-notes-footer \{[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.tanooki-mobile-workspace \{ display: none; \}/);
});
