import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MOBILE_FORMATTING_GROUPS, setChecklistItemChecked } from '../src/lib/mobileFormatting.js';

const editor = await readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8');
const sheet = await readFile(new URL('../src/components/MobileFormattingSheet.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('compact formatting toolbar offers the complete focused action set with accessible active states', () => {
  assert.deepEqual(MOBILE_FORMATTING_GROUPS.map((group) => group.label), ['Văn bản', 'Tiêu đề', 'Danh sách', 'Khối']);
  assert.deepEqual(MOBILE_FORMATTING_GROUPS.flatMap((group) => group.actions.map(({ id }) => id)), [
    'bold', 'italic', 'underline', 'strikeThrough', 'heading1', 'heading2', 'heading3',
    'insertUnorderedList', 'insertOrderedList', 'checklist', 'quote', 'code',
  ]);
  assert.match(sheet, /role="toolbar" aria-label="Định dạng văn bản"/);
  assert.doesNotMatch(sheet, /MobileBottomSheet|Tùy chọn ghi chú/);
  assert.match(sheet, /aria-pressed=\{active\.has\(action\.id\)\}/);
  assert.match(sheet, /Thu gọn định dạng/);
});

test('mobile formatting commands map to browser rich-text commands and preserve selection across the sheet', () => {
  assert.match(editor, /document\.execCommand\(action\.command, false, action\.value\)/);
  assert.match(editor, /setMobileSheet\(\(current\) => current === 'formatting' \? null : 'formatting'\)/);
  assert.match(editor, /aria-label="Định dạng \(Aa\)"/);
  assert.match(editor, /restoreEditorSelection\(\)/);
  assert.match(editor, /queryCommandState\(command\)/);
  const commands = Object.fromEntries(MOBILE_FORMATTING_GROUPS.flatMap((group) => group.actions.map(({ id, command }) => [id, command])));
  assert.deepEqual(commands, {
    bold: 'bold', italic: 'italic', underline: 'underline', strikeThrough: 'strikeThrough',
    heading1: 'formatBlock', heading2: 'formatBlock', heading3: 'formatBlock',
    insertUnorderedList: 'insertUnorderedList', insertOrderedList: 'insertOrderedList', checklist: 'checklist',
    quote: 'formatBlock', code: 'formatBlock',
  });
  assert.match(editor, /commitEditor\(\);\s*rememberCaret\(\);\s*refreshActiveFormatting\(\);/);
  assert.doesNotMatch(editor.match(/const handleMobileFormat = \(actionId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? '', /setMobileSheet\(null\)/);
  for (const [id, value] of [['heading1', '<h1>'], ['heading2', '<h2>'], ['heading3', '<h3>']]) {
    const action = MOBILE_FORMATTING_GROUPS.flatMap((group) => group.actions).find((item) => item.id === id);
    assert.equal(action.command, 'formatBlock');
    assert.equal(action.value, value);
  }
});

test('mobile formatting saves editor-owned connected ranges and tracks selection changes while the sheet is open', () => {
  assert.match(editor, /!editor\.contains\(selection\.anchorNode\) \|\| !editor\.contains\(selection\.focusNode\)/);
  assert.match(editor, /range\.startContainer\.isConnected && range\.endContainer\.isConnected/);
  assert.match(editor, /lastCaretRange\.current = range\.cloneRange\(\)/);
  assert.match(editor, /document\.addEventListener\('selectionchange', handleSelectionChange\)/);
  assert.match(editor, /if \(mobileSheet === 'formatting'\) refreshActiveFormatting\(\)/);
  assert.match(editor, /editor\.focus\(\{ preventScroll: true \}\)/);
});

test('keyboard-aware mobile toolbar exposes Aa and Checklist while preserving desktop rendering', () => {
  assert.match(editor, /window\.visualViewport/);
  assert.match(editor, /setMobileKeyboardOpen\(isEditorFocused\(\) && obscuredHeight > 120\)/);
  assert.match(editor, /mobileKeyboardOpen && <button[\s\S]*?handleMobileFormat\('checklist'\)/);
  assert.match(editor, /is-keyboard-open/);
  assert.match(editor, /!desktopPresentation && <MobileFormattingSheet/);
  assert.match(editor, /if \(desktopPresentation\) return;/);
  assert.match(css, /tanooki-mobile-editor\.is-keyboard-open \.tanooki-mobile-editor-bottom-bar \{ grid-template-columns: repeat\(5/);
  assert.match(css, /\.tanooki-mobile-format-toolbar-actions \{[^}]*overflow-x: auto/);
});

test('formatting active states derive from the selected inline marks and containing block/list', () => {
  for (const selector of ['b,strong', 'i,em', 'u', 's,strike,del', 'ol', 'ul', 'h1', 'h2', 'h3', 'blockquote', 'pre']) {
    assert.ok(editor.includes(`element.closest('${selector}')`), `missing active-state lookup for ${selector}`);
  }
  assert.match(editor, /if \(isChecklist\) active\.add\('checklist'\)/);
  assert.match(sheet, /aria-pressed=\{active\.has\(action\.id\)\}/);
});

test('checklist state is accessible, toggles on its list item, and survives editor save and hydration', () => {
  const attributes = new Map();
  const controlAttributes = new Map();
  const item = {
    setAttribute: (key, value) => attributes.set(key, value),
    querySelector: () => ({ setAttribute: (key, value) => controlAttributes.set(key, value) }),
  };
  assert.equal(setChecklistItemChecked(item, true), true);
  assert.equal(attributes.get('data-checked'), 'true');
  assert.equal(controlAttributes.get('aria-checked'), 'true');
  assert.equal(controlAttributes.get('aria-label'), 'Bỏ đánh dấu mục');
  assert.equal(setChecklistItemChecked(item, false), false);
  assert.equal(attributes.get('data-checked'), 'false');
  assert.equal(controlAttributes.get('aria-checked'), 'false');

  assert.match(editor, /list\.dataset\.checklist = 'true'/);
  assert.match(editor, /dataset\.noteChecklistToggle = 'true'/);
  assert.match(editor, /setChecklistItemChecked\(item, item\.dataset\.checked !== 'true'\)/);
  assert.match(editor, /handleChecklistEnter/);
  assert.match(editor, /item\.after\(nextItem\)/);
  assert.match(editor, /if \(empty\) \{[\s\S]*?list\.replaceWith\(paragraph\)/);
  assert.match(editor, /withLayout\(writeManagedTags\(editorRef\.current\.innerHTML/);
  assert.match(editor, /editorRef\.current\.innerHTML = stripLayout\(note\.content \?\? ''\)/);
});

test('checklist and formatted content remain in the existing editable HTML and mobile actions reuse the editor toolbar', () => {
  assert.match(editor, /className=\{`note-content editor-content/);
  assert.match(editor, /<MobileFormattingSheet open=\{mobileSheet === 'formatting'\}/);
  const toolbar = editor.match(/<nav className="tanooki-mobile-editor-bottom-bar"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(toolbar);
  assert.equal((toolbar.match(/<button type="button"/g) || []).length, 5);
  for (const action of ['Định dạng (Aa)', 'Checklist', 'Đính kèm', 'Vẽ và đánh dấu', 'Tạo ghi chú mới']) assert.ok(toolbar.includes(action));
  assert.match(toolbar, /mobileKeyboardOpen && <button/);
  assert.match(css, /\.note-content ul\[data-checklist\] > li/);
  assert.match(css, /\.note-content \.note-checklist-toggle:focus-visible/);
});
