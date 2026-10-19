import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { confirmPermanentTrashDelete } from '../src/lib/trashActions.js';

const note = { id: 'trash-note', title: 'Ghi chú thử', trashed: true };

test('desktop single permanent delete waits for explicit confirmation and invokes the callback once', async () => {
  let message = '';
  const deleted = [];
  const result = await confirmPermanentTrashDelete(note, {
    isMobile: false,
    confirm: (copy) => { message = copy; return true; },
    permanentDelete: async (id) => { deleted.push(id); },
  });

  assert.equal(message, 'Xóa vĩnh viễn ghi chú?\n\nGhi chú này sẽ bị xóa vĩnh viễn và không thể khôi phục.');
  assert.equal(result, true);
  assert.deepEqual(deleted, ['trash-note']);
});

test('cancel leaves the trashed note untouched', async () => {
  let deleteCalls = 0;
  const result = await confirmPermanentTrashDelete(note, {
    isMobile: false,
    confirm: () => false,
    permanentDelete: async () => { deleteCalls += 1; },
  });

  assert.equal(result, false);
  assert.equal(deleteCalls, 0);
});

test('missing or no-longer-trashed notes cannot reach permanentDelete', async () => {
  let confirmCalls = 0;
  let deleteCalls = 0;
  const options = {
    isMobile: false,
    confirm: () => { confirmCalls += 1; return true; },
    permanentDelete: async () => { deleteCalls += 1; },
  };

  assert.equal(await confirmPermanentTrashDelete(null, options), false);
  assert.equal(await confirmPermanentTrashDelete({ ...note, trashed: false }, options), false);
  assert.equal(confirmCalls, 0);
  assert.equal(deleteCalls, 0);
});

test('mobile single-delete copy and bulk confirmation remain unchanged; soft trash stays separate', async () => {
  let mobileMessage = '';
  await confirmPermanentTrashDelete(note, {
    isMobile: true,
    confirm: (copy) => { mobileMessage = copy; return false; },
    permanentDelete: async () => assert.fail('cancelled mobile delete must not run'),
  });
  assert.equal(mobileMessage, 'Xóa vĩnh viễn ghi chú “Ghi chú thử”?');

  const noteList = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const deleteHandler = noteList.match(/const handleDelete = async \(note: Note\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';
  const trashHandler = noteList.match(/const handleTrash = \(note: Note\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';
  assert.match(deleteHandler, /view\.kind === 'trash'/);
  assert.match(deleteHandler, /confirmPermanentTrashDelete\(currentNote/);
  assert.match(deleteHandler, /isMobile: mobileTrashMode/);
  assert.match(trashHandler, /onTrash\(note\.id\)/);
  assert.doesNotMatch(trashHandler, /confirm/i);
  assert.match(noteList, /Xóa vĩnh viễn \$\{selected\.length\} ghi chú đã chọn/);
  assert.match(noteList, /if \(!selected\.length \|\| !window\.confirm\(/);
  assert.match(noteList, /selectedTrashIds\.forEach\(onRestore\)/);
});
