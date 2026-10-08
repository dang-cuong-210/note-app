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
