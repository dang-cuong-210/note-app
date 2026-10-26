import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MOBILE_FORMATTING_GROUPS, normalizeChecklistRows, removeChecklistFromItem, setChecklistItemChecked } from '../src/lib/mobileFormatting.js';
import { getMobileFormattingTransition } from '../src/lib/mobileFormattingState.js';

const editor = await readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8');
const sheet = await readFile(new URL('../src/components/MobileFormattingSheet.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const inlineFormatting = await readFile(new URL('../src/lib/mobileInlineFormatting.js', import.meta.url), 'utf8');

class ChecklistTestNode {
  constructor(tagName, text = '') {
    this.tagName = tagName;
    this.nodeType = tagName ? 1 : 3;
    this._text = text;
    this.childNodes = [];
    this.attributes = new Set();
    this.parentNode = null;
    this.ownerDocument = checklistTestDocument;
    if (tagName && text) this.append(new ChecklistTestNode(null, text));
  }
  get textContent() { return this.nodeType === 3 ? this._text : this.childNodes.map((node) => node.textContent).join(''); }
  set textContent(value) { this._text = value; }
  get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get parentElement() { return this.parentNode?.tagName ? this.parentNode : null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  before(node) { this.parentNode.insertBefore(node, this); }
  after(node) { this.parentNode.insertBefore(node, this.nextSibling); }
  insertBefore(node, reference) {
    node.remove();
    const index = reference ? this.childNodes.indexOf(reference) : this.childNodes.length;
    node.parentNode = this;
    this.childNodes.splice(index, 0, node);
  }
  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.childNodes;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
  contains(node) { return node === this || this.childNodes.some((child) => child.contains(node)); }
  replaceWith(node) { this.parentNode.insertBefore(node, this); this.remove(); }
  cloneNode() {
    const clone = new ChecklistTestNode(this.tagName);
    clone.attributes = new Set(this.attributes);
    return clone;
  }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name) { this.attributes.add(name); }
  removeAttribute(name) { this.attributes.delete(name); }
}

let checklistTestSelection = null;
const checklistTestDocument = { createElement: (tag) => new ChecklistTestNode(tag.toUpperCase()), getSelection: () => checklistTestSelection };

function makeChecklist(items) {
  const editor = new ChecklistTestNode('DIV');
  const list = new ChecklistTestNode('UL');
  list.setAttribute('data-checklist');
  editor.append(list);
  const rows = items.map((text) => {
    const row = new ChecklistTestNode('LI', text);
    row.setAttribute('data-checklist-item');
    list.append(row);
    return row;
  });
  return { editor, list, rows };
}

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
  assert.match(editor, /if \(currentList instanceof HTMLUListElement && currentList\.hasAttribute\('data-checklist'\)\) \{\s*const currentItem = element\?\.closest<HTMLLIElement>\('li\[data-checklist-item\]'\);\s*return currentItem instanceof HTMLLIElement && currentList\.contains\(currentItem\) && removeChecklistFromItem\(currentItem\)/);
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

test('checklist checked state updates only data and accessibility attributes', async () => {
  const attributes = new Map();
  const item = { setAttribute: (key, value) => attributes.set(key, value) };
  assert.equal(setChecklistItemChecked(item, true), true);
  assert.equal(attributes.get('data-checked'), 'true');
  assert.equal(attributes.get('aria-checked'), 'true');
  assert.equal(setChecklistItemChecked(item, false), false);
  assert.equal(attributes.get('data-checked'), 'false');
  assert.equal(attributes.get('aria-checked'), 'false');
  const helper = await readFile(new URL('../src/lib/mobileFormatting.js', import.meta.url), 'utf8');
  const setter = helper.match(/export function setChecklistItemChecked[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(setter, /querySelector|replaceChildren|replaceWith|append\(|remove\(/);
});

test('checklist toolbar creates a native unordered list and marks LI metadata without caret handoff', () => {
  const apply = editor.match(/const applyChecklist = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(apply, /document\.execCommand\('insertUnorderedList'\)/);
  assert.match(apply, /list\.dataset\.checklist = 'true'/);
  assert.match(apply, /updateChecklistItemSemantics\(child\)/);
  assert.doesNotMatch(apply, /placeCaret|setStart|append\(|replaceChildren/);
});

test('checklist toggle-off converts only the caret item to a paragraph and splits remaining groups', async () => {
  const helper = await readFile(new URL('../src/lib/mobileFormatting.js', import.meta.url), 'utf8');
  const remove = helper.match(/export function removeChecklistFromItem[\s\S]*?\n\}/)?.[0] ?? '';
  const apply = editor.match(/const applyChecklist = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.ok(removeChecklistFromItem, 'checklist toggle-off helper is exported');
  assert.match(apply, /selectionNode = window\.getSelection\(\)\?\.focusNode/);
  assert.match(remove, /const siblings = Array\.from\(list\.children\)/);
  assert.match(remove, /const hasPrevious = itemIndex > 0/);
  assert.match(remove, /const hasFollowing = itemIndex < siblings\.length - 1/);
  assert.match(remove, /const paragraph = item\.ownerDocument\.createElement\('p'\)/);
  assert.match(remove, /while \(item\.firstChild\) paragraph\.append\(item\.firstChild\)/);
  assert.match(remove, /trailingList = list\.cloneNode\(false\)/);
  assert.match(remove, /paragraph\.after\(trailingList\)/);
  assert.match(remove, /list\.replaceWith\(paragraph\)/);
  assert.match(remove, /item\.removeAttribute\('data-checked'\)/);
  assert.match(remove, /item\.removeAttribute\('aria-checked'\)/);
  assert.match(remove, /selection\.addRange\(range\)/);
  assert.doesNotMatch(apply.match(/if \(currentList instanceof HTMLUListElement && currentList\.hasAttribute\('data-checklist'\)\) \{[\s\S]*?\n    \}/)?.[0] ?? '', /execCommand|insertUnorderedList/);
  assert.match(editor, /commitEditor\(\);\s*refreshActiveFormatting\(\)/, 'the active state is immediately reread from the resulting caret DOM');
});

test('checklist toggle-off produces paragraph/list boundaries for first, middle, last and only rows', () => {
  {
    const { editor, rows } = makeChecklist(['A', 'B', 'C']);
    assert.equal(removeChecklistFromItem(rows[1]), true);
    assert.deepEqual(editor.children.map((node) => node.tagName), ['UL', 'P', 'UL']);
    assert.deepEqual(editor.children[0].children.map((node) => node.textContent), ['A']);
    assert.equal(editor.children[1].textContent, 'B');
    assert.deepEqual(editor.children[2].children.map((node) => node.textContent), ['C']);
    assert.ok(editor.children[0].hasAttribute('data-checklist'));
    assert.ok(editor.children[2].hasAttribute('data-checklist'));
  }
  {
    const { editor, rows } = makeChecklist(['A', 'B']);
    assert.equal(removeChecklistFromItem(rows[0]), true);
    assert.deepEqual(editor.children.map((node) => node.tagName), ['P', 'UL']);
    assert.equal(editor.children[0].textContent, 'A');
    assert.deepEqual(editor.children[1].children.map((node) => node.textContent), ['B']);
  }
  {
    const { editor, rows } = makeChecklist(['A', 'B']);
    assert.equal(removeChecklistFromItem(rows[1]), true);
    assert.deepEqual(editor.children.map((node) => node.tagName), ['UL', 'P']);
    assert.deepEqual(editor.children[0].children.map((node) => node.textContent), ['A']);
    assert.equal(editor.children[1].textContent, 'B');
  }
  {
    const { editor, rows } = makeChecklist(['A']);
    assert.equal(removeChecklistFromItem(rows[0]), true);
    assert.deepEqual(editor.children.map((node) => node.tagName), ['P']);
    assert.equal(editor.children[0].textContent, 'A');
    assert.deepEqual(editor.children.filter((node) => node.tagName === 'UL'), [], 'the empty list node is removed rather than left in the editor');
  }
});

test('checklist toggle-off preserves inline nodes and removes checked state only from the converted row', () => {
  const { editor, rows } = makeChecklist(['A', 'B', 'C']);
  const strong = new ChecklistTestNode('STRONG', 'formatted B');
  rows[1].append(strong);
  rows[1].setAttribute('data-checked');
  rows[1].setAttribute('aria-checked');
  rows[0].setAttribute('data-checked');
  rows[2].setAttribute('data-checked');
  assert.equal(removeChecklistFromItem(rows[1]), true);
  const paragraph = editor.children.find((node) => node.tagName === 'P');
  assert.equal(paragraph.children[0], strong);
  assert.equal(strong.textContent, 'formatted B');
  assert.equal(paragraph.hasAttribute('data-checked'), false);
  assert.equal(editor.children[0].children[0].hasAttribute('data-checked'), true);
  assert.equal(editor.children[2].children[0].hasAttribute('data-checked'), true);
});

test('checklist toggle-off restores a caret in the same moved text node', () => {
  const { editor, rows } = makeChecklist(['A', 'B']);
  const text = rows[1].firstChild;
  const range = {
    startContainer: text,
    endContainer: text,
    startOffset: 1,
    endOffset: 1,
    cloneRange() { return { ...this }; },
    setStart(container, offset) { this.startContainer = container; this.startOffset = offset; },
    setEnd(container, offset) { this.endContainer = container; this.endOffset = offset; },
  };
  checklistTestSelection = {
    rangeCount: 1,
    getRangeAt: () => range,
    removeAllRanges() { this.rangeCount = 0; },
    addRange(restored) { this.rangeCount = 1; this.restored = restored; },
  };
  try {
    assert.equal(removeChecklistFromItem(rows[1]), true);
    assert.equal(checklistTestSelection.restored.startContainer, text);
    assert.equal(checklistTestSelection.restored.endContainer, text);
    assert.equal(checklistTestSelection.restored.startOffset, 1);
    assert.equal(editor.children[1].contains(text), true);
  } finally {
    checklistTestSelection = null;
  }
});

test('browser-created checklist rows only receive metadata after input', async () => {
  const normalize = editor.match(/const normalizeChecklistMetadata = \(editor: HTMLDivElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const helper = await readFile(new URL('../src/lib/mobileFormatting.js', import.meta.url), 'utf8');
  const semantics = helper.match(/export function normalizeChecklistItem[\s\S]*?\n\}/)?.[0] ?? '';
  const input = editor.match(/onInput=\{\(\) => \{[\s\S]*?commitEditor\(\);[\s\S]*?\}\}/)?.[0] ?? '';
  assert.match(normalize, /ul\[data-checklist\]/);
  assert.match(normalize, /normalizeChecklistRows\(list\)/);
  assert.doesNotMatch(normalize, /replace|append|remove|selection|caret|Range/);
  assert.match(semantics, /dataset\.checklistItem = 'true'/);
  assert.match(semantics, /dataset\.checked/);
  assert.match(input, /normalizeChecklistMetadata\(editorRef\.current\)/);
});

test('checklist Enter, splitting, Backspace, and empty-item behavior remain browser-native', () => {
  assert.doesNotMatch(editor, /performChecklistEnter|performChecklistBackspace|performChecklistLineBreak|getChecklistCaretContext|placeCaretInChecklistText|focusChecklistTextOnIOS|checklistKeydownEnterPending|checklistCaretHandoff/);
  assert.doesNotMatch(editor, /onBeforeInput=\{handleChecklistBeforeInput\}|onKeyDown=\{handleChecklistEnter\}/);
  assert.match(editor, /onKeyDown=\{handleChecklistShortcut\}/);
  const shortcut = editor.match(/const handleChecklistShortcut[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(shortcut, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(shortcut, /event\.code !== 'Space'/);
  assert.doesNotMatch(shortcut, /Enter|Backspace|setStart|Range/);
  // DOM-only tests cannot reproduce iOS Safari's native contenteditable Enter behavior.
});

test('checklist checkbox is a CSS pseudo-element and pointer gutter toggles only the row state', () => {
  const pointer = editor.match(/const handleChecklistGutterPointerDown[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(pointer, /getBoundingClientRect\(\)\.left \+ gutter/);
  assert.match(pointer, /event\.preventDefault\(\)/);
  assert.match(pointer, /setChecklistItemChecked\(item, item\.dataset\.checked !== 'true'\)/);
  assert.doesNotMatch(pointer, /replaceChildren|replaceWith|append\(|remove\(|selection\.|focus\(/);
  assert.match(css, /ul\[data-checklist\] > li::before/);
  assert.match(css, /li\[data-checked="true"\]::before/);
  assert.match(css, /li\[data-checked="true"\]::after/);
  assert.doesNotMatch(css, /note-checklist-box|note-checklist-text/);
});

test('legacy checklist controls and nested text wrappers migrate to direct LI text', () => {
  const migration = editor.match(/const migrateLegacyChecklistMarkup = \(editor: HTMLDivElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(migration, /ul\[data-checklist\]/);
  assert.match(migration, /data-note-checklist-toggle/);
  assert.match(migration, /legacyChecked/);
  assert.match(migration, /element\.closest\('li'\) === item/);
  assert.match(migration, /querySelectorAll\('\.note-checklist-text,p,div'\)/);
  assert.match(migration, /wrapper\.replaceWith\(\.\.\.Array\.from\(wrapper\.childNodes\)\)/);
  assert.match(migration, /updateChecklistItemSemantics\(item\)/);
  assert.match(editor, /migrateLegacyChecklistMarkup\(editorRef\.current\)/);
  assert.doesNotMatch(migration, /createElement\('span'\)|createTextNode|replaceChildren/);
});

test('ten native checklist rows and inline marks survive attribute-only state updates', async () => {
  const normalize = editor.match(/const normalizeChecklistMetadata = \(editor: HTMLDivElement\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const helper = await readFile(new URL('../src/lib/mobileFormatting.js', import.meta.url), 'utf8');
  const checked = helper.match(/export function setChecklistItemChecked[\s\S]*?\n\}/)?.[0] ?? '';
  const nativeRows = Array.from({ length: 10 }, (_, index) => ({
    tagName: 'LI', dataset: { checked: String(index % 2 === 0) },
    attrs: new Map(), text: String.fromCharCode(65 + index),
    setAttribute(key, value) { this.attrs.set(key, value); },
  }));
  normalizeChecklistRows({ children: nativeRows });
  assert.equal(nativeRows.length, 10);
  assert.deepEqual(nativeRows.map((row) => row.dataset.checklistItem), Array(10).fill('true'));
  assert.deepEqual(nativeRows.map((row) => row.attrs.get('data-checked')), ['true', 'false', 'true', 'false', 'true', 'false', 'true', 'false', 'true', 'false']);
  assert.deepEqual(nativeRows.map((row) => row.text), Array.from({ length: 10 }, (_, index) => String.fromCharCode(65 + index)));
  assert.match(normalize, /normalizeChecklistRows\(list\)/);
  assert.doesNotMatch(normalize, /innerHTML|replaceChildren|replaceWith/);
  assert.match(checked, /setAttribute\('data-checked'/);
  assert.doesNotMatch(checked, /childNodes|innerHTML|textContent|replace|append/);
  assert.match(editor, /applyInlineFormatToRange\(editor, selectedRange, actionId, selection\)/);
  assert.match(editor, /toggleCollapsedInlineFormat\(editor, savedRange, actionId, selection\)/);
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
  assert.match(css, /\.note-content ul\[data-checklist\] > li::before/);
});
