import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  captureMobileNoteOrigin,
  getMobileNoteOriginLabel,
  resolveMobileNoteOrigin,
} from '../src/lib/mobileNavigation.js';

const note = (id, flags = {}) => ({
  id,
  title: id,
  content: flags.content ?? '',
  folderId: flags.folderId ?? null,
  pinned: flags.pinned ?? false,
  archived: flags.archived ?? false,
  trashed: false,
});
const origin = (view, updates = {}) => ({
  view,
  selectedNoteId: null,
  mobileDestination: 'search',
  searchQuery: '',
  ...updates,
});
const restore = (saved, notes = [], folders = []) => resolveMobileNoteOrigin({ origin: saved, notes, folders });

test('Home note returns to Home, retaining inline search query', () => {
  const home = origin({ kind: 'home' }, { mobileDestination: 'home', searchQuery: 'idea' });
  const opened = captureMobileNoteOrigin(home, null, false, 'note-a');
  assert.deepEqual(restore(opened, [note('note-a')]), home);
  assert.equal(getMobileNoteOriginLabel(opened), 'Trang chủ');
});

test('standalone Search and All Notes origins remain distinct', () => {
  const search = origin({ kind: 'all' }, { searchQuery: 'draft' });
  const all = origin({ kind: 'all' }, { mobileDestination: 'all' });
  assert.deepEqual(restore(captureMobileNoteOrigin(search), [note('a')]), search);
  assert.deepEqual(restore(captureMobileNoteOrigin(all), [note('a')]), all);
  assert.equal(getMobileNoteOriginLabel(search), 'Tìm kiếm');
  assert.equal(getMobileNoteOriginLabel(all), 'Tất cả ghi chú');
});

test('Folder and nested-folder origins return to the exact folder', () => {
  const folders = [{ id: 'parent', name: 'Cha' }, { id: 'child', name: 'Con', parentId: 'parent' }];
  const folderOrigin = origin({ kind: 'folder', id: 'child' });
  assert.deepEqual(restore(captureMobileNoteOrigin(folderOrigin), [note('a', { folderId: 'child' })], folders), folderOrigin);
  assert.equal(getMobileNoteOriginLabel(folderOrigin, folders), 'Con');
});

test('Recent, Tag, Pinned, and Archive origins are preserved', () => {
  const cases = [
    [origin({ kind: 'recent' }), [note('a')], 'Gần đây'],
    [origin({ kind: 'tag', name: 'work' }), [note('a', { content: '<p>#work</p>' })], '#work'],
    [origin({ kind: 'pinned' }), [note('a', { pinned: true })], 'Đã ghim'],
    [origin({ kind: 'archived' }), [note('a', { archived: true })], 'Lưu trữ'],
  ];
  for (const [saved, notes, label] of cases) {
    assert.deepEqual(restore(captureMobileNoteOrigin(saved, null, false, 'a'), notes), saved);
    assert.equal(getMobileNoteOriginLabel(saved), label);
  }
});

test('New Note preserves Home or Folder origin; editor New Note keeps the first origin', () => {
  const home = origin({ kind: 'home' }, { mobileDestination: 'home', searchQuery: 'same query' });
  const folder = origin({ kind: 'folder', id: 'folder-a' });
  assert.deepEqual(restore(captureMobileNoteOrigin(home), [note('new')]), home);
  assert.deepEqual(restore(captureMobileNoteOrigin(folder), [note('new', { folderId: 'folder-a' })], [{ id: 'folder-a' }]), folder);
  const firstOrigin = captureMobileNoteOrigin(folder);
  assert.deepEqual(captureMobileNoteOrigin(origin({ kind: 'all' }), firstOrigin, true), firstOrigin);
});

test('invalid folder or a filtered note that left its view falls back to Home', () => {
  assert.deepEqual(restore(origin({ kind: 'folder', id: 'deleted' })), origin({ kind: 'home' }, { mobileDestination: 'home' }));
  const archivedOrigin = origin({ kind: 'archived' }, { openedNoteId: 'a' });
  assert.deepEqual(restore(archivedOrigin, [note('a')]), origin({ kind: 'home' }, { mobileDestination: 'home' }));
  const tagOrigin = origin({ kind: 'tag', name: 'work' }, { openedNoteId: 'a' });
  assert.deepEqual(restore(tagOrigin, [note('a')]), origin({ kind: 'home' }, { mobileDestination: 'home' }));
});

test('Recent keeps its existing return snapshot and mobile Back restores note origin', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /setRecentReturn\(\{ view, selectedNoteId, mobileDestination, searchQuery, mobileNoteReturn \}\)/);
  assert.match(app, /setMobileNoteReturn\(recentReturn\.mobileNoteReturn \?\? null\)/);
  assert.match(app, /resolveMobileNoteOrigin\(\{ origin: mobileNoteReturn, notes: data\.notes, folders: data\.folders \}\)/);
});

test('desktop editor Back remains the existing selection clear behavior', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(isDesktop\) \{\s*setMobileNewNoteId\(null\);\s*setSelectedNoteId\(null\);\s*return;/);
  assert.match(app, /setMobileNoteReturn\(\(current\) => captureMobileNoteOrigin\(\{ view, selectedNoteId, mobileDestination, searchQuery \}, current, false, id\)\)/);
  assert.match(app, /setMobileNoteReturn\(\(current\) => captureMobileNoteOrigin\([\s\S]*?current,[\s\S]*?editorVisible,/);
  assert.match(app, /setMobileDestination\('home'\);\s*setSelectedNoteId\(destination\.selectedNoteId\);/);
});
