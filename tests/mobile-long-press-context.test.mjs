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

test('native text selection and context menus are blocked only on context surfaces, not in the editor', async () => {
  const hook = await read('../src/components/useMobileLongPress.ts');
  const popover = await read('../src/components/MobileContextPopover.tsx');
  const css = await read('../src/index.css');
  const editor = await read('../src/components/NoteEditor.tsx');
  assert.match(hook, /document\.addEventListener\('selectstart', preventContextSelection, true\)/);
  assert.match(hook, /document\.removeEventListener\('selectstart', preventContextSelection, true\)/);
  assert.match(hook, /const CONTEXT_SURFACE_SELECTOR = '\[data-mobile-context-kind="note"\], \[data-mobile-context-kind="folder"\]'/);
  assert.match(hook, /onContextMenuCapture:[\s\S]*?event\.preventDefault\(\)/);
  assert.match(hook, /window\.getSelection\(\)\?\.removeAllRanges\(\);[\s\S]*?onOpenRef\.current\(pending\.target\)/);
  assert.match(popover, /layer\.addEventListener\('selectstart', preventSelection, true\)/);
  assert.match(popover, /layer\.removeEventListener\('selectstart', preventSelection, true\)/);
  assert.match(popover, /onContextMenuCapture=\{\(event\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\); \}\}/);
  assert.match(popover, /requestAnimationFrame\(\(\) => window\.getSelection\(\)\?\.removeAllRanges\(\)\)/);
  assert.match(css, /\[data-mobile-context-kind="note"\] \*, \[data-mobile-context-kind="folder"\] \* \{[^}]*-webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none/);
  assert.match(css, /\.tanooki-mobile-context-layer \* \{ -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none; \}/);
  assert.match(css, /\[role="textbox"\][\s\S]*?\{\s*-webkit-user-select: text !important; user-select: text !important/);
  assert.match(editor, /contentEditable=\{canEdit\}/);
  assert.doesNotMatch(css, /\.note-content\s*\{[^}]*user-select:\s*none/);
});

test('long-press selection guard preserves editor selection and movement/quick-tap behavior', async () => {
  const hook = await read('../src/components/useMobileLongPress.ts');
  assert.match(hook, /function isEditableTarget[\s\S]*?target\.closest\(EDITABLE_SELECTOR\)/);
  assert.match(hook, /if \(!hit\?\.closest\(CONTEXT_SURFACE_SELECTOR\) \|\| isEditableTarget\(hit\)\) return/);
  assert.match(hook, /Math\.hypot\(event\.clientX - pending\.x, event\.clientY - pending\.y\) > 10/);
  assert.match(hook, /firedElement\.current\.contains\(target\)/);
  assert.match(hook, /onPointerUpCapture:[\s\S]*?cancel\(\)/);
});

test('context overlay dismisses by outside tap or Escape and stays viewport constrained', async () => {
  const component = await read('../src/components/MobileContextPopover.tsx');
  const css = await read('../src/index.css');
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /aria-label="Đóng menu thao tác" onClick=\{onClose\}/);
  assert.match(component, /availableHeight = Math\.max\(220, maxBottom - minTop\)/);
  assert.match(component, /const groupHeight = previewHeight[\s\S]*?maxBottom - groupHeight/);
  assert.match(css, /max-height: 60dvh/);
  assert.match(css, /backdrop-filter: blur\(7px\)/);
  assert.match(component, /visibility: 'hidden'/);
});

