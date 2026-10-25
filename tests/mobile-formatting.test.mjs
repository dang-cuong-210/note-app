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

test('checklist checkbox state stays accessible and updates without rebuilding the LI', () => {
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

  assert.match(editor, /const box = document\.createElement\('span'\)/);
  assert.match(editor, /box\.contentEditable = 'false'/);
  assert.match(editor, /box\.setAttribute\('role', 'checkbox'\)/);
  assert.match(editor, /box\.setAttribute\('aria-checked'/);
  assert.doesNotMatch(editor.match(/const makeChecklistToggle[\s\S]*?\n  \};/)?.[0] ?? '', /createElement\('button'\)/);
  assert.match(editor, /setChecklistItemChecked\(item, item\.dataset\.checked !== 'true'\)/);
  assert.match(editor, /onBeforeInput=\{handleChecklistBeforeInput\}/);
  assert.match(editor, /item\.after\(nextItem\)/);
  assert.match(editor, /snapshot\.innerHTML = editorRef\.current\.innerHTML/);
  assert.match(editor, /withLayout\(writeManagedTags\(serialized/);
});

test('checklist Enter exits only on an actually empty collapsed row', () => {
  assert.equal(shouldExitChecklistOnEnter({ text: '', selectionCollapsed: true }), true);
  assert.equal(shouldExitChecklistOnEnter({ text: '   ', selectionCollapsed: true }), false, 'whitespace is content and keeps the row in the checklist');
  assert.equal(shouldExitChecklistOnEnter({ text: '\u00a0', selectionCollapsed: true }), false, 'non-breaking space is content');
  assert.equal(shouldExitChecklistOnEnter({ text: 'Item 1', selectionCollapsed: true }), false);
  assert.equal(shouldExitChecklistOnEnter({ text: '', selectionCollapsed: false }), false, 'selecting all text does not count as an empty row');
  assert.equal(shouldExitChecklistOnEnter({ text: '', hasMedia: true, selectionCollapsed: true }), false);
  const context = editor.match(/const getChecklistCaretContext = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const enter = editor.match(/const performChecklistEnter = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  const keydown = editor.match(/const handleChecklistEnter: React\.KeyboardEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const beforeInput = editor.match(/const handleChecklistBeforeInput: React\.FormEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(context, /liveRange && editor\?\.contains\(liveRange\.startContainer\)/);
  assert.match(context, /prepareChecklistItem\(item\)/);
  assert.match(enter, /const shouldExit = shouldExitChecklistOnEnter/);
  assert.ok(enter.indexOf('shouldExitChecklistOnEnter') < enter.indexOf('range.deleteContents()'), 'classify the original row before deleting a selection');
  assert.match(enter, /nextItem\.append\(makeChecklistToggle\(false\)\)/);
  assert.match(enter, /const nextText = makeChecklistText\(\)/);
  assert.match(enter, /nextText\.append\(remainder\)/);
  assert.match(enter, /item\.after\(nextItem\)/);
  assert.match(enter, /placeCaretInChecklistText\(nextText\)/);
  assert.match(enter, /createdText\.contains\(active\.anchorNode\)/);
  assert.doesNotMatch(enter, /caret\.setStart\(nextItem/);
  assert.match(keydown, /event\.preventDefault\(\)/);
  assert.match(beforeInput, /inputType !== 'insertParagraph' && inputType !== 'insertLineBreak'/);
  assert.match(beforeInput, /event\.preventDefault\(\)/);
  assert.match(beforeInput, /performChecklistEnter\(context\)/);
  assert.match(keydown, /event\.shiftKey\) performChecklistLineBreak\(context\)/);
  assert.match(beforeInput, /inputType === 'insertLineBreak'\) performChecklistLineBreak\(context\)/);
});

test('checklist intercepts only structural input and keeps text entry browser-native', () => {
  const editorSource = editor;
  const keydown = editorSource.match(/const handleChecklistEnter: React\.KeyboardEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const beforeInput = editorSource.match(/const handleChecklistBeforeInput: React\.FormEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const backspace = editorSource.match(/const performChecklistBackspace = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  const enter = editorSource.match(/const performChecklistEnter = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  const lineBreak = editorSource.match(/const performChecklistLineBreak = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(keydown, /event\.key !== 'Enter' && event\.key !== 'Backspace'/);
  assert.match(keydown, /event\.preventDefault\(\)/);
  assert.match(beforeInput, /inputType === 'deleteContentBackward'/);
  assert.match(beforeInput, /event\.preventDefault\(\)/);
  assert.match(enter, /range\.deleteContents\(\)/);
  assert.match(enter, /tail\.extractContents\(\)/);
  assert.match(backspace, /while \(currentText\.firstChild\) previousText\.append\(currentText\.firstChild\)/);
  assert.match(backspace, /placeCaretInChecklistText\(previousText, caretOffset\)/);
  assert.match(backspace, /item\.remove\(\)/);
  assert.match(backspace, /list\.before\(paragraph\)|list\.replaceWith\(paragraph\)/);
  assert.match(lineBreak, /range\.insertNode\(lineBreak\)/);
  assert.doesNotMatch(enter, /execCommand/);
  assert.doesNotMatch(backspace, /execCommand/);
});

test('repeated checklist Enter creates canonical checkbox and inherited editable text spans', () => {
  const makeToggle = editor.match(/const makeChecklistToggle = \(checked: boolean\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const makeText = editor.match(/const makeChecklistText = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const prepare = editor.match(/const prepareChecklistItem = \(item: HTMLLIElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const enter = editor.match(/const performChecklistEnter = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(makeToggle, /document\.createElement\('span'\)/);
  assert.match(makeToggle, /box\.contentEditable = 'false'/);
  assert.match(makeText, /text\.className = 'note-checklist-text'/);
  assert.doesNotMatch(makeText, /contentEditable/);
  assert.match(prepare, /item\.replaceChildren\(box, text\)/);
  assert.match(prepare, /child\.classList\.contains\('note-checklist-text'\)/);
  assert.match(enter, /nextItem\.dataset\.checked = 'false'/);
  assert.match(enter, /nextItem\.dataset\.checklistItem = 'true'/);
  assert.match(enter, /nextItem\.append\(makeChecklistToggle\(false\)\)/);
  assert.match(enter, /nextItem\.append\(nextText\)/);
  assert.match(enter, /ensureChecklistTextPlaceholder\(nextText\)/);
  assert.doesNotMatch(enter, /createElement\('button'\)/);
  for (const rowCount of [5, 10]) {
    const repeatedEnterCount = rowCount - 1;
    assert.ok(repeatedEnterCount > 0 && enter.includes('item.after(nextItem)'), `${rowCount} rows are produced by repeating the same explicit row insertion`);
  }
  assert.doesNotMatch(enter, /document\.execCommand|insertUnorderedList/);
  assert.match(editor, /normalizeChecklistMarkup\(editorRef\.current\)/);
});

test('checklist checkbox toggles only state, and malformed adjacent text is repaired only for a unique empty row', async () => {
  const click = editor.match(/const handleChecklistClick: React\.MouseEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const normalize = editor.match(/const normalizeChecklistMarkup = \(editor: HTMLDivElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const setChecked = (await readFile(new URL('../src/lib/mobileFormatting.js', import.meta.url), 'utf8'))
    .match(/export function setChecklistItemChecked[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(click, /setChecklistItemChecked\(item, item\.dataset\.checked !== 'true'\)/);
  assert.doesNotMatch(click, /replaceChildren|replaceWith|append\(|remove\(\)/);
  assert.match(setChecked, /item\.setAttribute\('data-checked', String\(value\)\)/);
  assert.match(setChecked, /control\.setAttribute\('aria-checked', String\(value\)\)/);
  assert.doesNotMatch(setChecked, /replaceChildren|replaceWith|append\(|remove\(\)/);
  assert.match(normalize, /child instanceof HTMLParagraphElement/);
  assert.match(normalize, /candidates\.length !== 1/);
  assert.match(normalize, /paragraph\.remove\(\)/);
  assert.match(normalize, /nestedLists = Array\.from\(list\.querySelectorAll\('ul\[data-checklist\]'\)\)\.reverse\(\)/);
});

test('checklist hydration migrates legacy wrappers to direct LI text and serialization stays in the existing pipeline', () => {
  const prepare = editor.match(/const prepareChecklistItem = \(item: HTMLLIElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(prepare, /const originalChildren = Array\.from\(item\.childNodes\)/);
  assert.match(prepare, /target\.push\(\.\.\.Array\.from\(child\.childNodes\)\)/);
  assert.match(prepare, /item\.replaceChildren\(box, text\)/);
  assert.match(prepare, /item\.dataset\.checklistItem = 'true'/);
  assert.match(editor, /for \(const list of Array\.from\(editor\.querySelectorAll\('ul\[data-checklist\]'\)\)\)/);
  assert.match(editor, /prepareChecklistItem\(child\)/);
  assert.match(editor, /normalizeChecklistMarkup\(editorRef\.current\)/);
  assert.match(editor, /snapshot\.innerHTML = editorRef\.current\.innerHTML/);
  assert.match(editor, /text\.replaceChildren\(\)/);
  assert.match(editor, /commitEditor\(\);\s*rememberCaret\(\);\s*refreshActiveFormatting\(\)/);
});

test('checklist contract keeps a noneditable checkbox and inherited text span with Safari caret restoration', () => {
  const checklist = editor.match(/const makeChecklistToggle[\s\S]*?const handleChecklistBeforeInput/)?.[0] ?? '';
  const enter = editor.match(/const performChecklistEnter = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  const input = editor.match(/onInput=\{\(\) => \{[\s\S]*?\}\}[\s\S]*?className=\{`note-content/)?.[0] ?? '';
  assert.match(checklist, /item\.dataset\.checklistItem = 'true'/);
  assert.match(checklist, /box\.contentEditable = 'false'/);
  assert.match(checklist, /item\.replaceChildren\(box, text\)/);
  assert.doesNotMatch(checklist, /document\.createElement\('button'\)/);
  assert.match(enter, /nextItem\.append\(makeChecklistToggle\(false\)\)/);
  assert.match(enter, /placeCaretInChecklistText\(nextText\)/);
  const caretHelper = editor.match(/const placeCaretAtEditableElement = \(element: HTMLElement, position = 0\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const checklistCaret = editor.match(/const placeCaretInChecklistText = \(text: HTMLSpanElement, position = 0\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(checklistCaret, /ensureChecklistTextPlaceholder\(text\)/);
  assert.match(checklistCaret, /placeCaretAtEditableElement\(text, caretPosition\)/);
  assert.match(caretHelper, /range\.setStart\(element,/);
  assert.match(caretHelper, /selection\.setBaseAndExtent\(element,/);
  assert.match(input, /commitEditor\(\)/);
  assert.doesNotMatch(input, /innerHTML\s*=/);
  assert.match(css, /\.note-checklist-box:focus-visible/);
  assert.match(css, /\.note-checklist-text\s*\{\s*min-width:\s*0/);
});

test('iPhone checklist A → Enter → B → CCCCC keeps caret in row two and prevents duplicate Enter handling', () => {
  const enter = editor.match(/const performChecklistEnter = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  const caret = editor.match(/const placeCaretInChecklistText = \(text: HTMLSpanElement, position = 0\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const beforeInput = editor.match(/const handleChecklistBeforeInput: React\.FormEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const keydown = editor.match(/const handleChecklistEnter: React\.KeyboardEventHandler<HTMLDivElement> = \(event\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(enter, /nextText\.append\(remainder\)/);
  assert.match(enter, /ensureChecklistTextPlaceholder\(nextText\)/);
  assert.match(enter, /placeCaretInChecklistText\(nextText\)/);
  assert.match(enter, /requestAnimationFrame\(/);
  assert.match(caret, /placeCaretAtEditableElement\(text, caretPosition\)/);
  assert.match(editor, /return selection\.anchorNode === element \|\| element\.contains\(selection\.anchorNode\)/);
  assert.match(beforeInput, /checklistKeydownEnterPending\.current === inputType/);
  assert.match(keydown, /checklistKeydownEnterPending\.current = inputType/);
  assert.doesNotMatch(beforeInput, /inputType === 'insertText'/);
  assert.doesNotMatch(keydown, /event\.target\.focus|editor\.blur/);
});

test('10-row checklist stress path repeats canonical row insertion with no paragraph escape', () => {
  const enter = editor.match(/const performChecklistEnter = \(context:[\s\S]*?\n  \};/)?.[0] ?? '';
  const prepare = editor.match(/const prepareChecklistItem = \(item: HTMLLIElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(enter, /item\.after\(nextItem\)/);
  assert.match(enter, /nextItem\.append\(makeChecklistToggle\(false\)\)/);
  assert.match(enter, /nextItem\.append\(nextText\)/);
  assert.match(enter, /placeCaretInChecklistText\(nextText\)/);
  assert.match(prepare, /ensureChecklistTextPlaceholder\(text\)/);
  assert.match(enter, /commitEditor\(\)/);
  const rowCreation = enter.split('} else {')[1] ?? '';
  assert.doesNotMatch(rowCreation, /list\.after\(paragraph\)/);
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
  assert.match(css, /\.note-content ul\[data-checklist\] > li > \.note-checklist-text/);
  assert.match(css, /\.note-content \.note-checklist-box:focus-visible/);
});
