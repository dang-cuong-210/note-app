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

test('mobile editor opens directly editable without a Reading/Writing toggle', () => {
  assert.match(editor, /const mobileWriting = !desktopPresentation;/);
  assert.match(editor, /contentEditable=\{canEdit\}/);
  assert.match(editor, /const canEdit = true;/);
  assert.match(editor, /tanooki-mobile-editor-document-title/);
  assert.doesNotMatch(editor, /Xong chỉnh sửa|Chỉnh sửa ghi chú|setMobileWriting/);
  assert.match(app, /setMobileNewNoteId\(note\.id\)/);
  assert.match(app, /startInWritingMode=\{!isDesktop && mobileNewNoteId === selectedNote\?\.id\}/);
});

test('mobile title Enter and NumpadEnter move focus to the body and place the caret at its end', () => {
  const keyHandler = editor.match(/const handleMobileTitleKeyDown:[\s\S]*?\n  \};/)?.[0];
  assert.ok(keyHandler);
  assert.match(keyHandler, /event\.key !== 'Enter' && event\.code !== 'NumpadEnter'/);
  assert.ok(keyHandler.indexOf('event.preventDefault()') < keyHandler.indexOf('focusBodyAtEnd()'));

  const focusBody = editor.match(/const focusBodyAtEnd = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(focusBody);
  assert.match(focusBody, /editorRef\.current/);
  assert.match(focusBody, /editor\.focus\(\)/);
  assert.match(focusBody, /range\.selectNodeContents\(editor\)/);
  assert.match(focusBody, /range\.collapse\(false\)/);
  assert.match(focusBody, /selection\?\.addRange\(range\)/);
  assert.doesNotMatch(focusBody, /innerHTML\s*=|textContent\s*=|append(?:Child)?\(/);
  assert.match(editor, /!desktopPresentation && <input[^\n]*onKeyDown=\{handleMobileTitleKeyDown\}/);
  const desktopTitleInput = editor.match(/<input value=\{title\} onChange=\{\(e\) => handleTitleChange\(e\.target\.value\)\}[^\n]*/);
  assert.ok(desktopTitleInput);
  assert.doesNotMatch(desktopTitleInput[0], /onKeyDown/);
});

test('mobile title Enter does not steal IME composition or suppress other keys', () => {
  const keyHandler = editor.match(/const handleMobileTitleKeyDown:[\s\S]*?\n  \};/)?.[0];
  assert.ok(keyHandler);
  assert.match(keyHandler, /nativeEvent\.isComposing/);
  assert.match(keyHandler, /nativeEvent\.keyCode === 229/);
  assert.match(keyHandler, /return;[\s\S]*?event\.preventDefault\(\)/);
  assert.ok(keyHandler.indexOf("event.key !== 'Enter'") < keyHandler.indexOf('event.preventDefault()'));
});

test('mobile Back flushes the latest title/body before navigation', () => {
  const flush = editor.match(/const flushCurrentDraft = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(flush);
  assert.match(flush, /clearTimeout\(saveTimer\.current\)/);
  assert.match(flush, /titleRef\.current/);
  assert.match(flush, /contentRef\.current/);
  assert.match(flush, /currentTitle === baseline\.title && currentContent === baseline\.content/);
  assert.match(flush, /onUpdate\(note\.id, currentTitle, currentContent\)/);
  assert.match(editor, /flushCurrentDraftRef\.current = flushCurrentDraft/);
  assert.match(editor, /useEffect\(\(\) => \(\) => flushCurrentDraftRef\.current\(\), \[\]\)/);

  const backHandler = editor.match(/<button type="button" onClick=\{\(\) => \{([\s\S]*?)\}\} className="tanooki-mobile-editor-back"/)?.[1];
  assert.ok(backHandler);
  assert.ok(backHandler.indexOf('flushCurrentDraft();') < backHandler.indexOf('clearSelection();'));
  assert.ok(backHandler.indexOf('clearSelection();') < backHandler.indexOf('onBack();'));
});

test('same-note reopen after a null note prop rehydrates editor DOM without rewriting active typing', () => {
  assert.match(editor, /const currentNoteId = note\?\.id;[\s\S]*?useEffect\(\(\) => \{\s*if \(currentNoteId\) return;\s*displayedNoteId\.current = null;\s*\}, \[currentNoteId\]\)/);
  const reconcile = editor.match(/\/\/ Reconcile remote updates[\s\S]*?\}, \[note\?\.id, note\?\.title, note\?\.content\]\)/)?.[0];
  assert.ok(reconcile);
  assert.match(reconcile, /if \(!idChanged && !remoteContentChanged\) return;/);
  assert.match(reconcile, /if \(editorRef\.current\) editorRef\.current\.innerHTML = stripLayout\(note\.content \?\? ''\);/);
  assert.match(reconcile, /titleRef\.current = note\.title;\s*contentRef\.current = note\.content;/);
  assert.match(reconcile, /const layout = readLayout\(note\.content\);[\s\S]*?setAttachmentLayout\(layout\);/);
  assert.match(reconcile, /setSelectedImage\(null\);[\s\S]*?setSelectedAttachmentId\(null\);[\s\S]*?setSelectedInlineAttachment\(null\);/);
  assert.match(reconcile, /if \(!idChanged && localDirty && remoteContentChanged\) \{\s*conflictRef\.current = true;/);
});

