import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRecentSearches, loadRecentSearches, recordRecentSearch, removeRecentSearch } from '../src/lib/recentSearches.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('recent searches persist per account, deduplicate without case, and retain newest eight', () => {
  const storage = memoryStorage();
  let recent = [];
  for (let index = 0; index < 9; index += 1) recent = recordRecentSearch(storage, 'account/a', `Query ${index}`);
  recent = recordRecentSearch(storage, 'account/a', 'QUERY 8');
  assert.equal(recent.length, 8);
  assert.equal(recent[0], 'QUERY 8');
  assert.equal(recent.includes('Query 0'), false);
  assert.deepEqual(loadRecentSearches(storage, 'account/a'), recent);
  assert.deepEqual(loadRecentSearches(storage, 'account/b'), []);
  assert.deepEqual(recordRecentSearch(storage, 'account/a', '   '), recent);
});

test('recent searches can remove one query and clear all', () => {
  const storage = memoryStorage();
  recordRecentSearch(storage, null, 'First');
  recordRecentSearch(storage, null, 'Second');
  assert.deepEqual(removeRecentSearch(storage, null, 'first'), ['Second']);
  assert.deepEqual(clearRecentSearches(storage, null), []);
  assert.deepEqual(loadRecentSearches(storage, null), []);
});
