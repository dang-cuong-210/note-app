import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, editor, panel, css] = await Promise.all([
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/DesktopEditorToolsPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
]);

test('desktop tools toggle is wired to the existing desktop editor toolbar only', () => {
  assert.match(app, /setToolsPanelOpen\(\(open\) => !open\)/);
  assert.match(app, /isDesktop && selectedNote[\s\S]*?<DesktopEditorToolsPanel/);
  assert.match(editor, /aria-label="Công cụ chỉnh sửa" aria-controls="tanooki-desktop-editor-tools" aria-expanded=\{toolsPanelOpen\}/);
  assert.match(editor, /desktopPresentation && onToggleToolsPanel/);
});

test('tools panel is an overlay below 1400px and permanent from 1400px', () => {
  assert.match(css, /@media \(min-width: 1400px\)[\s\S]*?\.tanooki-desktop-tools-panel \{ display: flex; \}/);
  assert.match(css, /@media \(min-width: 1024px\) and \(max-width: 1399px\)[\s\S]*?\.tanooki-desktop-tools-panel \{ position: absolute; top: 0; right: 0; height: 100%; \}[\s\S]*?\.tanooki-desktop-tools-panel\.is-open \{ display: flex;/);
  assert.match(css, /\.tanooki-info-toggle \{ display: none; \}/);
});

test('tools call existing archive and folder-move actions instead of introducing new behavior', () => {
  assert.match(panel, /onArchive\(note\.id, !note\.archived\)/);
  assert.match(panel, /onMove\(note\.id, event\.target\.value \|\| null\)/);
  assert.match(app, /onArchive=\{data\.archiveNote\}/);
  assert.match(app, /onMove=\{data\.moveNote\}/);
});

test('panel has no placeholder formatting or insertion controls and is excluded from mobile', () => {
  assert.doesNotMatch(panel, /Màu chữ|Tô sáng|Căn lề|Phông chữ|Giãn dòng|Cỡ chữ|Bảng|Thêm hình ảnh|Đính kèm tệp/);
  assert.match(app, /\{isDesktop && selectedNote && view\.kind !== 'home'/);
  assert.match(app, /desktopPresentation=\{isDesktop\}/);
});

test('desktop editor toolbar exposes shared formatting commands with active selection state', () => {
  const toolbar = editor.match(/desktopPresentation && <nav className="tanooki-editor-format-toolbar"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.ok(toolbar);
  for (const action of ['action.name', 'action.label', 'aria-pressed={activeFormatting.includes(action.id)}', 'handleMobileFormat(action.id)']) assert.ok(toolbar.includes(action));
  assert.match(editor, /MOBILE_FORMATTING_GROUPS\.map\(\(group\)/);
  assert.match(editor, /if \(desktopPresentation\) \{[\s\S]*?refreshActiveFormatting\(\)/);
  assert.match(editor, /onPointerDown=\{\(event\) => \{ event\.preventDefault\(\); rememberCaret\(\); \}\} onClick=\{\(\) => handleMobileFormat\(action\.id\)\}/);
  for (const label of ['bold', 'italic', 'underline', 'strikeThrough', 'heading1', 'heading2', 'heading3', 'insertUnorderedList', 'insertOrderedList', 'checklist', 'quote', 'code']) assert.ok(editor.includes(label));
});

test('desktop media controls use existing attachment, image, and drawing pipelines and replace the old strip', () => {
  const toolbar = editor.match(/desktopPresentation && <nav className="tanooki-editor-format-toolbar"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.match(toolbar, /fileInputRef\.current\?\.click\(\)/);
  assert.match(toolbar, /imageInputRef\.current\?\.click\(\)/);
  assert.match(toolbar, /setDrawingOpen\(true\)/);
  assert.match(editor, /drawingOpen && <MobileDrawingMarkup/);
  assert.match(editor, /onDone=\{\(image\) => \{ setDrawingOpen\(false\); void handleImageUpload\(image\); \}\}/);
  assert.match(editor, /ref=\{fileInputRef\} type="file" multiple onChange=\{handleFileSelect\}/);
  assert.match(editor, /ref=\{imageInputRef\} type="file" accept="image\/jpeg,image\/png,image\/gif,image\/webp" multiple onChange=\{handleFileSelect\}/);
  assert.doesNotMatch(editor, /tanooki-editor-attachment-bar/);
  assert.match(editor, /!desktopPresentation && <nav className="tanooki-mobile-editor-bottom-bar"/);
});

test('desktop writing column and toolbar stay within the editor pane and remain outside body scrolling', () => {
  assert.match(css, /\.tanooki-editor-format-toolbar-inner \{[^}]*max-width: 920px[^}]*flex-wrap: wrap/s);
  assert.match(css, /\.tanooki-editor-canvas \{[^}]*max-width: 920px/s);
  assert.match(editor, /tanooki-editor-format-toolbar[\s\S]*?ref=\{editorScrollRef\} className=\{`flex-1 overflow-y-auto/);
  assert.match(css, /\.tanooki-editor-format-button:focus-visible/);
  assert.match(css, /@media \(max-width: 1279px\) and \(min-width: 1024px\)[\s\S]*?\.tanooki-editor-format-toolbar-inner \{ padding-inline: 22px; \}/);
  assert.match(css, /\.tanooki-editor-canvas \{[^}]*padding: 26px 32px 56px/s);
});

test('desktop header retains Undo, Redo, Share, Pin, and More actions', () => {
  for (const label of ['Hoàn tác', 'Làm lại', 'Chia sẻ ghi chú', 'Tùy chọn ghi chú']) assert.ok(editor.includes(`aria-label="${label}"`));
  assert.match(editor, /onClick=\{\(\) => runEditorHistory\('undo'\)\}/);
  assert.match(editor, /onClick=\{\(\) => runEditorHistory\('redo'\)\}/);
  assert.match(editor, /onClick=\{\(\) => onTogglePin\(note\.id\)\}/);
});
