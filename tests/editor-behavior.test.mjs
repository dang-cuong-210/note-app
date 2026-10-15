import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canDiscardUnsentDraftOffline,
  getBlankLinesToAppend,
  isMeaningfulNoteContent,
  shouldDiscardNewEmptyDraft,
} from '../src/lib/editorBehavior.js';

const [app, editor, dataHook] = await Promise.all([
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/hooks/useAppData.ts', import.meta.url), 'utf8'),
]);

test('blank-area taps create only the lines needed to reach the tapped visual line', () => {
  assert.equal(getBlankLinesToAppend(50, 50, 25), 0);
  assert.equal(getBlankLinesToAppend(51, 50, 25), 0);
  assert.equal(getBlankLinesToAppend(52, 50, 25), 1);
  assert.equal(getBlankLinesToAppend(100, 50, 25), 2);
  assert.equal(getBlankLinesToAppend(900, 100, 20, 12), 12);
  assert.equal(getBlankLinesToAppend(200, 100, 0), 0);
});

test('meaningful-content detection ignores generated blank blocks and formatting-only HTML', () => {
  for (const html of ['', '<br>', '<p><br></p>', '<div><br></div>', '<strong><em>&nbsp;</em></strong>', '<p> \n </p>', '<!--NOTED_ATTACHMENT_LAYOUT:%7B%7D-->']) {
    assert.equal(isMeaningfulNoteContent('', html), false, html);
  }
  assert.equal(isMeaningfulNoteContent('   ', '<div><br></div>'), false);
  assert.equal(isMeaningfulNoteContent('', '<p> checklist text </p>'), true);
  assert.equal(isMeaningfulNoteContent('', '<ul><li><span>Buy tea</span></li></ul>'), true);
  assert.equal(isMeaningfulNoteContent('', '<img src="local-image">'), true);
  assert.equal(isMeaningfulNoteContent('', '<span data-noted-attachment-id="a1"></span>'), true);
  assert.equal(isMeaningfulNoteContent('', '<table><tbody><tr><td><br></td></tr></tbody></table>'), true);
  assert.equal(isMeaningfulNoteContent('', '', true), true);
  assert.equal(isMeaningfulNoteContent('', '<!--TANOOKI_TAGS:%5B%22project%22%5D-->'), true);
  assert.equal(isMeaningfulNoteContent('', '<!--TANOOKI_TAGS:%5B%5D-->'), false);
  assert.equal(isMeaningfulNoteContent('Ghi chú mới', '<p><br></p>'), false);
});

test('only a new, never-meaningful draft is auto-discarded on editor exit', () => {
  assert.equal(shouldDiscardNewEmptyDraft({ createdInSession: true, everMeaningful: false }), true, 'Back on an empty new draft discards it');
  assert.equal(shouldDiscardNewEmptyDraft({ createdInSession: true, everMeaningful: true }), false, 'typing then erasing still preserves the note');
  assert.equal(shouldDiscardNewEmptyDraft({ createdInSession: false, everMeaningful: false }), false, 'an old empty note is preserved');
  assert.equal(shouldDiscardNewEmptyDraft({ createdInSession: true, everMeaningful: false, explicitlyDeleted: true }), false, 'an explicit delete keeps normal Trash behavior');
});

test('offline discard is allowed only while a new note is certainly unsent', () => {
  assert.equal(canDiscardUnsentDraftOffline({ debouncePending: true, confirmedRevision: -1, inFlight: false }), true);
  assert.equal(canDiscardUnsentDraftOffline({ debouncePending: false, confirmedRevision: -1, inFlight: false }), false);
  assert.equal(canDiscardUnsentDraftOffline({ debouncePending: true, confirmedRevision: 0, inFlight: false }), false);
  assert.equal(canDiscardUnsentDraftOffline({ debouncePending: true, confirmedRevision: -1, inFlight: true }), false);
});

test('editor creates flowing blank blocks only when a blank surface is tapped below existing content', () => {
  assert.match(editor, /const placeCaretAtBlankTap = \(event: React\.PointerEvent<HTMLDivElement>\)/);
  assert.match(editor, /const createBlankBlocksAtY = \(clientY: number\) => \{/);
  assert.match(editor, /getComputedStyle\(editor\)/);
  assert.match(editor, /getBlankLinesToAppend\(clientY, endY, lineHeight\)/);
  assert.match(editor, /targetBlock = document\.createElement\('div'\)/);
  assert.match(editor, /targetBlock\.appendChild\(document\.createElement\('br'\)\)/);
  assert.match(editor, /selection\?\.addRange\(range\)/);
  assert.match(editor, /target !== editor && target !== event\.currentTarget/);
  assert.match(editor, /onPointerDown=\{e => \{[\s\S]*?placeCaretAtBlankTap\(e\);/);
  assert.match(editor, /onNoteMeaningful\(note\.id\)/);
});

test('new-note exits hard-discard only ephemeral drafts and keep explicit Trash separate', () => {
  assert.match(app, /registerNewDraft\(data\.addNote\(/);
  assert.match(app, /ephemeralDraftIds\.current\.add\(note\.id\)/);
  assert.match(app, /meaningfulDraftIds\.current\.add\(id\)/);
  assert.match(app, /finishEditorSession\(previous\.id\)/);
  assert.match(app, /dataRef\.current\.discardEmptyNoteDraft\(id\)/);
  assert.match(app, /explicitlyTrashedDraftIds\.current\.add\(id\)/);
  assert.match(app, /data\.trashNote\(id\)/);
  assert.match(app, /onNoteMeaningful=\{markDraftMeaningful\}/);
  assert.match(app, /onUpdate=\{handleNoteUpdate\}/);
});

test('empty-draft cleanup bypasses Trash and preserves remote/offline sync safety', () => {
  const cleanup = dataHook.match(/const discardEmptyNoteDraft = useCallback\(async[\s\S]*?\n  \}, \[online, permanentDelete, saveNote, userId\]\);/)?.[0];
  assert.ok(cleanup);
  assert.match(cleanup, /await permanentDelete\(id\)/);
  assert.match(cleanup, /canDiscardUnsentDraftOffline/);
  assert.match(cleanup, /localDb\.deleteNote\(userId!, id\)/);
  assert.match(cleanup, /localDb\.deleteAttachmentsByNote\(userId!, id\)/);
  assert.match(cleanup, /setNotes\(\(prev\) => prev\.filter\(\(item\) => item\.id !== id\)\)/);
  assert.doesNotMatch(cleanup, /trashNote|trashed\s*:/);
});
