import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MOBILE_FORMATTING_GROUPS, setChecklistItemChecked } from '../src/lib/mobileFormatting.js';

const editor = await readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8');
const sheet = await readFile(new URL('../src/components/MobileFormattingSheet.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('formatting sheet offers the complete focused action set in four groups', () => {
  assert.deepEqual(MOBILE_FORMATTING_GROUPS.map((group) => group.label), ['Văn bản', 'Tiêu đề', 'Danh sách', 'Khối']);
  assert.deepEqual(MOBILE_FORMATTING_GROUPS.flatMap((group) => group.actions.map(({ id }) => id)), [
    'bold', 'italic', 'underline', 'strikeThrough', 'heading1', 'heading2', 'heading3',
    'insertUnorderedList', 'insertOrderedList', 'checklist', 'quote', 'code',
  ]);
  assert.match(sheet, /<MobileBottomSheet open=\{open\} title="Định dạng"/);
  assert.match(sheet, /aria-pressed=\{active\.has\(action\.id\)\}/);
});

test('mobile formatting commands map to browser rich-text commands and preserve selection across the sheet', () => {
  assert.match(editor, /document\.execCommand\(action\.command, false, action\.value\)/);
  assert.match(editor, /onPointerDown=\{rememberCaret\} onClick=\{\(\) => \{ rememberCaret\(\); refreshActiveFormatting\(\); setMobileSheet\('formatting'\); \}\}/);
  assert.match(editor, /restoreEditorSelection\(\)/);
  assert.match(editor, /queryCommandState\(command\)/);
  for (const [id, value] of [['heading1', '<h1>'], ['heading2', '<h2>'], ['heading3', '<h3>']]) {
    const action = MOBILE_FORMATTING_GROUPS.flatMap((group) => group.actions).find((item) => item.id === id);
    assert.equal(action.command, 'formatBlock');
    assert.equal(action.value, value);
  }
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

test('checklist and formatted content remain in the existing editable HTML without replacing the four-action toolbar', () => {
  assert.match(editor, /className=\{`note-content editor-content/);
  assert.match(editor, /<MobileFormattingSheet open=\{mobileSheet === 'formatting'\}/);
  const toolbar = editor.match(/<nav className="tanooki-mobile-editor-bottom-bar"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(toolbar);
  assert.equal((toolbar.match(/<button type="button"/g) || []).length, 4);
  assert.match(toolbar, /aria-label="Định dạng và checklist"/);
  assert.match(css, /\.note-content ul\[data-checklist\] > li/);
  assert.match(css, /\.note-content \.note-checklist-toggle:focus-visible/);
});
