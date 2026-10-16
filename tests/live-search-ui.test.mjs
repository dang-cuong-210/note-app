import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Home search fields update live results without a submit action', async () => {
  const dashboard = await readFile(new URL('../src/components/TanookiDashboard.tsx', import.meta.url), 'utf8');
  const mobileHome = await readFile(new URL('../src/components/MobileHome.tsx', import.meta.url), 'utf8');
  const liveResults = await readFile(new URL('../src/components/LiveSearchResults.tsx', import.meta.url), 'utf8');
  const noteList = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');

  assert.match(dashboard, /onChange=\{\(event\) => onSearchChange\(event\.target\.value\)\}/);
  assert.match(dashboard, /<LiveSearchResults[^>]+query=\{searchQuery\}/);
  assert.doesNotMatch(dashboard, /<form[^>]*tanooki-dashboard-search|onSubmit=\{submitSearch\}/);
  assert.match(mobileHome, /onChange=\{\(event\) => onSearchChange\(event\.target\.value\)\}/);
  assert.match(mobileHome, /<LiveSearchResults[^>]+query=\{searchQuery\}/);
  assert.match(mobileHome, /event\.preventDefault\(\); event\.currentTarget\.blur\(\)/);
  assert.doesNotMatch(mobileHome, /<button type="submit" aria-label="Tìm kiếm"/);
  assert.match(liveResults, /filterSearchRecords\(records, \{ query \}, \{ kind: 'all' \}\)/);
  assert.match(liveResults, /onShowAll\(query\.trim\(\)\)/);
  assert.match(noteList, /onChange=\{\(e\) => onSearchChange\(e\.target\.value\)\}/);
  assert.match(noteList, /query: searchQuery,[\s\S]*folderId: folderFilter,[\s\S]*tag: tagFilter,[\s\S]*pinned: pinnedFilter/);
});

test('mobile Search keeps recent queries local, preserves the existing note-open path, and exposes focus/filter states', async () => {
  const noteList = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const recentSearches = await readFile(new URL('../src/lib/recentSearches.js', import.meta.url), 'utf8');
  assert.match(noteList, /Tìm kiếm gần đây/);
  assert.match(noteList, /Chưa có tìm kiếm gần đây/);
  assert.match(noteList, /onClick=\{forgetAllRecentSearches\}/);
  assert.match(noteList, /onClick=\{\(\) => \{ onSearchChange\(query\); searchInputRef\.current\?\.focus/);
  assert.match(noteList, /onOpen=\{\(\) => onSelectNote\(note\.id\)\}/);
  assert.match(noteList, /Cập nhật trong 7 ngày/);
  assert.match(noteList, /Không tìm thấy ghi chú/);
  assert.match(app, /searchAccountId=\{user\?\.id \?\? null\}/);
  assert.match(recentSearches, /RECENT_SEARCH_LIMIT = 8/);
  assert.match(recentSearches, /toLocaleLowerCase\(\)/);
});
