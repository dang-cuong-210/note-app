import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDesktopSelection } from '../src/lib/desktopSelection.js';

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

test('switching from All to an empty Pinned view clears desktop selection', () => {
  assert.equal(reconcileDesktopSelection({
    notes: [note('ordinary')], view: { kind: 'pinned' }, selectedNoteId: 'ordinary', candidateNotes: [],
  }), null);
});

test('switching to non-empty Pinned selects a note in the destination view', () => {
  const notes = [note('ordinary'), note('pinned', { pinned: true })];
  assert.equal(reconcileDesktopSelection({
    notes, view: { kind: 'pinned' }, selectedNoteId: 'ordinary', candidateNotes: notes.filter((item) => item.pinned),
  }), 'pinned');
});

test('switching to an empty Tag view clears desktop selection', () => {
  assert.equal(reconcileDesktopSelection({
    notes: [note('ordinary')], view: { kind: 'tag', name: 'project' }, selectedNoteId: 'ordinary', candidateNotes: [],
  }), null);
});

test('switching to an empty Archive view clears desktop selection', () => {
  assert.equal(reconcileDesktopSelection({
    notes: [note('ordinary')], view: { kind: 'archived' }, selectedNoteId: 'ordinary', candidateNotes: [],
  }), null);
});

test('unarchiving the selected note selects another archived note or clears selection', () => {
  const stillArchived = note('still-archived', { archived: true });
  assert.equal(reconcileDesktopSelection({
    notes: [note('unarchived'), stillArchived], view: { kind: 'archived' }, selectedNoteId: 'unarchived', candidateNotes: [stillArchived],
  }), 'still-archived');
  assert.equal(reconcileDesktopSelection({
    notes: [note('unarchived')], view: { kind: 'archived' }, selectedNoteId: 'unarchived', candidateNotes: [],
  }), null);
});

test('removing pin from selected note reconciles selection to Pinned membership', () => {
  const otherPinned = note('other-pinned', { pinned: true });
  assert.equal(reconcileDesktopSelection({
    notes: [note('unpinned'), otherPinned], view: { kind: 'pinned' }, selectedNoteId: 'unpinned', candidateNotes: [otherPinned],
  }), 'other-pinned');
});

test('selection remains when the note still belongs to the current view', () => {
  const selected = note('selected', { pinned: true });
  assert.equal(reconcileDesktopSelection({
    notes: [selected, note('another', { pinned: true })], view: { kind: 'pinned' }, selectedNoteId: 'selected', candidateNotes: [selected],
  }), 'selected');
});

test('membership changes reconcile tags and folders as well as archive and pin', () => {
  const tagged = note('tagged', { content: '#project' });
  assert.equal(reconcileDesktopSelection({
    notes: [note('untagged')], view: { kind: 'tag', name: 'project' }, selectedNoteId: tagged.id, candidateNotes: [],
  }), null);
  assert.equal(reconcileDesktopSelection({
    notes: [note('moved-out', { folderId: 'elsewhere' })], view: { kind: 'folder', id: 'current' }, selectedNoteId: 'moved-out', candidateNotes: [],
  }), null);
});

test('desktop reconciliation does not alter mobile selection behavior', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(!data\.loaded \|\| !isDesktop \|\| view\.kind === 'home' \|\| view\.kind === 'settings'\) return/);
});
