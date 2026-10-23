import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MOBILE_FORMATTING_GROUPS, setChecklistItemChecked, shouldExitChecklistOnEnter } from '../src/lib/mobileFormatting.js';
import { getMobileFormattingTransition } from '../src/lib/mobileFormattingState.js';

const editor = await readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8');
const sheet = await readFile(new URL('../src/components/MobileFormattingSheet.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const inlineFormatting = await readFile(new URL('../src/lib/mobileInlineFormatting.js', import.meta.url), 'utf8');

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
  assert.match(editor, /commitEditor\(\);\s*refreshActiveFormatting\(\);/);
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
  assert.match(editor, /const obscuredHeight = window\.innerHeight - \(viewport\?\.height \?\? window\.innerHeight\) - \(viewport\?\.offsetTop \?\? 0\)/);
  assert.match(editor, /const keyboardOpen = isEditorFocused\(\) && obscuredHeight > 120/);
  assert.match(editor, /setMobileKeyboardViewport\(\(current\) => Math\.abs\(current\.height - nextViewport\.height\)/);
  assert.match(editor, /mobileKeyboardOpen && <button[\s\S]*?handleMobileFormat\('checklist'\)/);
  assert.match(editor, /is-keyboard-open/);
  assert.match(editor, /mobileKeyboardOpen && mobileKeyboardViewport\.height > 0 \? \{ position: 'fixed', top: `\$\{mobileKeyboardViewport\.offsetTop\}px`, right: 0, left: 0, height: `\$\{mobileKeyboardViewport\.height\}px` \} : \{\}/);
  assert.match(css, /\.tanooki-mobile-editor\.is-keyboard-open \.tanooki-mobile-editor-bottom-bar \{ padding-bottom: 5px; \}/);
  assert.match(editor, /!desktopPresentation && <MobileFormattingSheet/);
  assert.match(editor, /if \(desktopPresentation\) return;/);
  assert.match(css, /tanooki-mobile-editor\.is-keyboard-open \.tanooki-mobile-editor-bottom-bar \{ grid-template-columns: repeat\(5/);
  assert.match(css, /\.tanooki-mobile-format-toolbar-actions \{[^}]*overflow-x: auto/);
});

test('mobile editor toolbar controls preserve focus, keyboard close restores normal layout and desktop is unchanged', () => {
  const bottomBar = editor.match(/<nav className="tanooki-mobile-editor-bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.ok(bottomBar);
  assert.match(bottomBar, /onPointerDown=\{\(event\) => \{ event\.preventDefault\(\); rememberCaret\(\); \}\}/);
  assert.match(editor, /document\.addEventListener\('focusout', handleFocusChange\)/);
  assert.match(editor, /setMobileKeyboardOpen\(keyboardOpen\)/);
  assert.match(editor, /mobileKeyboardOpen && mobileKeyboardViewport\.height > 0 \? \{ position: 'fixed'[\s\S]*?: \{\}/);
  assert.match(editor, /desktopPresentation \? 'tanooki-desktop-editor'/);
});

test('formatting active states derive from the selected inline marks and containing block/list', () => {
  for (const selector of ['b,strong', 'i,em', 'u', 's,strike,del', 'ol', 'ul', 'h1', 'h2', 'h3', 'blockquote', 'pre']) {
    assert.ok(editor.includes(`element.closest('${selector}')`), `missing active-state lookup for ${selector}`);
  }
  assert.match(editor, /if \(isChecklist\) active\.add\('checklist'\)/);
  assert.match(sheet, /aria-pressed=\{active\.has\(action\.id\)\}/);
});

test('format transitions freely toggle inline, heading, list, checklist, quote and code states', () => {
  for (const action of ['bold', 'italic', 'underline', 'strikeThrough']) {
    assert.equal(getMobileFormattingTransition(action, [action]), 'toggle-off', `${action} should turn off when active`);
    assert.equal(getMobileFormattingTransition(action, []), 'toggle-on', `${action} should turn on when inactive`);
  }
  const combinedInlineState = ['bold', 'italic', 'underline'];
  assert.equal(getMobileFormattingTransition('bold', combinedInlineState), 'toggle-off');
  assert.deepEqual(combinedInlineState.filter((action) => action !== 'bold'), ['italic', 'underline'], 'removing Bold leaves the other active inline formats untouched');
  assert.equal(getMobileFormattingTransition('heading1', ['heading1']), 'clear-block');
  assert.equal(getMobileFormattingTransition('heading1', ['heading3']), 'switch-block');
  assert.equal(getMobileFormattingTransition('heading2', ['heading1']), 'switch-block');
  assert.equal(getMobileFormattingTransition('heading3', ['heading2']), 'switch-block');
  assert.equal(getMobileFormattingTransition('insertUnorderedList', ['insertUnorderedList']), 'clear-list');
  assert.equal(getMobileFormattingTransition('insertOrderedList', ['insertUnorderedList']), 'switch-list');
  assert.equal(getMobileFormattingTransition('checklist', ['insertUnorderedList']), 'switch-list');
  assert.equal(getMobileFormattingTransition('insertUnorderedList', ['checklist']), 'switch-list');
  assert.equal(getMobileFormattingTransition('insertOrderedList', ['checklist']), 'switch-list');
  assert.equal(getMobileFormattingTransition('checklist', ['checklist']), 'clear-list');
  assert.equal(getMobileFormattingTransition('quote', ['quote']), 'clear-block');
  assert.equal(getMobileFormattingTransition('code', ['code']), 'clear-block');
  assert.equal(getMobileFormattingTransition('code', ['quote']), 'switch-block');
  assert.match(editor, /action\.command === 'formatBlock' && transition === 'clear-block'[\s\S]*?replaceCurrentBlockWithParagraph\(currentBlock\)/);
  assert.match(editor, /if \(block\.tagName === 'BLOCKQUOTE'[\s\S]*?block\.replaceWith\(\.\.\.children\)/);
  assert.match(editor, /if \(currentList instanceof HTMLUListElement && currentList\.hasAttribute\('data-checklist'\)\) \{\s*removeChecklistFromList\(currentList\);\s*try \{ document\.execCommand\('insertUnorderedList'\)/);
  assert.match(editor, /currentList\.hasAttribute\('data-checklist'\) && \(actionId === 'insertUnorderedList' \|\| actionId === 'insertOrderedList'\)/);
});

test('all inline marks use explicit selected-range and collapsed-caret toggle paths', () => {
  const handler = editor.match(/const handleMobileFormat = \(actionId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(handler, /\['bold', 'italic', 'underline', 'strikeThrough'\]\.includes\(actionId\)/);
  assert.match(handler, /transition === 'toggle-off' && selectedRange && isInlineFormatAppliedToRange/);
  assert.match(handler, /removeInlineFormatFromRange\(editor, selectedRange, actionId, selection\)/);
  assert.match(handler, /applyInlineFormatToRange\(editor, selectedRange, actionId, selection\)/);
  assert.match(handler, /selection && savedRange\?\.collapsed/);
  assert.match(handler, /toggleCollapsedInlineFormat\(editor, savedRange, actionId, selection\)/);
  for (const [id, selector, tag] of [
    ['bold', 'b,strong', 'strong'], ['italic', 'i,em', 'em'], ['underline', 'u', 'u'], ['strikeThrough', 's,strike,del', 's'],
  ]) {
    assert.ok(inlineFormatting.includes(`${id}: { command:`));
    assert.ok(inlineFormatting.includes(`selector: '${selector}', tag: '${tag}'`));
  }
});

test('inline toggle preserves independent marks, moves collapsed caret out of the toggled wrapper, and cleans empty serialized tags', () => {
  assert.match(inlineFormatting, /const nestedMarks = \[\]/);
  assert.match(inlineFormatting, /const trailingContent = tail\.extractContents\(\)/);
  assert.match(inlineFormatting, /caret\.selectNodeContents\(caretContainer\)/);
  assert.match(inlineFormatting, /unwrapFormatNodes\(fragment, format\.selector\)/);
  assert.match(inlineFormatting, /if \(!text\.parentNode \|\| isInsideFormat\(text, fragment, format\.selector\)\) continue/);
  assert.match(inlineFormatting, /element\.remove\(\)/);
  assert.match(inlineFormatting, /caretContainer\.dataset\.noteInlineCaretBoundary = 'true'/);
  assert.match(inlineFormatting, /caret\.selectNodeContents\(caretContainer\)/);
  assert.match(inlineFormatting, /root\.querySelectorAll\('\[data-note-inline-caret-boundary\]'\)/);
  assert.match(inlineFormatting, /boundary\.before\(boundary\.firstChild\)/);
  assert.match(editor, /removeEmptyInlineFormats\(snapshot\)/);
  assert.match(editor, /const serialized = removeEmptyInlineFormats\(snapshot\)/);
});

test('collapsed Bold, Italic, Underline and Strikethrough toggle from the live DOM caret independently', () => {
  const handler = editor.match(/const handleMobileFormat = \(actionId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  for (const action of ['bold', 'italic', 'underline', 'strikeThrough']) {
    assert.ok(handler.includes(`'${action}'`));
    assert.ok(inlineFormatting.includes(`${action}: { command:`));
  }
  assert.match(handler, /const activeBefore = readActiveFormatting\(\)/);
  assert.match(handler, /selection && savedRange\?\.collapsed/);
  assert.match(handler, /toggleCollapsedInlineFormat\(editor, savedRange, actionId, selection\)/);
  assert.match(inlineFormatting, /let activeWrapper = element\?\.closest\(format\.selector\)/);
  assert.match(inlineFormatting, /nestedMarks\.unshift\(nested\)/);
  assert.match(inlineFormatting, /removeEmptyInlineFormats\(root\)/);
  assert.match(editor, /commitEditor\(\);\s*refreshActiveFormatting\(\)/);
});

test('inline active states are read from the current collapsed caret or the full selected text range', () => {
  assert.match(editor, /range\.collapsed \? isInlineFormatActiveAtNode\(editor, range\.startContainer, id\) : isInlineFormatAppliedToRange\(editor, range, id\)/);
  assert.match(inlineFormatting, /if \(!isInsideFormat\(textNode, editor, format\.selector\)\) return false/);
  assert.match(editor, /commitEditor\(\);\s*refreshActiveFormatting\(\)/);
});

test('format actions restore editor-owned selection, preserve it across actions and keep keyboard focus', () => {
  assert.match(editor, /const selectedRange = savedRange && !savedRange\.collapsed \? savedRange\.cloneRange\(\) : null/);
  assert.match(editor, /selection\.removeAllRanges\(\);\s*selection\.addRange\(selectedRange\)/);
  assert.match(editor, /lastCaretRange\.current = selectedRange\.cloneRange\(\)/);
  assert.match(editor, /restoreEditorSelection\(\)/);
  assert.match(editor, /document\.execCommand\(action\.command, false, action\.value\)/);
  assert.match(editor.match(/const handleMobileFormat = \(actionId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? '', /commitEditor\(\)/);
  assert.doesNotMatch(editor.match(/const handleMobileFormat = \(actionId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? '', /innerHTML\s*=/);
  assert.match(editor, /onBeforeFormat=\{rememberCaret\}/);
  assert.match(sheet, /onPointerDown=\{\(event\) => \{ event\.preventDefault\(\); onBeforeFormat\?\.\(\); \}\}/);
  assert.match(editor, /setMobileKeyboardOpen\(keyboardOpen\)/);
  assert.doesNotMatch(editor.match(/const handleMobileFormat = \(actionId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? '', /setMobileSheet\(null\)/);
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
  assert.match(editor, /if \(shouldExit\) \{[\s\S]*?list\.replaceWith\(paragraph\)/);
  assert.match(editor, /snapshot\.innerHTML = editorRef\.current\.innerHTML/);
  assert.match(editor, /withLayout\(writeManagedTags\(serialized/);
  assert.match(editor, /editorRef\.current\.innerHTML = stripLayout\(note\.content \?\? ''\)/);
});

test('checklist Enter exits only on an actually empty collapsed row', () => {
  assert.equal(shouldExitChecklistOnEnter({ text: '', selectionCollapsed: true }), true);
  assert.equal(shouldExitChecklistOnEnter({ text: '   ', selectionCollapsed: true }), true);
  assert.equal(shouldExitChecklistOnEnter({ text: '\u00a0', selectionCollapsed: true }), true);
  assert.equal(shouldExitChecklistOnEnter({ text: 'Item 1', selectionCollapsed: true }), false);
  assert.equal(shouldExitChecklistOnEnter({ text: '', selectionCollapsed: false }), false, 'selecting all text does not count as an empty row');
  assert.equal(shouldExitChecklistOnEnter({ text: '', hasMedia: true, selectionCollapsed: true }), false);
  const enter = editor.match(/const handleChecklistEnter: React\.KeyboardEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(enter, /liveRange && editor\?\.contains\(liveRange\.startContainer\)/);
  assert.match(enter, /prepareChecklistItem\(item\)/);
  assert.match(enter, /const shouldExit = shouldExitChecklistOnEnter/);
  assert.ok(enter.indexOf('shouldExitChecklistOnEnter') < enter.indexOf('range.deleteContents()'), 'classify the original row before deleting a selection');
  assert.match(enter, /nextItem\.append\(makeChecklistToggle\(false\), nextText\)/);
  assert.match(enter, /item\.after\(nextItem\)/);
  assert.match(enter, /caret\.setStart\(nextText, 0\)/);
  assert.match(enter, /lastCaretRange\.current = caret\.cloneRange\(\)/);
});

test('checklist normalization restores the single checkbox-plus-text row structure for loaded and edited notes', () => {
  const prepare = editor.match(/const prepareChecklistItem = \(item: HTMLLIElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(prepare, /const originalChildren = Array\.from\(item\.childNodes\)/);
  assert.match(prepare, /text\.replaceChildren\(\.\.\.content\)/);
  assert.match(prepare, /item\.replaceChildren\(toggle, text\)/);
  assert.match(editor, /for \(const list of Array\.from\(editor\.querySelectorAll\('ul\[data-checklist\]'\)\)\)/);
  assert.match(editor, /prepareChecklistItem\(child\)/);
  assert.match(editor, /normalizeChecklistMarkup\(editorRef\.current\)/);
  assert.match(editor, /snapshot\.innerHTML = editorRef\.current\.innerHTML/);
  assert.match(editor, /commitEditor\(\);\s*rememberCaret\(\);\s*refreshActiveFormatting\(\)/);
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