test('long-press context opens in a short stagger and closes without dropping scroll state early', async () => {
  const component = await read('../src/components/MobileContextPopover.tsx');
  const list = await read('../src/components/NoteList.tsx');
  const home = await read('../src/components/MobileHome.tsx');
  const css = await read('../src/index.css');
  assert.match(component, /setStage\('backdrop'\)/);
  assert.match(component, /backdropTimer = setTimeout\(\(\) => setStage\('backdrop'\), 32\)/);
  assert.match(component, /previewTimer = setTimeout\(\(\) => setStage\('preview'\), 60\)/);
  assert.match(component, /menuTimer = setTimeout\(\(\) => setStage\('menu'\), 100\)/);
  assert.match(component, /element\.classList\.add\('is-context-lifting'\)/);
  assert.match(component, /setStage\('closing'\)/);
  assert.match(list, /setLongPressClosing\(true\)[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?setLongPressTarget\(null\)[\s\S]*?\}, 150\)/);
  assert.match(list, /closeLongPress\(action\)/);
  assert.match(home, /<MobileContextPopover target=\{contextTarget\} closing=\{contextClosing\}/);
  assert.match(home, /const run = \(action: \(\) => void\) => closeContext\(action\)/);
  assert.match(home, /<MobileContextPopover target=\{contextTarget\} closing=\{contextClosing\} onClose=\{\(\) => closeContext\(\)\} labelledBy="mobile-folders-context-menu"/);
  assert.match(css, /\.is-context-lifting \{[^}]*scale\(1\.015\)[^}]*140ms/);
  assert.match(css, /\.tanooki-mobile-context-backdrop \{[^}]*transition: opacity 185ms/);
  assert.match(css, /\.tanooki-mobile-context-highlight\.is-visible \{[^}]*translateY\(0\) scale\(1\)/);
  assert.match(css, /\.tanooki-mobile-context-menu\.is-visible \{[^}]*translateY\(0\) scale\(1\)/);
  assert.match(css, /\.tanooki-mobile-context-group\.is-closing[\s\S]*?transition-duration: 130ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.is-context-lifting \{ transform: none/);
  assert.match(css, /transition-duration: 60ms; transition-delay: 0s/);
});

test('note context uses a dedicated readable preview with a multi-line body excerpt', async () => {
  const component = await read('../src/components/MobileContextPopover.tsx');
  const list = await read('../src/components/NoteList.tsx');
  const search = await read('../src/components/LiveSearchResults.tsx');
  const css = await read('../src/index.css');
  assert.match(component, /tanooki-mobile-context-preview-body/);
  assert.match(component, /target\.preview \|\| target\.detail/);
  assert.match(list, /data-mobile-context-preview=\{!selectionMode \? contextPreview\.slice\(0, 1600\)/);
  assert.match(search, /data-mobile-context-preview=\{record\?\.bodyText\.slice\(0, 1600\)/);
  assert.match(css, /\.tanooki-mobile-context-highlight\.is-note \{ min-height: 164px; \}/);
  assert.match(component, /height: position\.previewHeight/);
  assert.match(css, /\.tanooki-mobile-context-preview-body \{[^}]*overflow: hidden;[^}]*white-space: pre-wrap/);
  assert.match(css, /\.tanooki-mobile-context-group \{[^}]*width: min\(420px, 88vw\)/);
  assert.doesNotMatch(component, /contentEditable|contenteditable/);
});

test('folder context preview displays a full name and count separately from its action menu', async () => {
  const component = await read('../src/components/MobileContextPopover.tsx');
  const css = await read('../src/index.css');
  const home = await read('../src/components/MobileHome.tsx');
  const list = await read('../src/components/NoteList.tsx');
  assert.match(component, /target\.kind === 'folder'[\s\S]*?<Folder size=\{24\}/);
  assert.match(component, /<strong>\{target\.title\}<\/strong><span>\{target\.detail\}<\/span>/);
  assert.match(home, /data-mobile-context-detail=\{`\$\{count\} ghi chú`\}/);
  assert.match(list, /data-mobile-context-detail=\{`\$\{count\} ghi chú`\}/);
  assert.match(component, /tanooki-mobile-context-group[\s\S]*?tanooki-mobile-context-highlight[\s\S]*?tanooki-mobile-context-menu/);
  assert.match(css, /\.tanooki-mobile-context-highlight\.is-folder > strong \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal/);
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
  assert.match(list, /useEffect\(\(\) => \{[\s\S]*?setLongPressTarget\(null\);[\s\S]*?\}, \[view\]\)/);
  assert.match(list, /\{mobileMode && longPressTarget && <MobileContextPopover/);
  assert.match(list, /menuFor === note\.id && !mobileMode/);
});
