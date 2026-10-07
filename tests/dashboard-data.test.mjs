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

const note = (id, updatedAt, flags = {}) => ({
  id, title: id, content: '', folderId: flags.folderId ?? null,
  pinned: flags.pinned ?? false, archived: flags.archived ?? false,
  trashed: flags.trashed ?? false, updatedAt,
});

test('desktop initializes Home while mobile retains All Notes', () => {
  assert.deepEqual(getInitialView(true), { kind: 'home' });
  assert.deepEqual(getInitialView(false), { kind: 'all' });
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
