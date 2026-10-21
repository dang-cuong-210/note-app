import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('mobile note rows keep normal tap navigation and expose long-press context data', async () => {
  const list = await read('../src/components/NoteList.tsx');
  const home = await read('../src/components/LiveSearchResults.tsx');
  assert.match(list, /onClick=\{\(\) => onSelectNote\(note\.id\)\}/);
  assert.match(list, /onClick=\{onOpen\}/);
  assert.match(list, /data-mobile-context-kind=\{!selectionMode \? 'note' : undefined\}/);
  assert.match(list, /data-mobile-context-kind=\{mobileMode \? 'note' : undefined\}/);
  assert.match(home, /data-mobile-context-kind="note"/);
});

test('mobile folder rows preserve quick-open and provide context actions on Home, Folders and nested lists', async () => {
  const home = await read('../src/components/MobileHome.tsx');
  const list = await read('../src/components/NoteList.tsx');
  assert.match(home, /data-mobile-context-kind="folder"[^\n]*onClick=\{onClick\}/);
  assert.match(home, /onRenameFolder\(renameFolderTarget\.id, name\)/);
  assert.match(home, /onDeleteFolder\(folder\.id\)/);
  assert.match(list, /data-mobile-context-kind="folder"[^\n]*onClick=\{\(\) => onOpenFolder/);
  assert.match(list, /onRenameFolder\?\.\(contextFolderRenameId, name\)/);
  assert.match(list, /onDeleteFolder\?\.\(folder\.id\)/);
});

test('long press opens after 450ms and movement over 10px cancels without affecting quick taps', async () => {
  const hook = await read('../src/components/useMobileLongPress.ts');
  assert.match(hook, /event\.pointerType !== 'touch'/);
  assert.match(hook, /\}, 450\)/);
  assert.match(hook, /Math\.hypot\(event\.clientX - pending\.x, event\.clientY - pending\.y\) > 10/);
  assert.match(hook, /onPointerCancelCapture: cancel/);
  assert.match(hook, /firedElement\.current\.contains\(target\)/);
  assert.match(hook, /setTimeout\(\(\) => \{ firedElement\.current = null; \}, 1000\)/);
  assert.match(hook, /onClick=|onClickCapture/);
  assert.match(hook, /pending\.target\.rect = pending\.element\.getBoundingClientRect\(\)/);
});

test('native context menu is prevented only for context-enabled mobile note and folder rows', async () => {
  const hook = await read('../src/components/useMobileLongPress.ts');
  const css = await read('../src/index.css');
  const editor = await read('../src/components/NoteEditor.tsx');
  assert.match(hook, /onContextMenuCapture:[\s\S]*?event\.preventDefault\(\)/);
  assert.match(hook, /closest\('\[data-mobile-context-kind="note"\], \[data-mobile-context-kind="folder"\]'\)/);
  assert.match(css, /@media \(max-width: 1023px\) \{\s*\[data-mobile-context-kind="note"\], \[data-mobile-context-kind="folder"\] \{[^}]*-webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: pan-y/);
  assert.match(css, /:where\(\[data-mobile-context-kind="note"\], \[data-mobile-context-kind="folder"\]\) :is\(input, textarea, \[contenteditable="true"\]\) \{ -webkit-user-select: text; user-select: text/);
  assert.match(editor, /contentEditable=\{canEdit\}/);
  assert.doesNotMatch(css, /\.note-content\s*\{[^}]*user-select:\s*none/);
});

test('context overlay dismisses by outside tap or Escape and stays viewport constrained', async () => {
  const component = await read('../src/components/MobileContextPopover.tsx');
  const css = await read('../src/index.css');
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /aria-label="Đóng menu thao tác" onClick=\{onClose\}/);
  assert.match(component, /below \+ menu\.height <= viewportHeight/);
  assert.match(css, /max-height: calc\(100dvh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\) - 32px\)/);
  assert.match(css, /backdrop-filter: blur\(3px\)/);
  assert.match(component, /visibility: 'hidden'/);
});

test('context menu locks only its originating scroll container and restores its prior inline styles', async () => {
  const hook = await read('../src/components/useMobileLongPress.ts');
  const component = await read('../src/components/MobileContextPopover.tsx');
  assert.match(hook, /scrollElement: HTMLElement \| null/);
  assert.match(hook, /window\.getComputedStyle\(scrollElement\)\.overflowY/);
  assert.match(component, /target\?\.scrollElement/);
  assert.match(component, /scrollElement\.style\.setProperty\('overflow-y', 'hidden'\)/);
  assert.match(component, /scrollElement\.style\.setProperty\(property, value, priority\)/);
  assert.match(component, /scrollElement\.style\.removeProperty\(property\)/);
});

test('note context actions reuse existing pin, move, archive, duplicate, trash and Trash restore/delete handlers', async () => {
  const list = await read('../src/components/NoteList.tsx');
  const home = await read('../src/components/MobileHome.tsx');
  assert.match(list, /onTogglePin\(targetNote\.id\)/);
  assert.match(list, /onMove\(targetNote\.id, folder\.id\)/);
  assert.match(list, /handleArchive\(targetNote\)/);
  assert.match(list, /onDuplicate\(targetNote\.id\)/);
  assert.match(list, /onTrash\(targetNote\.id\)/);
  assert.match(list, /onRestore\(targetNote\.id\)/);
  assert.match(list, /handleDelete\(targetNote\)/);
  assert.match(home, /onTogglePin\(note\.id\)/);
  assert.match(home, /onMove\(note\.id, folder\.id\)/);
  assert.match(home, /onArchive\(note\.id, !note\.archived\)/);
  assert.match(home, /onDuplicate\(note\.id\)/);
  assert.match(home, /onTrash\(note\.id\)/);
});

test('context state clears on view change and mobile-only rendering preserves desktop menus', async () => {
  const list = await read('../src/components/NoteList.tsx');
  assert.match(list, /useEffect\(\(\) => \{ setLongPressTarget\(null\); \}, \[view\]\)/);
  assert.match(list, /\{mobileMode && longPressTarget && <MobileContextPopover/);
  assert.match(list, /menuFor === note\.id && !mobileMode/);
});
