import test from 'node:test';
import assert from 'node:assert/strict';
import { getDesktopNoteProperties, getDesktopViewLabel } from '../src/lib/desktopWorkspace.js';

test('desktop workspace labels known views in Vietnamese', () => {
  const folder = { id: 'f1', name: 'Công việc' };
  assert.equal(getDesktopViewLabel({ kind: 'home' }, []), 'Trang chủ');
  assert.equal(getDesktopViewLabel({ kind: 'all' }, []), 'Tất cả ghi chú');
  assert.equal(getDesktopViewLabel({ kind: 'recent' }, []), 'Gần đây');
  assert.equal(getDesktopViewLabel({ kind: 'pinned' }, []), 'Đã ghim');
  assert.equal(getDesktopViewLabel({ kind: 'archived' }, []), 'Lưu trữ');
  assert.equal(getDesktopViewLabel({ kind: 'trash' }, []), 'Thùng rác');
  assert.equal(getDesktopViewLabel({ kind: 'settings' }, []), 'Cài đặt');
  assert.equal(getDesktopViewLabel({ kind: 'folder', id: 'f1' }, [folder]), 'Công việc');
  assert.equal(getDesktopViewLabel({ kind: 'folder', id: 'missing' }, [folder]), 'Thư mục');
  assert.equal(getDesktopViewLabel({ kind: 'tag', name: 'ideas' }, []), '#ideas');
});

test('desktop note properties are derived from existing note, folder, attachment, and content data', () => {
  const note = { id: 'n1', createdAt: 10, updatedAt: 20, folderId: 'f1', pinned: true, archived: false };
  const folders = [{ id: 'f1', name: 'Công việc' }];
  const attachments = [{ id: 'a1' }, { id: 'a2' }];
  const properties = getDesktopNoteProperties(note, folders, attachments, 'Ghi chú thử nghiệm hôm nay', ['ideas', 'việc']);

  assert.deepEqual(properties, {
    createdAt: 10,
    updatedAt: 20,
    folderName: 'Công việc',
    tags: ['ideas', 'việc'],
    attachmentCount: 2,
    wordCount: 6,
    characterCount: 26,
    pinned: true,
    archived: false,
  });
});

test('desktop note properties support empty content and unfiled notes', () => {
  const properties = getDesktopNoteProperties(
    { id: 'n2', createdAt: 1, updatedAt: 2, folderId: null, pinned: false, archived: true },
    [], [], '', [],
  );

  assert.equal(properties.folderName, null);
  assert.equal(properties.attachmentCount, 0);
  assert.equal(properties.wordCount, 0);
  assert.equal(properties.characterCount, 0);
  assert.deepEqual(properties.tags, []);
});
