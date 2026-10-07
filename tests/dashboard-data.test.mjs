import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDashboardActiveNotes,
  getDashboardPinnedNotes,
  getDashboardQuickTags,
  getDashboardRecentNotes,
  getDashboardSearchDestination,
  getDashboardNoteDestination,
  getDirectFolderNoteCount,
  getInitialView,
  shouldAutoSelectNote,
} from '../src/lib/dashboardData.js';
import {
  getMobileDestinationAfterView,
  getMobileFolderState,
  getMobileNewNoteState,
  getMobileRecentState,
  getMobileSearchState,
  shouldShowMobileBottomNav,
} from '../src/lib/mobileNavigation.js';

const note = (id, updatedAt, flags = {}) => ({
  id, title: id, content: '', folderId: flags.folderId ?? null,
  pinned: flags.pinned ?? false, archived: flags.archived ?? false,
  trashed: flags.trashed ?? false, updatedAt,
});

test('mobile and desktop both initialize on Home', () => {
  assert.deepEqual(getInitialView(), { kind: 'home' });
  assert.deepEqual(getInitialView(true), { kind: 'home' });
  assert.deepEqual(getInitialView(false), { kind: 'home' });
});

test('Home never auto-selects a note; recent and content views retain selection behavior', () => {
  assert.equal(shouldAutoSelectNote({ kind: 'home' }), false);
  assert.equal(shouldAutoSelectNote({ kind: 'settings' }), false);
  assert.equal(shouldAutoSelectNote({ kind: 'trash' }), false);
  assert.equal(shouldAutoSelectNote({ kind: 'recent' }), true);
  assert.equal(shouldAutoSelectNote({ kind: 'all' }), true);
});

test('opening a dashboard note exits Home and selects that exact note', () => {
  assert.deepEqual(getDashboardNoteDestination('note-42'), { view: { kind: 'all' }, selectedNoteId: 'note-42' });
});

test('dashboard active set excludes archived and trashed notes without mutating input', () => {
  const notes = [note('old', 1), note('archived', 4, { archived: true }), note('trashed', 5, { trashed: true }), note('new', 9)];
  const active = getDashboardActiveNotes(notes);
  assert.deepEqual(active.map(({ id }) => id), ['new', 'old']);
  assert.equal(notes[0].id, 'old');
});

test('pinned dashboard notes are only active pinned notes, newest first, and limited', () => {
  const notes = [note('a', 5, { pinned: true }), note('b', 7, { pinned: true }), note('c', 8, { pinned: true, archived: true }), note('d', 9, { pinned: true, trashed: true }), note('e', 6, { pinned: true })];
  assert.deepEqual(getDashboardPinnedNotes(notes, 2).map(({ id }) => id), ['b', 'e']);
});

test('recent dashboard notes sort by updatedAt descending regardless of other fields', () => {
  const notes = [note('created-first', 3), note('newest', 12), note('middle', 7, { pinned: true }), note('archived', 15, { archived: true })];
  assert.deepEqual(getDashboardRecentNotes(notes).map(({ id }) => id), ['newest', 'middle', 'created-first']);
});

test('recent dashboard results honor the requested display limit', () => {
  assert.deepEqual(getDashboardRecentNotes([note('a', 1), note('b', 2), note('c', 3)], 2).map(({ id }) => id), ['c', 'b']);
});

test('folder counts include direct active notes only', () => {
  const notes = [note('one', 1, { folderId: 'f1' }), note('two', 2, { folderId: 'f1' }), note('archived', 3, { folderId: 'f1', archived: true }), note('trashed', 4, { folderId: 'f1', trashed: true }), note('other', 5, { folderId: 'f2' })];
  assert.equal(getDirectFolderNoteCount(notes, 'f1'), 2);
  assert.equal(getDirectFolderNoteCount(notes, 'f2'), 1);
});

test('quick tags sort by real count then name and cap their display set', () => {
  const tags = [{ name: 'zeta', count: 3 }, { name: 'beta', count: 3 }, { name: 'alpha', count: 7 }];
  assert.deepEqual(getDashboardQuickTags(tags, 2), [{ name: 'alpha', count: 7 }, { name: 'beta', count: 3 }]);
});

test('dashboard search submits to All Notes with the entered query', () => {
  assert.deepEqual(getDashboardSearchDestination('  garden  '), { view: { kind: 'all' }, query: 'garden' });
});

test('Home pinned cards are limited to four active pinned notes', () => {
  const notes = Array.from({ length: 7 }, (_, index) => note(`p${index}`, index + 1, { pinned: true }));
  assert.deepEqual(getDashboardPinnedNotes(notes).map(({ id }) => id), ['p6', 'p5', 'p4', 'p3']);
});

