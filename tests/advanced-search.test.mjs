import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchRecords,
  filterSearchRecords,
  getNotesInView,
  getSearchSnippet,
  highlightSegments,
  normalizeSearchText,
  rankSearchRecords,
  sortSearchNotes,
  stripHtmlToText,
} from '../src/lib/advancedSearch.js';

function note(id, overrides = {}) {
  return {
    id,
    title: '',
    content: '',
    folderId: null,
    pinned: false,
    archived: false,
    trashed: false,
    trashedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const notes = [
  note('a', { title: 'Lịch học', content: '<p>Tanooki dùng <strong>Supabase</strong> để đồng bộ ghi chú.</p>', folderId: 'work', pinned: true, createdAt: 3, updatedAt: 5 }),
  note('b', { title: 'supabase Notes', content: '<div>Ghi chú <em>ngắn</em></div>', folderId: null, createdAt: 2, updatedAt: 5 }),
  note('c', { title: 'Đọc sách', content: '<p>#Japanese nội dung</p>', folderId: 'study', archived: true, pinned: true, createdAt: 2, updatedAt: 4 }),
  note('d', { title: 'Trong thùng rác', content: '<p>Supabase</p>', folderId: 'work', trashed: true, createdAt: 4, updatedAt: 8 }),
];

test('search matches title and HTML body text, ignores markup, normalizes case and whitespace', () => {
  const active = getNotesInView(notes, { kind: 'all' });
  const records = buildSearchRecords(active);
  assert.deepEqual(filterSearchRecords(records, { query: '  SUPABASE   để   đồng bộ ' }, { kind: 'all' }).map((r) => r.note.id), ['a']);
  assert.deepEqual(filterSearchRecords(records, { query: 'supabase notes' }, { kind: 'all' }).map((r) => r.note.id), ['b']);
  assert.equal(stripHtmlToText('<p>hello <b>world</b></p>'), 'hello world');
  assert.equal(normalizeSearchText('  A\n  B '), 'a b');
  assert.deepEqual(filterSearchRecords(records, { query: 'strong' }, { kind: 'all' }), []);
});

test('body snippets center on the match and safe highlight segments preserve original casing', () => {
  const body = `Một đoạn mở đầu đủ dài để đẩy phần cần tìm ra xa. Tanooki đang dùng Supabase để đồng bộ ghi chú. Phần kết thúc của nội dung.`;
  const snippet = getSearchSnippet(body, 'supabase', 70);
  assert.match(snippet, /Supabase/);
  assert.ok(snippet.startsWith('…'));
  assert.deepEqual(highlightSegments('Dùng sUpAbAsE hôm nay', 'SUPABASE'), [
    { text: 'Dùng ', match: false }, { text: 'sUpAbAsE', match: true }, { text: ' hôm nay', match: false },
  ]);
  assert.deepEqual(highlightSegments('<img>', ''), [{ text: '<img>', match: false }]);
  assert.deepEqual(highlightSegments('Regex [note]+ text', '[note]+'), [
    { text: 'Regex ', match: false }, { text: '[note]+', match: true }, { text: ' text', match: false },
  ]);
});

test('checklist labels are searchable as plain body text', () => {
  const checklist = buildSearchRecords([note('check', { content: '<ul><li><input type="checkbox" checked>Chuẩn bị hành lý</li></ul>' })]);
  assert.equal(checklist[0].bodyText, 'Chuẩn bị hành lý');
  assert.deepEqual(filterSearchRecords(checklist, { query: 'hành lý' }, { kind: 'all' }).map((record) => record.note.id), ['check']);
});

test('folder, no-folder, tag, pinned and combined filters refine the active view', () => {
  const active = getNotesInView(notes, { kind: 'all' });
  const records = buildSearchRecords(active);
  assert.deepEqual(filterSearchRecords(records, { folderId: 'work' }, { kind: 'all' }).map((r) => r.note.id), ['a']);
  assert.deepEqual(filterSearchRecords(records, { folderId: 'none' }, { kind: 'all' }).map((r) => r.note.id), ['b']);
  assert.deepEqual(filterSearchRecords(records, { tag: 'japanese' }, { kind: 'all' }), []);
  assert.deepEqual(filterSearchRecords(buildSearchRecords(notes), { tag: 'japanese', archive: 'archived' }, { kind: 'all' }).map((r) => r.note.id), ['c']);
  assert.deepEqual(filterSearchRecords(records, { pinned: 'pinned' }, { kind: 'all' }).map((r) => r.note.id), ['a']);
  assert.deepEqual(filterSearchRecords(records, { pinned: 'unpinned', folderId: 'none' }, { kind: 'all' }).map((r) => r.note.id), ['b']);
});

test('archive filter is explicit on All Notes and Trash never leaks into normal results', () => {
  const active = getNotesInView(notes, { kind: 'all' });
  assert.deepEqual(active.map((n) => n.id), ['a', 'b']);
  const allNotesRecords = buildSearchRecords(notes.filter((n) => !n.trashed));
  assert.deepEqual(filterSearchRecords(allNotesRecords, { archive: 'archived' }, { kind: 'all' }).map((r) => r.note.id), ['c']);
  assert.deepEqual(filterSearchRecords(allNotesRecords, { archive: 'all' }, { kind: 'all' }).map((r) => r.note.id), ['a', 'b', 'c']);
  const trash = getNotesInView(notes, { kind: 'trash' });
  assert.deepEqual(filterSearchRecords(buildSearchRecords(trash), { query: 'supabase' }, { kind: 'trash' }).map((r) => r.note.id), ['d']);
  const archive = getNotesInView(notes, { kind: 'archived' });
  assert.deepEqual(filterSearchRecords(buildSearchRecords(archive), { query: 'sách' }, { kind: 'archived' }).map((r) => r.note.id), ['c']);
  assert.deepEqual(getNotesInView(notes, { kind: 'folder', id: 'work' }).map((n) => n.id), ['a']);
});

test('sorting supports updated, created, A-Z, Z-A and deterministic ties', () => {
  const values = [
    note('z', { title: 'Beta', updatedAt: 4, createdAt: 2 }),
    note('b', { title: 'alpha', updatedAt: 5, createdAt: 3 }),
    note('a', { title: 'Alpha', updatedAt: 5, createdAt: 3 }),
  ];
  assert.deepEqual(sortSearchNotes(values, 'updated').map((n) => n.id), ['a', 'b', 'z']);
  assert.deepEqual(sortSearchNotes(values, 'created').map((n) => n.id), ['a', 'b', 'z']);
  assert.deepEqual(sortSearchNotes(values, 'title-asc').map((n) => n.id), ['a', 'b', 'z']);
  assert.deepEqual(sortSearchNotes(values, 'title-desc').map((n) => n.id), ['z', 'a', 'b']);
  assert.deepEqual(sortSearchNotes(values, 'updated', true).map((n) => n.id), ['a', 'b', 'z']);
});

test('reset defaults restore current-view results and keep pinned promotion opt-in', () => {
  const baseline = getNotesInView(notes, { kind: 'all' });
  const records = buildSearchRecords(baseline);
  const filtered = filterSearchRecords(records, { folderId: 'work' }, { kind: 'all' });
  assert.equal(filtered.length, 1);
  const reset = filterSearchRecords(records, { query: '', folderId: 'all', tag: 'all', pinned: 'all', archive: 'current' }, { kind: 'all' });
  assert.deepEqual(reset.map((r) => r.note.id), baseline.map((n) => n.id));
  assert.deepEqual(sortSearchNotes([note('unpinned', { updatedAt: 10 }), note('pin', { pinned: true, updatedAt: 1 })], 'updated').map((n) => n.id), ['unpinned', 'pin']);
  assert.deepEqual(sortSearchNotes([note('unpinned', { updatedAt: 10 }), note('pin', { pinned: true, updatedAt: 1 })], 'updated', true).map((n) => n.id), ['pin', 'unpinned']);
});

test('partial live queries update results immediately and clearing only the query preserves active filters', () => {
  const liveNotes = [
    note('nhap', { title: 'Nháp cuộc họp', folderId: 'work', content: '<p>Ghi nhanh</p>' }),
    note('nhat', { title: 'Nhật ký', folderId: 'work', content: '<p>Những điều hôm nay</p>' }),
    note('other', { title: 'Ý tưởng', folderId: 'study', content: '<p>Khác</p>' }),
  ];
  const records = buildSearchRecords(getNotesInView(liveNotes, { kind: 'all' }));
  const filters = { folderId: 'work', pinned: 'all', tag: 'all', archive: 'current' };
  assert.deepEqual(filterSearchRecords(records, { ...filters, query: 'N' }, { kind: 'all' }).map((r) => r.note.id), ['nhap', 'nhat']);
  assert.deepEqual(filterSearchRecords(records, { ...filters, query: 'Nh' }, { kind: 'all' }).map((r) => r.note.id), ['nhap', 'nhat']);
  assert.deepEqual(filterSearchRecords(records, { ...filters, query: 'Nhá' }, { kind: 'all' }).map((r) => r.note.id), ['nhap']);
  assert.deepEqual(filterSearchRecords(records, { ...filters, query: '' }, { kind: 'all' }).map((r) => r.note.id), ['nhap', 'nhat']);
});

test('search relevance ranks exact, prefix, title, then body matches with recency ties', () => {
  const values = [
    note('body-new', { title: 'Other', content: '<ul><li>alpha beta</li></ul>', updatedAt: 100 }),
    note('contains-old', { title: 'An alpha beta note', updatedAt: 1 }),
    note('prefix', { title: 'Alpha beta extra', updatedAt: 1 }),
    note('exact-old', { title: 'ALPHA BETA', updatedAt: 2 }),
    note('exact-new', { title: 'alpha beta', updatedAt: 5 }),
  ];
  const records = buildSearchRecords(values);
  assert.deepEqual(filterSearchRecords(records, { query: 'alpha beta' }, { kind: 'all' }).map((record) => record.note.id), ['body-new', 'contains-old', 'prefix', 'exact-old', 'exact-new']);
  assert.deepEqual(rankSearchRecords(records, 'ALPHA BETA').map((record) => record.note.id), ['exact-new', 'exact-old', 'prefix', 'contains-old', 'body-new']);
  assert.deepEqual(rankSearchRecords(buildSearchRecords([note('special', { title: 'Regex [note]+' })]), '[note]+').map((record) => record.note.id), ['special']);
  assert.deepEqual(rankSearchRecords(records, '').map((record) => record.note.id), values.map((value) => value.id));
});

test('recently updated filter is limited to seven days and keeps pinned/archive rules', () => {
  const now = 20 * 24 * 60 * 60 * 1000;
  const records = buildSearchRecords([
    note('recent', { updatedAt: now - 1000 }),
    note('old', { updatedAt: now - 8 * 24 * 60 * 60 * 1000 }),
    note('archived', { archived: true, updatedAt: now }),
    note('trash', { trashed: true, updatedAt: now }),
  ]);
  assert.deepEqual(filterSearchRecords(records, { recentlyUpdated: true, now }, { kind: 'all' }).map((record) => record.note.id), ['recent']);
  assert.deepEqual(filterSearchRecords(records, { pinned: 'pinned', recentlyUpdated: true, now }, { kind: 'all' }), []);
});
