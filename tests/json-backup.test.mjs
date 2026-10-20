import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  exportJsonBackup,
  parseJsonBackup,
  summarizeJsonImport,
  mergeJsonBackupData,
  TANOOKI_BACKUP_FORMAT,
} from '../src/lib/jsonBackup.js';

const note = (id, updates = {}) => ({
  id, title: `Title ${id}`, content: '<p>Body</p><!--TANOOKI_TAGS:%5B%22work%22%5D-->',
  folderId: null, pinned: false, archived: false, trashed: false, trashedAt: null,
  createdAt: 100, updatedAt: 200, ...updates,
});
const folder = (id, updates = {}) => ({ id, name: `Folder ${id}`, parentId: null, createdAt: 100, ...updates });
const settings = { theme: 'dark', fontSize: 'md', sortBy: 'updated', sortDir: 'desc' };
const backup = (values = {}) => ({ format: TANOOKI_BACKUP_FORMAT, version: 1, notes: [], folders: [], ...values });

test('export uses explicit versioned JSON data format and excludes local/account/media-only fields', () => {
  const serialized = exportJsonBackup([note('n1', { user_id: 'other', accountId: 'other', attachmentBlob: 'secret', revision: 8, syncPending: true })], [folder('f1', { user_id: 'other', revision: 4 })], settings, '2026-10-21T00:00:00.000Z');
  const result = JSON.parse(serialized);
  assert.equal(result.format, 'tanooki-json-backup');
  assert.equal(result.version, 1);
  assert.equal(result.exportedAt, '2026-10-21T00:00:00.000Z');
  assert.equal(result.notes[0].content, note('n1').content);
  assert.equal(result.folders[0].name, 'Folder f1');
  assert.deepEqual(result.settings, settings);
  assert.equal(JSON.stringify(result).includes('other'), false);
  assert.equal(JSON.stringify(result).includes('attachmentBlob'), false);
  assert.equal(JSON.stringify(result).includes('syncPending'), false);
  assert.equal(JSON.stringify(result).includes('recent'), false);
});

test('accepts legacy exports from the prior version-1 shape and safe unversioned version-0 shape', () => {
  const prior = parseJsonBackup(JSON.stringify({ version: 1, notes: [note('n1')], folders: [], settings }));
  assert.equal(prior.version, 1);
  assert.equal(prior.legacy, true);
  const legacy = parseJsonBackup(JSON.stringify({ notes: [note('n1')], folders: [] }));
  assert.equal(legacy.version, 0);
  assert.equal(legacy.legacy, true);
});

test('rejects malformed JSON, unknown formats and unsupported versions', () => {
  assert.throws(() => parseJsonBackup('{'), /JSON hợp lệ/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ format: 'other' }))), /không được hỗ trợ/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ version: 2 }))), /không được hỗ trợ/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ exportedAt: 'not-a-date' }))), /Thời điểm xuất/);
});

test('rejects malformed arrays, records and duplicate IDs before import', () => {
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ notes: {} }))), /[Dd]anh sách ghi chú/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ folders: {} }))), /[Dd]anh sách thư mục/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ notes: [note('x'), note('x')] }))), /trùng lặp/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ folders: [folder('x'), folder('x')] }))), /trùng lặp/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ notes: [note('x', { title: null })] }))), /tiêu đề/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ notes: [note(' ')] }))), /ID/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ folders: [folder('x', { name: '' })] }))), /tên/);
});

test('rejects malformed recognized settings and ignores unknown settings safely', () => {
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ settings: [] }))), /cài đặt/);
  assert.throws(() => parseJsonBackup(JSON.stringify(backup({ settings: { theme: 'neon' } }))), /không được hỗ trợ/);
  assert.deepEqual(parseJsonBackup(JSON.stringify(backup({ settings: { theme: 'light', accountId: 'evil' } }))).settings, { theme: 'light' });
});

