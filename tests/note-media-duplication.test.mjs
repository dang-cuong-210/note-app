import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const { assertMediaDuplicationOnline, imageStoragePathFromUrl, noteHasManagedMedia, prepareNoteMediaCopy, rewriteDuplicatedContent } = await import('../src/lib/noteMediaDuplication.js');

const accountId = 'account-1';
const note = {
  id: 'source-note', title: 'Worldbuilding', content: '<p>text</p>', folderId: null,
  pinned: false, archived: false, trashed: false, trashedAt: null, createdAt: 1, updatedAt: 2,
};
const attachment = {
  id: 'old-attachment', noteId: note.id, name: 'ideas.pdf', type: 'application/pdf', size: 1234,
  storagePath: `${accountId}/${note.id}/source.pdf`, url: null, createdAt: 3,
};

function adapter(overrides = {}) {
  const copied = [];
  const removed = [];
  return {
    copied, removed,
    copyImage: async (source, destination) => { copied.push({ bucket: 'note-images', source, destination }); },
    signImage: async (path) => `https://storage.test/storage/v1/object/sign/note-images/${path}?token=new`,
    copyAttachment: async (source, destination) => { copied.push({ bucket: 'note-files', source, destination }); },
    signAttachment: async (path) => `https://storage.test/storage/v1/object/sign/note-files/${path}?token=file`,
    remove: async (objects) => removed.push(...objects),
    ...overrides,
  };
}

test('copies inline image bytes to destination note path and rewrites HTML URL', async () => {
  const sourcePath = `${accountId}/${note.id}/art.png`;
  const sourceUrl = `https://storage.test/storage/v1/object/sign/note-images/${sourcePath}?token=old&amp;expires=1`;
  const storage = adapter();
  const prepared = await prepareNoteMediaCopy({
    note: { ...note, content: `<p><img src="${sourceUrl}" width="320"></p>` },
    attachments: [], accountId, newNoteId: 'copy-1', createId: () => 'unused', now: 50, storage,
  });
  assert.equal(storage.copied.length, 1);
  assert.equal(storage.copied[0].source, sourcePath);
  assert.match(storage.copied[0].destination, new RegExp(`^${accountId}/copy-1/`));
  assert.doesNotMatch(prepared.content, new RegExp(`${note.id}/art\\.png`));
  assert.match(prepared.content, new RegExp(`${accountId}/copy-1/`));
  assert.equal(prepared.createdObjects[0].bucket, 'note-images');
});

test('copies attachment with new ID/path and rewrites HTML and layout metadata', async () => {
  const content = '<span data-noted-attachment-id="old-attachment">ideas.pdf</span><!--NOTED_ATTACHMENT_LAYOUT:%7B%22order%22%3A%5B%22old-attachment%22%5D%2C%22widths%22%3A%7B%22old-attachment%22%3A420%7D%7D-->';
  const storage = adapter();
  const prepared = await prepareNoteMediaCopy({
    note: { ...note, content }, attachments: [attachment], accountId, newNoteId: 'copy-2',
    createId: () => 'new-attachment', now: 100, storage,
  });
  assert.equal(prepared.attachments.length, 1);
  assert.equal(prepared.attachments[0].id, 'new-attachment');
  assert.equal(prepared.attachments[0].noteId, 'copy-2');
  assert.notEqual(prepared.attachments[0].storagePath, attachment.storagePath);
  assert.match(prepared.attachments[0].storagePath, new RegExp(`^${accountId}/copy-2/`));
  assert.match(prepared.content, /data-noted-attachment-id="new-attachment"/);
  const layout = JSON.parse(decodeURIComponent(prepared.content.match(/NOTED_ATTACHMENT_LAYOUT:([^>]*)-->/)[1]));
  assert.deepEqual(layout.order, ['new-attachment']);
  assert.deepEqual(layout.widths, { 'new-attachment': 420 });
  assert.doesNotMatch(prepared.content, /old-attachment/);
});

