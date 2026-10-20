import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRASH_RETENTION_MS } from '../src/lib/trashRetention.js';

const [noteList, trashActions] = await Promise.all([
  readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/trashActions.js', import.meta.url), 'utf8'),
]);

test('desktop and mobile Trash explain the same seven-day recovery window without promising an exact purge time', () => {
  const copy = 'Ghi chú đã xóa có thể được khôi phục trong 7 ngày.';
  assert.match(noteList, new RegExp(`<p className="tanooki-mobile-trash-retention">${copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</p>`));
  assert.match(noteList, new RegExp(`<p className="px-3 py-2 text-xs"[^>]*>\\s*${copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.doesNotMatch(noteList, /(?:Thùng rác|ghi chú đã xóa)[^\n<]*(?:sẽ bị xóa vĩnh viễn sau|sau thời gian đó)[^\n<]*7 ngày/i);
  assert.equal(TRASH_RETENTION_MS, 7 * 24 * 60 * 60 * 1000);
  assert.match(trashActions, /'Xóa vĩnh viễn ghi chú\?\\n\\nGhi chú này sẽ bị xóa vĩnh viễn và không thể khôi phục\.'/);
});