test('merge updates matching IDs through normalized records and preserves account rows absent from file', () => {
  const imported = parseJsonBackup(JSON.stringify(backup({ notes: [note('existing', { title: 'Imported' }), note('new')], folders: [folder('existing-folder', { name: 'Renamed' }), folder('new-folder')] })));
  const existingNote = note('existing', { title: 'Old', revision: 7, syncPending: true, localOnly: 'retained' });
  const existingFolder = folder('existing-folder', { revision: 3, localOnly: 'retained' });
  const merged = mergeJsonBackupData(imported, [existingNote, note('omitted')], [existingFolder, folder('omitted-folder')]);
  assert.equal(merged.notes.find((item) => item.id === 'existing').title, 'Imported');
  assert.equal(merged.notes.find((item) => item.id === 'existing').revision, 7);
  assert.equal(merged.notes.find((item) => item.id === 'existing').localOnly, 'retained');
  assert.ok(merged.notes.some((item) => item.id === 'omitted'));
  assert.ok(merged.notes.some((item) => item.id === 'new'));
  assert.equal(merged.folders.find((item) => item.id === 'existing-folder').name, 'Renamed');
  assert.equal(merged.folders.find((item) => item.id === 'existing-folder').revision, 3);
  assert.ok(merged.folders.some((item) => item.id === 'omitted-folder'));
  assert.ok(merged.folders.some((item) => item.id === 'new-folder'));
  assert.deepEqual([merged.notesAdded, merged.notesUpdated, merged.foldersAdded, merged.foldersUpdated], [1, 1, 1, 1]);
});

test('import preview counts additions, updates and settings', () => {
  const imported = parseJsonBackup(JSON.stringify(backup({ notes: [note('new'), note('existing')], folders: [folder('new-folder'), folder('existing-folder')], settings })));
  assert.deepEqual(summarizeJsonImport(imported, [note('existing')], [folder('existing-folder')]), {
    notesToAdd: 1, notesToUpdate: 1, foldersToAdd: 1, foldersToUpdate: 1, applySettings: true,
  });
});

test('settings import merges only supported device preferences and never account state', async () => {
  const hook = await readFile(new URL('../src/hooks/useAppData.ts', import.meta.url), 'utf8');
  assert.match(hook, /const next = \{ \.\.\.settings, \.\.\.data\.settings \}/);
  assert.match(hook, /await localDb\.saveSettings\(next\)/);
  assert.match(hook, /mergeJsonBackupData\(data, currentNotes, folders\)/);
});

test('imported account and session identifiers are discarded and ownership uses the active account path', async () => {
  const imported = parseJsonBackup(JSON.stringify(backup({
    notes: [note('n1', { user_id: 'attacker', accountId: 'attacker', session: 'token' })],
    folders: [folder('f1', { user_id: 'attacker', accountId: 'attacker' })],
    accountId: 'attacker', session: 'token',
  })));
  assert.equal('user_id' in imported.notes[0], false);
  assert.equal('accountId' in imported.notes[0], false);
  assert.equal('session' in imported.notes[0], false);
  assert.equal('accountId' in imported, false);
  const hook = await readFile(new URL('../src/hooks/useAppData.ts', import.meta.url), 'utf8');
  assert.match(hook, /if \(!userId \|\| activeAccountId\.current !== userId\)/);
  assert.match(hook, /await localDb\.putNotes\(userId, noteDrafts\)/);
});

test('settings UI previews counts, warns about media, requires confirmation, and reports completion', async () => {
  const view = await readFile(new URL('../src/components/SettingsView.tsx', import.meta.url), 'utf8');
  assert.match(view, /Xuất dữ liệu JSON/);
  assert.match(view, /Nhập dữ liệu JSON/);
  assert.match(view, /Không bao gồm tệp đính kèm, ảnh hoặc video/);
  assert.match(view, /Nhập dữ liệu này\?/);
  assert.match(view, /window\.confirm/);
  assert.match(view, /if \(!window\.confirm[\s\S]*?return/);
  assert.match(view, /await onImport\(data\)/);
  assert.match(view, /Đã nhập một phần/);
  assert.doesNotMatch(view, /Khôi phục từ tệp sao lưu|Tải toàn bộ ghi chú/);
});
