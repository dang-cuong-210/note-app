import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getDirectFolderNoteCount } from '../src/lib/dashboardData.js';
import { getFolderAncestorIds, getFolderDisplayPath, getFolderHierarchy, getFolderOptionLabel, getVisibleFolderHierarchy, removeFolderAndPromoteChildren } from '../src/lib/folderHierarchy.js';
import { getMobileHomeFolderCount } from '../src/lib/mobileHome.js';

const folders = [
  { id: 'root-work', name: 'Công việc', parentId: null },
  { id: 'personal', name: 'Cá nhân', parentId: null },
  { id: 'project-a', name: 'Dự án A', parentId: 'root-work' },
  { id: 'project-b', name: 'Dự án B', parentId: 'root-work' },
  { id: 'diary', name: 'Nhật ký', parentId: 'personal' },
  { id: 'deep', name: 'Ghi chú con', parentId: 'diary' },
];

test('folder hierarchy renders roots before children and retains each depth and display path', () => {
  const hierarchy = getFolderHierarchy(folders);
  assert.deepEqual(hierarchy.map(({ folder, depth }) => [folder.id, depth]), [
    ['root-work', 0], ['project-a', 1], ['project-b', 1], ['personal', 0], ['diary', 1], ['deep', 2],
  ]);
  assert.equal(getFolderOptionLabel(folders[2], 1), '\u00a0\u00a0└ Dự án A');
  assert.equal(getFolderDisplayPath(folders, 'deep'), 'Cá nhân › Nhật ký › Ghi chú con');
  assert.deepEqual(getFolderAncestorIds(folders, 'deep'), ['personal', 'diary']);
});

test('expandable tree hides collapsed descendants and expands nested levels independently', () => {
  assert.deepEqual(getVisibleFolderHierarchy(folders, new Set()).map(({ folder }) => folder.id), ['root-work', 'personal']);
  assert.deepEqual(getVisibleFolderHierarchy(folders, new Set(['root-work'])).map(({ folder }) => folder.id), ['root-work', 'project-a', 'project-b', 'personal']);
  assert.deepEqual(getVisibleFolderHierarchy(folders, new Set(['personal', 'diary'])).map(({ folder }) => folder.id), ['root-work', 'personal', 'diary', 'deep']);
  const ancestorsOfDeepSelection = getFolderAncestorIds(folders, 'deep');
  assert.deepEqual(getVisibleFolderHierarchy(folders, new Set(ancestorsOfDeepSelection)).map(({ folder }) => folder.id), ['root-work', 'personal', 'diary', 'deep']);
});

test('desktop disclosure only toggles expansion while folder rows select the folder', async () => {
  const desktop = await readFile(new URL('../src/components/DesktopSidebar.tsx', import.meta.url), 'utf8');
  assert.match(desktop, /aria-expanded=\{expanded\} onClick=\{\(\) => setExpandedFolderIds\(/);
  assert.match(desktop, /onClick=\{\(\) => onViewChange\(\{ kind: 'folder', id: folder\.id \}\)\}/);
});

test('deleting a parent promotes its children without deleting them or their descendants', () => {
  const deletedRoot = removeFolderAndPromoteChildren(folders, 'root-work');
  assert.deepEqual(deletedRoot.reparented.map(({ id, parentId }) => [id, parentId]), [['project-a', null], ['project-b', null]]);
  assert.deepEqual(deletedRoot.folders.map(({ id }) => id), ['personal', 'project-a', 'project-b', 'diary', 'deep']);
  const deletedNested = removeFolderAndPromoteChildren(folders, 'diary');
  assert.deepEqual(deletedNested.reparented.map(({ id, parentId }) => [id, parentId]), [['deep', 'personal']]);
});

test('folder counts mean active notes directly in the selected folder on mobile and desktop', () => {
  const notes = [
    { id: 'direct', folderId: 'root-work', trashed: false, archived: false },
    { id: 'archived', folderId: 'root-work', trashed: false, archived: true },
    { id: 'trash', folderId: 'root-work', trashed: true, archived: false },
    { id: 'child', folderId: 'project-a', trashed: false, archived: false },
  ];
  assert.equal(getDirectFolderNoteCount(notes, 'root-work'), 1);
  assert.equal(getMobileHomeFolderCount(notes, 'root-work'), 1);
  assert.equal(getDirectFolderNoteCount(notes, 'project-a'), 1);
  assert.equal(getMobileHomeFolderCount(notes, 'project-a'), 1);
});

test('desktop and mobile folder screens use the same hierarchy and open existing folder IDs', async () => {
  const [desktop, home, noteList, app] = await Promise.all([
    readFile(new URL('../src/components/DesktopSidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(desktop, /getVisibleFolderHierarchy\(folders, expandedFolderIds\)/);
  assert.match(desktop, /isActive\(\{ kind: 'folder', id: folder\.id \}\)/);
  assert.match(desktop, /onAddFolder\(folderName\.trim\(\), folderCreateParentId\)/);
  assert.match(home, /folderHierarchy\.filter\(\(\{ depth \}\) => depth === 0\)/);
  assert.match(noteList, /currentFolderBreadcrumb/);
  assert.match(noteList, /getMobileChildFolders\(folders, currentFolder\.id, searchQuery\)/);
  assert.match(noteList, /onAddFolder\?\.\(folderActionName\.trim\(\), currentFolder\.id\)/);
  assert.match(app, /handleBackFromMobileFolder/);
  assert.match(app, /setView\(\{ kind: 'folder', id: parentId \}\)/);
});

test('root and child create, rename, delete, and note moves reuse the same current operations', async () => {
  const [desktop, noteList, editor, sheets, tools, hook] = await Promise.all([
    readFile(new URL('../src/components/DesktopSidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/MobileEditorSheets.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DesktopEditorToolsPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useAppData.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(desktop, /beginCreateFolder\(null\)/);
  assert.match(desktop, /beginCreateFolder\(folder\.id\)/);
  assert.match(desktop, /beginRename\(folder\)/);
  assert.match(noteList, /onRenameFolder\?\.\(currentFolder\.id, folderActionName\.trim\(\)\)/);
  assert.match(noteList, /onDeleteFolder\?\.\(currentFolder\.id\)/);
  for (const component of [noteList, editor, sheets, tools]) assert.match(component, /getFolderHierarchy\(folders\)/);
  assert.match(hook, /removeFolderAndPromoteChildren\(folders, id\)/);
  assert.match(hook, /n\.folderId !== id/);
  assert.match(hook, /folderId: null/);
});

test('unavailable mobile folder share action is removed', async () => {
  const noteList = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(noteList, /Chia sẻ thư mục chưa khả dụng/);
});
