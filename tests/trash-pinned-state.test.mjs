import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getNotesInView } from '../src/lib/advancedSearch.js';
import { getDashboardPinnedNotes } from '../src/lib/dashboardData.js';

const [dataHook, app, sidebar, desktopSidebar, noteList, mobileSheets] = await Promise.all([
  readFile(new URL('../src/hooks/useAppData.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/DesktopSidebar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MobileEditorSheets.tsx', import.meta.url), 'utf8'),
]);

function transition(note, trashTimestamp = 1234) {
  const trashBody = dataHook.match(/const trashNote = useCallback\(([\s\S]*?)\n  \);\n\n  const restoreNote/);
  const restoreBody = dataHook.match(/const restoreNote = useCallback\(([\s\S]*?)\n  \);\n\n  const permanentDelete/);
  assert.ok(trashBody, 'trashNote implementation should remain present');
  assert.ok(restoreBody, 'restoreNote implementation should remain present');
  assert.match(trashBody[1], /\{ \.\.\.n, trashed: true, trashedAt: Date\.now\(\) \}/);
  assert.doesNotMatch(trashBody[1], /pinned\s*:/);
  assert.match(trashBody[1], /saveNote\(updated\)/);
  assert.match(restoreBody[1], /\{ \.\.\.n, trashed: false, trashedAt: null \}/);
  assert.doesNotMatch(restoreBody[1], /pinned\s*:/);
  return { ...note, trashed: true, trashedAt: trashTimestamp };
}

test('trashing preserves pinned state and Trash keeps the note out of active pinned views', () => {
  const original = { id: 'pinned', pinned: true, archived: false, trashed: false, trashedAt: null };
  const trashed = transition(original);

  assert.equal(trashed.pinned, true);
  assert.equal(trashed.trashed, true);
  assert.deepEqual(getNotesInView([trashed], { kind: 'pinned' }), []);
  assert.deepEqual(getDashboardPinnedNotes([trashed]), []);
});

test('restoring after Trash or Undo returns pinned notes without extra state', () => {
  const original = { id: 'pinned', pinned: true, archived: false, trashed: false, trashedAt: null };
  const trashed = transition(original);
  const restored = { ...trashed, trashed: false, trashedAt: null };

  assert.equal(restored.pinned, true);
  assert.equal(restored.trashed, false);
  assert.deepEqual(getNotesInView([restored], { kind: 'pinned' }).map(({ id }) => id), ['pinned']);
  assert.match(app, /onClick: \(\) => data\.restoreNote\(id\)/);
  assert.match(app, /toast\('Note moved to trash',[\s\S]*?label: 'Undo',[\s\S]*?data\.restoreNote\(id\)/);
});

test('unpinned and archived+pinned notes retain their original flags through Trash and Restore', () => {
  const unpinned = transition({ id: 'plain', pinned: false, archived: false, trashed: false });
  const archivedPinned = transition({ id: 'archived-pin', pinned: true, archived: true, trashed: false });
  const restoredPlain = { ...unpinned, trashed: false, trashedAt: null };
  const restoredArchivedPinned = { ...archivedPinned, trashed: false, trashedAt: null };

  assert.equal(restoredPlain.pinned, false);
  assert.equal(restoredArchivedPinned.pinned, true);
  assert.equal(restoredArchivedPinned.archived, true);
  assert.deepEqual(getNotesInView([restoredArchivedPinned], { kind: 'archived' }).map(({ id }) => id), ['archived-pin']);
});

test('active pinned counts exclude Trash and Trash actions expose no pin controls', () => {
  assert.match(sidebar, /const activeNotes = notes\.filter\(\(n\) => !n\.trashed\)/);
  assert.match(sidebar, /const pinnedCount = activeNotes\.filter\(\(n\) => n\.pinned\)\.length/);
  assert.match(desktopSidebar, /const activeNotes = notes\.filter\(\(note\) => !note\.trashed\)/);
  assert.match(desktopSidebar, /pinned: activeNotes\.filter\(\(note\) => !note\.archived && note\.pinned\)\.length/);
  const pinMenu = noteList.match(/\{view\.kind !== 'trash' && \(([\s\S]*?)\)\}/);
  assert.ok(pinMenu, 'desktop pin actions should stay behind the non-Trash view condition');
  assert.match(pinMenu[1], /label=\{note\.pinned \? 'Bỏ ghim' : 'Ghim'\}/);
  const trashSheet = mobileSheets.match(/export function MobileTrashActionsSheet\([\s\S]*?\n\}/)?.[0];
  assert.ok(trashSheet, 'mobile Trash actions should remain available');
  assert.match(trashSheet, /Khôi phục[\s\S]*?Xóa vĩnh viễn/);
  assert.doesNotMatch(trashSheet, /Ghim|Pin/);
  assert.match(noteList, /label="Xóa vĩnh viễn" danger onClick=/);
});
