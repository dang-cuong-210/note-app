import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addTagToContent, extractTagsFromContent, getTagSuggestions, normalizeTagName, readManagedTags, removeTagFromContent } from '../src/lib/tagUtils.js';
import { buildSearchRecords, getNotesInView, stripHtmlToText } from '../src/lib/advancedSearch.js';

const note = (id, content, overrides = {}) => ({ id, title: '', content, trashed: false, archived: false, folderId: null, pinned: false, createdAt: 1, updatedAt: 1, ...overrides });

test('normalizes tags with whitespace, duplicate hash marks, and Vietnamese Unicode', () => {
  assert.equal(normalizeTagName('  ##Dự Án Mới  '), 'dự-án-mới');
  assert.equal(normalizeTagName('###'), null);
  assert.equal(normalizeTagName('   '), null);
});

test('extracts legacy visible hashtags and new managed tags without exposing metadata as note text', () => {
  const added = addTagToContent('<p>Nội dung #Việc</p>', '##Dự án');
  assert.equal(added.changed, true);
  assert.deepEqual(extractTagsFromContent(added.content), ['việc', 'dự-án']);
  assert.deepEqual(readManagedTags(added.content), ['dự-án']);
  assert.match(added.content, /<p>Nội dung #Việc<\/p>/);
  assert.equal(stripHtmlToText(added.content), 'Nội dung #Việc');
});

test('rejects empty tags and avoids duplicate tags regardless of case or hash prefix', () => {
  assert.equal(addTagToContent('<p>body</p>', '###').changed, false);
  const once = addTagToContent('<p>body</p>', '#Work');
  const twice = addTagToContent(once.content, '##WORK');
  assert.equal(once.changed, true);
  assert.equal(twice.changed, false);
  assert.deepEqual(extractTagsFromContent(twice.content), ['work']);
});

test('removes only the requested inline and managed tag while preserving unrelated HTML and attachment markup', () => {
  const html = '<p>Keep <strong>#Remove #Keep</strong> words</p><a href="https://example.test/#remove">link</a><span data-noted-attachment-id="file-1">Attachment</span>';
  const withManaged = addTagToContent(html, 'Remove').content;
  const result = removeTagFromContent(withManaged, 'remove');
  assert.equal(result.changed, true);
  assert.deepEqual(extractTagsFromContent(result.content), ['keep']);
  assert.match(result.content, /<strong> #Keep<\/strong>/);
  assert.match(result.content, /href="https:\/\/example\.test\/#remove"/);
  assert.match(result.content, /data-noted-attachment-id="file-1"/);
});

test('suggestions reuse other active notes, deduplicate, and omit current or trashed notes', () => {
  const values = [
    note('current', '<p>#Personal</p>'),
    note('one', addTagToContent('<p>text</p>', 'Dự án').content),
    note('two', '<p>#DỰ-ÁN #Công-việc</p>'),
    note('trash', '<p>#Deleted</p>', { trashed: true }),
  ];
  assert.deepEqual(getTagSuggestions(values, 'current', 'dự'), ['dự-án']);
  assert.deepEqual(getTagSuggestions(values, 'current'), ['công-việc', 'dự-án']);
});

test('managed tags participate in the existing tag view and advanced search filter pipeline', () => {
  const values = [
    note('match', addTagToContent('<p>original body stays searchable</p>', 'Công việc').content),
    note('other', '<p>#Khác</p>'),
  ];
  assert.deepEqual(getNotesInView(values, { kind: 'tag', name: 'công-việc' }).map(({ id }) => id), ['match']);
  const records = buildSearchRecords(getNotesInView(values, { kind: 'all' }));
  assert.equal(records.find(({ note: value }) => value.id === 'match').bodyText, 'original body stays searchable');
  assert.deepEqual(records.find(({ note: value }) => value.id === 'match').tags, ['công-việc']);
});

test('desktop editor and mobile Tools sheet share the same add/remove/click tag manager', () => {
  const editor = readFileSync(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8');
  const mobile = readFileSync(new URL('../src/components/MobileEditorSheets.tsx', import.meta.url), 'utf8');
  const desktopTools = readFileSync(new URL('../src/components/DesktopEditorToolsPanel.tsx', import.meta.url), 'utf8');
  const manager = readFileSync(new URL('../src/components/NoteTagManager.tsx', import.meta.url), 'utf8');
  assert.match(editor, /<NoteTagManager[^>]+onAddTag=\{addNoteTag\}[^>]+onRemoveTag=\{removeNoteTag\}/);
  assert.match(mobile, /<NoteTagManager mobile[^>]+onAddTag=\{onAddTag\}[^>]+onRemoveTag=\{onRemoveTag\}/);
  assert.match(desktopTools, /onClick=\{\(\) => onOpenTag\(tag\)\}/);
  assert.match(manager, /onClick=\{\(\) => onOpenTag\(tag\)\}/);
  assert.match(manager, /onClick=\{\(\) => remove\(tag\)\}/);
});