test('Home recent cards are limited to five and ordered newest first', () => {
  const notes = Array.from({ length: 8 }, (_, index) => note(`n${index}`, index + 1));
  assert.deepEqual(getDashboardRecentNotes(notes).map(({ id }) => id), ['n7', 'n6', 'n5', 'n4', 'n3']);
});

test('archived pinned notes never appear in the Home pinned section', () => {
  assert.deepEqual(getDashboardPinnedNotes([note('archived', 9, { pinned: true, archived: true })]), []);
});

test('trashed pinned notes never appear in the Home pinned section', () => {
  assert.deepEqual(getDashboardPinnedNotes([note('trashed', 9, { pinned: true, trashed: true })]), []);
});

test('un-pinned active notes do not appear in the Home pinned section', () => {
  assert.deepEqual(getDashboardPinnedNotes([note('regular', 9)]), []);
});

test('recent Home list includes pinned notes as active notes', () => {
  assert.deepEqual(getDashboardRecentNotes([note('pinned', 3, { pinned: true }), note('plain', 5)]).map(({ id }) => id), ['plain', 'pinned']);
});

test('recent Home list excludes both archived and trashed notes', () => {
  assert.deepEqual(getDashboardRecentNotes([note('ok', 1), note('archive', 3, { archived: true }), note('trash', 4, { trashed: true })]).map(({ id }) => id), ['ok']);
});

test('opening any Home note selects that note and routes to the existing all-notes view', () => {
  assert.deepEqual(getDashboardNoteDestination('selected-id'), { view: { kind: 'all' }, selectedNoteId: 'selected-id' });
});

test('Home has no automatic note selection', () => {
  assert.equal(shouldAutoSelectNote({ kind: 'home' }), false);
});

test('recent navigation remains eligible for the existing list selection behavior', () => {
  assert.equal(shouldAutoSelectNote({ kind: 'recent' }), true);
});

test('Home folder counts include active direct notes only', () => {
  const notes = [note('direct', 1, { folderId: 'folder' }), note('child-other', 2, { folderId: 'other' }), note('old', 3, { folderId: 'folder', archived: true }), note('deleted', 4, { folderId: 'folder', trashed: true })];
  assert.equal(getDirectFolderNoteCount(notes, 'folder'), 1);
});

test('folder counts do not include notes from another folder', () => {
  assert.equal(getDirectFolderNoteCount([note('elsewhere', 1, { folderId: 'other' })], 'folder'), 0);
});

test('empty mobile search still routes to All Notes with an empty query', () => {
  assert.deepEqual(getDashboardSearchDestination('   '), { view: { kind: 'all' }, query: '' });
});

test('search query is trimmed before reaching the existing notes list', () => {
  assert.deepEqual(getDashboardSearchDestination('\n ideas  '), { view: { kind: 'all' }, query: 'ideas' });
});

test('opening recent from mobile Home keeps the existing recent view', () => {
  assert.deepEqual(getMobileRecentState(), { destination: 'search', view: { kind: 'recent' }, selectedNoteId: null });
});

test('opening a mobile folder routes into the existing folder list with its id', () => {
  assert.deepEqual(getMobileFolderState('f-mobile'), { destination: 'search', view: { kind: 'folder', id: 'f-mobile' }, selectedNoteId: null });
});

test('mobile new-note action selects the new note in All Notes at the root', () => {
  assert.deepEqual(getMobileNewNoteState('new-note'), { destination: 'search', view: { kind: 'all' }, folderId: null, selectedNoteId: 'new-note' });
});

test('mobile search routes to All Notes and preserves a trimmed query', () => {
  assert.deepEqual(getMobileSearchState('  tanooki  '), { destination: 'search', view: { kind: 'all' }, query: 'tanooki', selectedNoteId: null });
});

test('mobile settings remains in the More destination', () => {
  assert.equal(getMobileDestinationAfterView({ kind: 'settings' }), 'more');
});

test('mobile Home view maps to the Home destination', () => {
  assert.equal(getMobileDestinationAfterView({ kind: 'home' }), 'home');
});

test('archive and trash routes are reachable from More through the Search/list destination', () => {
  assert.equal(getMobileDestinationAfterView({ kind: 'archived' }), 'search');
  assert.equal(getMobileDestinationAfterView({ kind: 'trash' }), 'search');
});

test('bottom navigation is hidden on desktop', () => {
  assert.equal(shouldShowMobileBottomNav(true, null, { kind: 'home' }), false);
});

test('bottom navigation is visible on mobile when no editor note is open', () => {
  assert.equal(shouldShowMobileBottomNav(false, null, { kind: 'all' }), true);
});

test('bottom navigation is hidden while a mobile editor note is open', () => {
  assert.equal(shouldShowMobileBottomNav(false, 'note-1', { kind: 'all' }), false);
});

test('bottom navigation remains visible in Trash because Trash has no editor view', () => {
  assert.equal(shouldShowMobileBottomNav(false, 'trashed-note', { kind: 'trash' }), true);
});