test('mobile tools retain note metadata and tag management while the paperclip opens the native picker', () => {
  assert.doesNotMatch(editor, /MobileAttachmentMenuSheet|attachment-menu/);
  assert.match(editor, /onClick=\{\(\) => mobileAttachmentInputRef\.current\?\.click\(\)\} aria-label="Đính kèm"/);
  const tools = sheets.match(/interface MobileEditorToolsSheetProps[\s\S]*?interface MobileEditorMoreSheetProps/)?.[0] || '';
  assert.match(tools, /title="Công cụ"/);
  assert.match(tools, /<NoteTagManager mobile/);
  assert.doesNotMatch(tools, /Thêm hình ảnh|Đính kèm tệp/);
  for (const label of ['Ngày tạo', 'Cập nhật', 'Tệp đính kèm', 'Số từ', 'Ký tự', 'Thẻ']) assert.ok(sheets.includes(label));
});

test('mobile note-list action sheet retains its existing pin, move, archive, duplicate and trash callbacks', () => {
  assert.match(noteList, /<MobileNoteActionsSheet[\s\S]*?onTogglePin=\{onTogglePin\}[\s\S]*?onArchive=\{\(\) => handleArchive\(menuNote\)\}[\s\S]*?onMove=\{onMove\}[\s\S]*?onDuplicate=\{onDuplicate\}[\s\S]*?onTrash=/);
  assert.match(sheets, /export function MobileNoteActionsSheet/);
  for (const label of ['Ghim', 'Lưu trữ', 'Chuyển thư mục', 'Tạo bản sao', 'Chuyển vào thùng rác']) assert.ok(sheets.includes(label));
});

test('mobile editor More sheet reuses pin, move, archive, duplicate and delete actions', () => {
  assert.match(editor, /<MobileEditorMoreSheet[\s\S]*?onTogglePin=\{onTogglePin\}[\s\S]*?onArchive=\{onArchive\}[\s\S]*?onMove=\{onMove\}[\s\S]*?onDuplicate=\{onDuplicate\}[\s\S]*?onTrash=\{onTrash\}/);
  assert.match(sheets, /export function MobileEditorMoreSheet/);
  assert.match(sheets, /onTogglePin\(note\.id\)/);
  assert.match(sheets, /onMove\(note\.id, event\.target\.value \|\| null\)/);
  assert.match(sheets, /onTrash\(note\.id\)/);
  for (const label of ['Ghim', 'Lưu trữ', 'Di chuyển ghi chú', 'Tạo bản sao', 'Xóa']) assert.ok(sheets.includes(label));
});

