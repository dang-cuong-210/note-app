import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, editor, sheets, noteList, mobileHome, css] = await Promise.all([
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MobileEditorSheets.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
]);

test('mobile editor has local Reading/Writing state and the new-note action starts Writing', () => {
  assert.match(editor, /useState\(startInWritingMode\)/);
  assert.match(editor, /setMobileWriting\(startInWritingMode\)/);
  assert.match(editor, /contentEditable=\{canEdit\}/);
  assert.match(editor, /aria-label=\{mobileWriting \? 'Xong chỉnh sửa' : 'Chỉnh sửa ghi chú'\}/);
  assert.match(app, /setMobileNewNoteId\(note\.id\)/);
  assert.match(app, /startInWritingMode=\{!isDesktop && mobileNewNoteId === selectedNote\?\.id\}/);
});

test('mobile Back and Done flush the latest title/body before navigation or mode exit', () => {
  const flush = editor.match(/const flushCurrentDraft = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(flush);
  assert.match(flush, /clearTimeout\(saveTimer\.current\)/);
  assert.match(flush, /titleRef\.current/);
  assert.match(flush, /contentRef\.current/);
  assert.match(flush, /currentTitle === baseline\.title && currentContent === baseline\.content/);
  assert.match(flush, /onUpdate\(note\.id, currentTitle, currentContent\)/);
  assert.match(editor, /flushCurrentDraftRef\.current = flushCurrentDraft/);
  assert.match(editor, /useEffect\(\(\) => \(\) => flushCurrentDraftRef\.current\(\), \[\]\)/);

  const back = editor.match(/className="tanooki-mobile-editor-icon" onClick=\{\(\) => \{([\s\S]*?)\}\} aria-label="Quay lại"/)?.[1];
  assert.ok(back);
  assert.ok(back.indexOf('flushCurrentDraft();') < back.indexOf('clearSelection();'));
  assert.ok(back.indexOf('clearSelection();') < back.indexOf('onBack();'));

  const doneButton = editor.slice(editor.indexOf('className="tanooki-mobile-editor-mode"'));
  assert.ok(doneButton.indexOf('flushCurrentDraft();') < doneButton.indexOf('setMobileWriting(false)'));
});

test('mobile tools use existing image and attachment picker inputs and display current note metadata', () => {
  assert.match(editor, /onChooseImage=\{\(\) => imageInputRef\.current\?\.click\(\)\}/);
  assert.match(editor, /onChooseFile=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
  assert.match(sheets, /title="Công cụ"/);
  assert.match(sheets, /Thêm hình ảnh/);
  assert.match(sheets, /Đính kèm tệp/);
  for (const label of ['Ngày tạo', 'Cập nhật', 'Tệp đính kèm', 'Số từ', 'Ký tự', 'Thẻ']) assert.ok(sheets.includes(label));
});

test('mobile note action sheet invokes the existing pin/archive/move/duplicate/trash callbacks', () => {
  assert.match(editor, /<MobileNoteActionsSheet[\s\S]*?onTogglePin=\{onTogglePin\}[\s\S]*?onArchive=\{onArchive\}[\s\S]*?onMove=\{onMove\}[\s\S]*?onDuplicate=\{onDuplicate\}[\s\S]*?onTrash=\{onTrash\}/);
  for (const label of ['Ghim', 'Lưu trữ', 'Chuyển thư mục', 'Tạo bản sao', 'Chuyển vào thùng rác']) assert.ok(sheets.includes(label));
});

test('mobile Trash row actions use a bottom sheet for restore and permanent deletion', () => {
  assert.match(noteList, /mobileMode && menuNote && view\.kind === 'trash' && <MobileTrashActionsSheet/);
  assert.match(sheets, /<button type="button" onClick=\{\(\) => \{ onClose\(\); onRestore\(note\.id\); \}\}>/);
  assert.match(sheets, /onPermanentDelete\(note\.id\)/);
  assert.ok(sheets.includes('Xóa vĩnh viễn'));
});

test('mobile folder creation sheet uses the existing addFolder callback; Home and More remain present', () => {
  assert.match(mobileHome, /onAddFolder: \(name: string\) => void/);
  assert.match(mobileHome, /<MobileCreateFolderSheet[\s\S]*?onCreate=\{onAddFolder\}/);
  assert.match(app, /onAddFolder=\{data\.addFolder\}/);
  assert.match(mobileHome, /export function MobileHome/);
  assert.match(app, /<MobileMoreView/);
});

test('bottom sheets are accessible dialogs with close, Escape, focus handling and safe-area sizing', () => {
  assert.match(sheets, /role="dialog" aria-modal="true"/);
  assert.match(sheets, /event\.key === 'Escape'/);
  assert.match(sheets, /previousFocus\?\.focus\(\)/);
  assert.match(css, /max-height: min\(84dvh, calc\(100dvh - env\(safe-area-inset-top\)/);
  assert.match(css, /padding: 8px 16px calc\(14px \+ env\(safe-area-inset-bottom\)\)/);
});

test('mobile editor styles are scoped below 1024px and desktop tools remain unchanged', () => {
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*?\.tanooki-mobile-editor-canvas/);
  assert.match(app, /max-lg:w-full max-lg:min-w-0 max-lg:max-w-full flex-1 min-w-0 overflow-hidden/);
  assert.match(css, /\.tanooki-mobile-editor \{ display: flex; width: 100%; max-width: 100%; min-width: 0; flex: 1 1 0%; height: 100dvh;/);
  assert.match(editor, /tanooki-mobile-editor-scroll/);
  assert.doesNotMatch(editor, /min-h-\[200px\]/);
  assert.match(editor, /event\.target !== event\.currentTarget/);
  assert.match(editor, /range\.selectNodeContents\(editor\)/);
  assert.match(css, /\.tanooki-mobile-editor-scroll \{ display: flex; width: 100%; min-height: 0; flex: 1 1 0; flex-direction: column; overflow-y: auto; \}/);
  assert.match(css, /\.tanooki-mobile-editor-canvas \{ display: flex; width: 100%; min-width: 0; max-width: none; min-height: 100%; flex: 1 0 auto; flex-direction: column;/);
  assert.match(css, /\.tanooki-mobile-editor-canvas > \.note-content \{ width: 100%; min-width: 0; min-height: 0; flex: 1 0 auto;/);
  assert.doesNotMatch(css, /\.tanooki-mobile-editor > \.flex-1\.overflow-y-auto/);
  assert.doesNotMatch(css, /\.tanooki-mobile-editor-canvas(?: >)? \.note-content \{[^}]*min-height: 100%|\.tanooki-mobile-editor-canvas > \.note-content \{[^}]*min-height: 55vh/);
  assert.match(css, /@media \(min-width: 1400px\)[\s\S]*?\.tanooki-desktop-tools-panel \{ display: flex; \}/);
  assert.match(app, /<DesktopEditorToolsPanel/);
});

test('the editor keeps existing upload, media gesture and viewer functions without adding formatting commands', () => {
  for (const existingHandler of ['handleImageUpload', 'handleFileUpload', 'onInlinePointerDown', 'onImagePointerDown', 'resizeImage', 'setImageViewer', 'handleDeleteAttachment']) assert.ok(editor.includes(existingHandler));
  assert.doesNotMatch(editor, /execCommand\(['"](bold|italic|underline|formatBlock|insertUnorderedList)/);
  assert.match(editor, /imageInputRef=|ref=\{imageInputRef\}/);
  assert.match(editor, /ref=\{fileInputRef\}/);
});
