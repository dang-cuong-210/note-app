import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureSettingsReturnContext, resolveSettingsReturnContext } from '../src/lib/settingsNavigation.js';

const note = (id, flags = {}) => ({
  id,
  title: id,
  content: flags.content ?? '',
  folderId: flags.folderId ?? null,
  pinned: flags.pinned ?? false,
  archived: flags.archived ?? false,
  trashed: flags.trashed ?? false,
  updatedAt: 1,
});

const context = (view, updates = {}) => ({
  view,
  selectedNoteId: null,
  mobileDestination: 'search',
  searchQuery: '',
  ...updates,
});

const restoreDesktop = (origin, notes = [], folders = []) => resolveSettingsReturnContext({ origin, notes, folders, isDesktop: true });

test('desktop All Notes -> Settings -> Back restores the All Notes context', () => {
  const origin = context({ kind: 'all' });
  assert.deepEqual(restoreDesktop(origin), origin);
});

test('desktop Folder -> Settings -> Back restores the same folder and selection', () => {
  const origin = context({ kind: 'folder', id: 'folder-a' }, { selectedNoteId: 'folder-note' });
  assert.deepEqual(restoreDesktop(origin, [note('folder-note', { folderId: 'folder-a' })], [{ id: 'folder-a' }]), origin);
});

test('desktop Tag -> Settings -> Back restores the same tag view', () => {
  const origin = context({ kind: 'tag', name: 'work' });
  assert.deepEqual(restoreDesktop(origin), origin);
});

test('desktop Archive -> Settings -> Back restores Archive', () => {
  const origin = context({ kind: 'archived' });
  assert.deepEqual(restoreDesktop(origin), origin);
});

test('desktop Recent -> Settings -> Back restores Recent', () => {
  const origin = context({ kind: 'recent' });
  assert.deepEqual(restoreDesktop(origin), origin);
});

test('mobile More -> Settings -> Back returns to the More destination', () => {
  const origin = context({ kind: 'all' }, { mobileDestination: 'more' });
  assert.deepEqual(resolveSettingsReturnContext({ origin, notes: [], folders: [], isDesktop: false }), origin);
});

test('search query survives Settings round trip', () => {
  const origin = context({ kind: 'folder', id: 'folder-a' }, { mobileDestination: 'search', searchQuery: 'draft query' });
  assert.equal(restoreDesktop(origin, [], [{ id: 'folder-a' }]).searchQuery, 'draft query');
});

test('selected note is restored only if it still belongs to the saved view', () => {
  const origin = context({ kind: 'archived' }, { selectedNoteId: 'archived-note' });
  assert.equal(restoreDesktop(origin, [note('archived-note', { archived: true })]).selectedNoteId, 'archived-note');
  assert.equal(restoreDesktop(origin, [note('archived-note')]).selectedNoteId, null);
  assert.equal(restoreDesktop(origin, []).selectedNoteId, null);
});

test('invalid deleted-folder origin falls back to a safe platform start', () => {
  const origin = context({ kind: 'folder', id: 'deleted-folder' }, { selectedNoteId: 'old-note', searchQuery: 'old query' });
  assert.deepEqual(restoreDesktop(origin), context({ kind: 'all' }, { mobileDestination: 'all' }));
  assert.deepEqual(resolveSettingsReturnContext({ origin, notes: [], folders: [], isDesktop: false }), context({ kind: 'home' }, { mobileDestination: 'home' }));
});

test('opening Settings while already there does not overwrite its first origin', () => {
  const firstOrigin = context({ kind: 'tag', name: 'work' }, { searchQuery: 'draft' });
  const repeatedEntry = context({ kind: 'settings' }, { mobileDestination: 'more' });
  assert.deepEqual(captureSettingsReturnContext(repeatedEntry, firstOrigin), firstOrigin);
  assert.deepEqual(captureSettingsReturnContext(firstOrigin, null), firstOrigin);
});

test('App captures Settings entry context and restores it from Settings Back', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /captureSettingsReturnContext\(\{ view, selectedNoteId, mobileDestination, searchQuery \}, current\)/);
  assert.match(app, /onBack=\{handleBackFromSettings\}/);
  assert.match(app, /resolveSettingsReturnContext\(\{\s*origin: settingsReturn/);
});