test('mobile editor toolbar has exactly four primary actions and preserves the existing note creation and attachment flows', () => {
  const toolbar = editor.match(/<nav className="tanooki-mobile-editor-bottom-bar"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(toolbar);
  assert.equal((toolbar.match(/<button type="button"/g) || []).length, 4);
  assert.match(toolbar, /onClick=\{\(\) => mobileAttachmentInputRef\.current\?\.click\(\)\}/);
  assert.match(toolbar, /onClick=\{onCreateNote\}/);
  assert.match(app, /onCreateNote=\{createMobileNote\}/);
  assert.match(editor, /ref=\{mobileAttachmentInputRef\}[\s\S]*?type="file"[\s\S]*?onChange=\{handleFileSelect\}/);
});

test('mobile More menu removes unsupported placeholders and preserves working actions', () => {
  assert.match(editor, /onClick=\{\(\) => setMobileSheet\('actions'\)\} aria-label="Tùy chọn ghi chú"/);
  assert.match(editor, /<MobileEditorMoreSheet[\s\S]*?open=\{mobileSheet === 'actions'\} onClose=\{\(\) => setMobileSheet\(null\)\}/);
  for (const label of ['Bản quét', 'Khóa', 'Kết quả toán học', 'Đường kẻ &amp; lưới']) assert.ok(!sheets.includes(label), `${label} should not be offered`);
  assert.doesNotMatch(editor + sheets, /onPlaceholder|Sẽ hỗ trợ sau/);
  for (const label of ['Ghim', 'Tìm trong ghi chú', 'Di chuyển ghi chú', 'Ghi chú gần đây', 'Chế độ xem tệp đính kèm', 'Sử dụng nền sáng màu', 'Lưu trữ', 'Tạo bản sao', 'Xóa']) assert.ok(sheets.includes(label));
  assert.match(sheets, /onTogglePin\(note\.id\)/);
  assert.match(sheets, /onArchive\(note\.id, !note\.archived\)/);
  assert.match(sheets, /onMove\(note\.id, event\.target\.value \|\| null\)/);
  assert.match(sheets, /onDuplicate\(note\.id\)/);
  assert.match(sheets, /onTrash\(note\.id\)/);
  assert.match(editor, /tanooki-desktop-editor[\s\S]*?desktopPresentation && menuOpen/);
  assert.match(editor, /label="Chuyển vào thùng rác"/);
});

test('mobile note Share remains wired and its unsupported-device fallback is accurate', () => {
  assert.match(editor, /onClick=\{\(\) => \{ void handleShareNote\(\); \}\} aria-label="Chia sẻ ghi chú"/);
  assert.match(editor, /navigator\.share/);
  assert.match(editor, /navigator\.clipboard\?\.writeText/);
  assert.match(editor, /Thiết bị này không hỗ trợ chia sẻ trực tiếp\./);
  assert.doesNotMatch(editor, /Chia sẻ sẽ được hỗ trợ sau/);
});

test('desktop note menu retains its existing pin, archive, folder move and trash actions', () => {
  const desktopMenu = editor.match(/\{desktopPresentation && menuOpen && \([\s\S]*?\n            \)\}/)?.[0];
  assert.ok(desktopMenu);
  for (const label of ['Ghim', 'Bỏ ghim', 'Lưu trữ', 'Bỏ lưu trữ', 'Chuyển đến...', 'Chuyển vào thùng rác']) assert.ok(desktopMenu.includes(label));
  assert.doesNotMatch(desktopMenu, /Bản quét|Kết quả toán học|Đường kẻ &amp; lưới/);
});

test('mobile More menu remains an accessible bottom sheet', () => {
  assert.match(sheets, /title="Tùy chọn ghi chú" onClose=\{onClose\} labelledBy="mobile-note-actions"/);
  assert.match(editor, /execCommand\('undo'\)/);
  assert.match(editor, /execCommand\('redo'\)/);
  assert.match(editor, /is-light-paper/);
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
  assert.match(editor, /placeCaretAtBlankTap/);
  assert.match(editor, /target !== editor && target !== event\.currentTarget/);
  assert.match(editor, /range\.selectNodeContents\(editor\)/);
  assert.match(css, /\.tanooki-mobile-editor-scroll \{ display: flex; width: 100%; min-height: 0; flex: 1 1 0; flex-direction: column; overflow-y: auto; \}/);
  assert.match(css, /\.tanooki-mobile-editor-canvas \{ display: flex; width: 100%; min-width: 0; max-width: none; min-height: 100%; flex: 1 0 auto; flex-direction: column;/);
  assert.match(css, /\.tanooki-mobile-editor-canvas > \.note-content \{ width: 100%; min-width: 0; min-height: 0; flex: 1 0 auto;/);
  assert.doesNotMatch(css, /\.tanooki-mobile-editor > \.flex-1\.overflow-y-auto/);
  assert.doesNotMatch(css, /\.tanooki-mobile-editor-canvas(?: >)? \.note-content \{[^}]*min-height: 100%|\.tanooki-mobile-editor-canvas > \.note-content \{[^}]*min-height: 55vh/);
  assert.match(css, /@media \(min-width: 1400px\)[\s\S]*?\.tanooki-desktop-tools-panel \{ display: flex; \}/);
  assert.match(app, /<DesktopEditorToolsPanel/);
});

test('the editor keeps existing upload, media gesture and viewer functions with formatting in a separate sheet', () => {
  for (const existingHandler of ['handleImageUpload', 'handleFileUpload', 'onInlinePointerDown', 'onImagePointerDown', 'resizeImage', 'setImageViewer', 'handleDeleteAttachment']) assert.ok(editor.includes(existingHandler));
  assert.match(editor, /<MobileFormattingSheet open=\{mobileSheet === 'formatting'\}/);
  assert.match(editor, /imageInputRef=|ref=\{imageInputRef\}/);
  assert.match(editor, /ref=\{fileInputRef\}/);
});
