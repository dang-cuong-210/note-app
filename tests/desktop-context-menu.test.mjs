import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('desktop context menu opens at pointer coordinates while normal row taps still open notes', async () => {
  const list = await read('../src/components/NoteList.tsx');
  assert.match(list, /onContextMenu=\{\(event\) => \{\s*if \(mobileMode \|\| !desktopMode/);
  assert.match(list, /event\.preventDefault\(\);[\s\S]*?point: \{ x: event\.clientX, y: event\.clientY \}/);
  assert.match(list, /onClick=\{\(\) => mobileAllNotesSelectionMode && desktopWorkspaceMode \? toggleAllNoteSelection\(note\.id\) : onSelectNote\(note\.id\)\}/);
  assert.match(list, /<DesktopNoteGalleryCard[\s\S]*?onContextMenu=\{/);
});

test('desktop note context actions reuse existing pin, share, move, archive, duplicate and trash handlers', async () => {
  const list = await read('../src/components/NoteList.tsx');
  assert.match(list, /onTogglePin\(note\.id\)/);
  assert.match(list, /handleShare\(note\)/);
  assert.match(list, /onMove\(note\.id, folderId\)/);
  assert.match(list, /<DesktopFolderMoveOptions folders=\{folders\} onSelect=\{\(folderId\) => \{ close\(\); onMove\(note\.id, folderId\); \}\}/);
  assert.match(list, /handleArchive\(note\)/);
  assert.match(list, /onDuplicate\(note\.id\)/);
  assert.match(list, /handleTrash\(note\)/);
  assert.match(list, /view\.kind === 'trash'[\s\S]*?onRestore\(note\.id\)[\s\S]*?handleDelete\(note\)/);
  assert.match(list, /onClick=\{\(\) => \{ close\(\); void handleDelete\(note\); \}\}/);
});

test('desktop folder context actions retain existing rename and confirmed delete behavior', async () => {
  const sidebar = await read('../src/components/DesktopSidebar.tsx');
  const list = await read('../src/components/NoteList.tsx');
  assert.match(sidebar, /onContextMenu=\{\(event\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\); announceDesktopContextMenu\(\)/);
  assert.match(sidebar, /beginRename\(folder\)/);
  assert.match(sidebar, /window\.confirm\(`Xóa thư mục/);
  assert.match(list, /desktopContextMenu\.kind === 'folder'[\s\S]*?onRenameFolder\?\.\(folder\.id/);
  assert.match(list, /onDeleteFolder\?\.\(folder\.id\)/);
});

test('desktop Home note and folder cards expose the same context actions without changing their left-click navigation', async () => {
  const dashboard = await read('../src/components/TanookiDashboard.tsx');
  const app = await read('../src/App.tsx');
  assert.match(dashboard, /onContextMenu=\{\(event\) => openContextMenu\(event, 'note',[\s\S]*?className=\{`tanooki-dashboard-note-card/);
  assert.match(dashboard, /onContextMenu=\{\(event\) => openContextMenu\(event, 'note',[\s\S]*?className=\{`tanooki-dashboard-recent-row/);
  assert.match(dashboard, /onClick=\{\(\) => onViewChange\(\{ kind: 'folder', id: folder\.id \}\)\} onContextMenu=/);
  for (const action of ['onTogglePin(note.id)', 'shareNote(note)', 'onMove(note.id, folderId)', 'onArchive(note.id, !note.archived)', 'onDuplicate(note.id)', 'onTrash(note.id)']) assert.ok(dashboard.includes(action));
  for (const prop of ['onTogglePin={data.togglePin}', 'onTrash={handleTrash}', 'onDuplicate={handleDuplicate}', 'onArchive={data.archiveNote}', 'onMove={data.moveNote}', 'onRenameFolder={data.renameFolder}', 'onDeleteFolder={data.removeFolder}']) assert.ok(app.includes(prop));
});

test('desktop context menus clamp to the viewport and dismiss on outside click, Escape and another menu', async () => {
  const menu = await read('../src/components/DesktopContextMenu.tsx');
  const css = await read('../src/index.css');
  assert.match(menu, /window\.innerWidth - bounds\.width - margin/);
  assert.match(menu, /window\.innerHeight - bounds\.height - margin/);
  assert.match(menu, /document\.addEventListener\('pointerdown', closeOutside, true\)/);
  assert.match(menu, /event\.key === 'Escape'/);
  assert.match(menu, /tanooki:desktop-context-menu-open/);
  assert.match(css, /\.tanooki-desktop-context-menu \{ position: fixed; z-index:/);
  assert.match(css, /\.tanooki-desktop-context-menu > button\.is-danger/);
  assert.match(css, /\.tanooki-desktop-note-row\.is-context-open/);
});

test('existing mobile long-press context handling remains independent of desktop right-click', async () => {
  const list = await read('../src/components/NoteList.tsx');
  const hook = await read('../src/components/useMobileLongPress.ts');
  assert.match(list, /\{mobileMode && longPressTarget && <MobileContextPopover/);
  assert.match(list, /if \(mobileMode \|\| !desktopMode/);
  assert.match(hook, /event\.pointerType !== 'touch'/);
  assert.match(list, /longPressTarget\.kind === 'note'[\s\S]*?onTogglePin\(targetNote\.id\)/);
});