test('duplicate attachment operations remain independent after copy', async () => {
  const storage = adapter();
  const prepared = await prepareNoteMediaCopy({
    note, attachments: [attachment], accountId, newNoteId: 'copy-3', createId: () => 'new-attachment', now: 20, storage,
  });
  await prepared.cleanup();
  assert.equal(storage.removed.length, 1);
  assert.equal(storage.removed[0].path, prepared.attachments[0].storagePath);
  assert.notEqual(storage.removed[0].path, attachment.storagePath);
});

test('copy failure cleans only destination objects and rejects before any database action', async () => {
  const firstPath = `${accountId}/${note.id}/one.png`;
  const secondPath = `${accountId}/${note.id}/two.png`;
  const storage = adapter({
    copyImage: async (source, destination) => {
      if (source.endsWith('two.png')) throw new Error('copy failed');
      storage.copied.push({ bucket: 'note-images', source, destination });
    },
  });
  await assert.rejects(prepareNoteMediaCopy({
    note: { ...note, content: `<img src="https://x/storage/v1/object/sign/note-images/${firstPath}?t=1"><img src="https://x/storage/v1/object/sign/note-images/${secondPath}?t=1">` },
    attachments: [], accountId, newNoteId: 'copy-4', createId: () => 'unused', now: 1, storage,
  }), /copy failed/);
  assert.equal(storage.removed.length, 1);
  assert.match(storage.removed[0].path, new RegExp(`^${accountId}/copy-4/`));
  assert.doesNotMatch(storage.removed[0].path, new RegExp(`${note.id}/`));
});

test('rejects media paths outside the authenticated account namespace', async () => {
  assert.equal(imageStoragePathFromUrl('https://x/note-images/other-user/note/image.png?token=x'), 'other-user/note/image.png');
  const storage = adapter();
  await assert.rejects(prepareNoteMediaCopy({
    note: { ...note, content: '<img src="https://x/note-images/other-user/note/image.png?token=x">' },
    attachments: [], accountId, newNoteId: 'copy-5', createId: () => 'unused', now: 1, storage,
  }), /outside the authenticated account/);
  assert.equal(storage.copied.length, 0);
});

test('media detection and HTML rewrite preserve external images while remapping owned refs', () => {
  assert.equal(noteHasManagedMedia('<img src="https://example.test/image.png">', []), false);
  assert.equal(noteHasManagedMedia('<img src="https://x/note-images/account-1/note/a.png?x=1">', []), true);
  assert.equal(noteHasManagedMedia('<p data-noted-attachment-id="a">x</p>', []), true);
  const content = '<img src="https://example.test/image.png"><span data-noted-attachment-id="old">x</span>';
  const rewritten = rewriteDuplicatedContent(content, new Map(), new Map([['old', 'new']]));
  assert.match(rewritten, /example\.test\/image\.png/);
  assert.match(rewritten, /data-noted-attachment-id="new"/);
});

test('media duplicates are blocked offline while text-only duplicates stay eligible', () => {
  assert.doesNotThrow(() => assertMediaDuplicationOnline(false, false));
  assert.throws(() => assertMediaDuplicationOnline(true, false), /Cần kết nối mạng/);
  assert.doesNotThrow(() => assertMediaDuplicationOnline(true, true));
});

test('one narrowly scoped RPC uses existing CAS insert and transactionally inserts owned attachment rows', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261020090000_duplicate_note_with_attachments.sql', import.meta.url), 'utf8');
  assert.match(sql, /SECURITY INVOKER/i);
  assert.match(sql, /save_note_versioned\(p_note, -1\)/i);
  assert.match(sql, /user_id\s*=\s*v_user_id/i);
  assert.match(sql, /INSERT INTO public\.attachments/i);
  assert.match(sql, /v_user_id\s*,\s*v_attachment->>'name'/i);
  assert.match(sql, /v_path !~ \('\^' \|\| v_user_id::text \|\| '\/' \|\| v_note_id \|\| '\/\[\^\/\]\+\$'\)/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.duplicate_note_with_attachments[^;]* TO authenticated/i);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.duplicate_note_with_attachments[^;]* FROM anon/i);
});
