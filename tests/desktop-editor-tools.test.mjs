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
