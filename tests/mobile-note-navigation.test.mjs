import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  captureMobileNoteOrigin,
  getMobileNoteOriginLabel,
  noteBelongsToMobileOrigin,
  resolveMobileNoteOrigin,
} from '../src/lib/mobileNavigation.js';

const note = (id, flags = {}) => ({
  id,
  title: flags.title ?? id,
  content: flags.content ?? '',
  folderId: flags.folderId ?? null,
  pinned: flags.pinned ?? false,
  archived: flags.archived ?? false,
  trashed: flags.trashed ?? false,
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

test('deleted folder falls back to Home, while a note leaving a valid origin returns there', () => {
  assert.deepEqual(restore(origin({ kind: 'folder', id: 'deleted' })), origin({ kind: 'home' }, { mobileDestination: 'home' }));
  const archivedOrigin = origin({ kind: 'archived' }, { openedNoteId: 'a' });
  assert.deepEqual(restore(archivedOrigin, [note('a')]), origin({ kind: 'archived' }));
  const tagOrigin = origin({ kind: 'tag', name: 'work' }, { openedNoteId: 'a' });
  assert.deepEqual(restore(tagOrigin, [note('a')]), origin({ kind: 'tag', name: 'work' }));
});

test('mobile editor reconciliation closes only when an action removes the note from its origin', () => {
  const active = note('a');
  const pinned = origin({ kind: 'pinned' }, { mobileDestination: 'search' });
  const archived = origin({ kind: 'archived' });
  const folder = origin({ kind: 'folder', id: 'folder-a' });
  const tag = origin({ kind: 'tag', name: 'work' });

  assert.equal(noteBelongsToMobileOrigin(note('a', { pinned: true }), pinned), true);
  assert.equal(noteBelongsToMobileOrigin(active, pinned), false, 'unpin from Pinned returns to Pinned list');
  assert.equal(noteBelongsToMobileOrigin(note('a', { archived: true }), archived), true);
  assert.equal(noteBelongsToMobileOrigin(active, archived), false, 'unarchive from Archive returns to Archive list');
  assert.equal(noteBelongsToMobileOrigin(note('a', { folderId: 'folder-a' }), folder), true);
  assert.equal(noteBelongsToMobileOrigin(note('a', { folderId: 'folder-b' }), folder), false, 'moving out of a folder closes editor');
  assert.equal(noteBelongsToMobileOrigin(note('a', { content: '<p>#work</p>' }), tag), true);
  assert.equal(noteBelongsToMobileOrigin(active, tag), false, 'removing the final tag closes editor');
  assert.equal(noteBelongsToMobileOrigin(note('a', { trashed: true }), origin({ kind: 'all' })), false);
});

test('membership-preserving actions keep the editor open in All Notes, Recent, and matching Search', () => {
  assert.equal(noteBelongsToMobileOrigin(note('a'), origin({ kind: 'all' }, { mobileDestination: 'all' })), true);
  assert.equal(noteBelongsToMobileOrigin(note('a'), origin({ kind: 'recent' })), true, 'moving a recent note keeps it in Recent');
  const search = origin({ kind: 'all' }, { mobileDestination: 'search', searchQuery: 'idea' });
  assert.equal(noteBelongsToMobileOrigin(note('a', { title: 'New idea' }), search), true);
  assert.equal(noteBelongsToMobileOrigin(note('a', { title: 'Other' }), search), false);
});

test('duplicating from each mobile origin keeps Back context and updates the opened note id', () => {
  const cases = [
    [origin({ kind: 'home' }, { mobileDestination: 'home' }), [note('copy')], []],
    [origin({ kind: 'all' }, { mobileDestination: 'search', searchQuery: 'needle' }), [note('copy')], []],
    [origin({ kind: 'recent' }), [note('copy')], []],
    [origin({ kind: 'tag', name: 'work' }), [note('copy')], []],
    [origin({ kind: 'pinned' }), [note('copy')], []],
    [origin({ kind: 'archived' }), [note('copy')], []],
    [origin({ kind: 'all' }, { mobileDestination: 'all' }), [note('copy')], []],
    [origin({ kind: 'folder', id: 'folder-a' }), [note('copy', { folderId: 'folder-a' })], [{ id: 'folder-a', name: 'A' }]],
  ];
  for (const [saved, notes, folders] of cases) {
    const duplicate = captureMobileNoteOrigin(saved, null, false, 'copy');
    assert.deepEqual(restore(duplicate, notes, folders), saved);
    assert.equal(duplicate.openedNoteId, 'copy');
  }
});

test('Recent keeps its existing return snapshot and mobile Back restores note origin', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /setRecentReturn\(\{ view, selectedNoteId, mobileDestination, searchQuery, mobileNoteReturn \}\)/);
  assert.match(app, /setMobileNoteReturn\(recentReturn\.mobileNoteReturn \?\? null\)/);
  assert.match(app, /resolveMobileNoteOrigin\(\{ origin: mobileNoteReturn, notes: data\.notes, folders: data\.folders \}\)/);
});

test('App reconciles mobile actions generically and duplicate updates the return target', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(isDesktop \|\| mobileNoteReturn\?\.openedNoteId !== selectedNoteId\) return;/);
  assert.match(app, /const belongsToOrigin = noteBelongsToMobileOrigin\(currentNote, mobileNoteReturn\);/);
  assert.match(app, /if \(!previousMembership\.belongs \|\| belongsToOrigin\) return;/);
  assert.match(app, /setMobileNoteReturn\(\{ \.\.\.duplicateOrigin, openedNoteId: copy\.id \}\)/);
  assert.match(app, /if \(!isDesktop\) \{\s*const destination = resolveMobileNoteOrigin\(\{ origin: mobileNoteReturn, notes: data\.notes, folders: data\.folders \}\);/);
  assert.match(app, /onTogglePin=\{data\.togglePin\}/);
  assert.match(app, /onArchive=\{data\.archiveNote\}/);
  assert.match(app, /onMove=\{data\.moveNote\}/);
});

test('desktop editor Back remains the existing selection clear behavior', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(isDesktop\) \{\s*setMobileNewNoteId\(null\);\s*setSelectedNoteId\(null\);\s*return;/);
  assert.match(app, /setMobileNoteReturn\(\(current\) => captureMobileNoteOrigin\(\{ view, selectedNoteId, mobileDestination, searchQuery \}, current, false, id\)\)/);
  assert.match(app, /setMobileNoteReturn\(\(current\) => captureMobileNoteOrigin\([\s\S]*?current,[\s\S]*?editorVisible,/);
  assert.match(app, /setMobileDestination\('home'\);\s*setSelectedNoteId\(destination\.selectedNoteId\);/);
});
