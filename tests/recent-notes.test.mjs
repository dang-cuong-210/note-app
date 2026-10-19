import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getEffectiveRecentTime,
  getRecentNotes,
  groupMobileRecentNotes,
  loadRecentOpenTimes,
  recordRecentOpen,
} from '../src/lib/recentNotes.js';
import { getDashboardRecentNotes } from '../src/lib/dashboardData.js';

const date = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();
const note = (id, updatedAt, fields = {}) => ({
  id, title: id, content: '', folderId: null, pinned: false, archived: false,
  trashed: false, createdAt: updatedAt, updatedAt, ...fields,
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  let writes = 0;
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { writes += 1; data.set(key, value); },
    writes: () => writes,
  };
}

test('opening an unedited note records device-local recent activity and reloads it offline', () => {
  const storage = memoryStorage();
  const opened = recordRecentOpen(storage, 'account-1', 'opened-only', 5000);
  assert.equal(opened.recorded, true);
  assert.equal(opened.times['opened-only'], 5000);
  assert.deepEqual(loadRecentOpenTimes(storage, 'account-1'), { 'opened-only': 5000 });
  assert.equal(recordRecentOpen(null, 'account-1', 'offline', 7000).times.offline, 7000);
});

test('opening the same note within the throttle window does not write again', () => {
  const storage = memoryStorage();
  const first = recordRecentOpen(storage, 'account-1', 'note-a', 10_000);
  const second = recordRecentOpen(storage, 'account-1', 'note-a', 10_001, first.times);
  assert.equal(storage.writes(), 1);
  assert.equal(second.recorded, false);
  assert.equal(second.times['note-a'], 10_000);
});

test('recent activity time is max(opened, edited) with updatedAt fallback', () => {
  const olderOpen = note('older-open', 500);
  const newerOpen = note('newer-open', 500);
  assert.equal(getEffectiveRecentTime(olderOpen, { 'older-open': 400 }), 500);
  assert.equal(getEffectiveRecentTime(newerOpen, { 'newer-open': 900 }), 900);
  assert.deepEqual(getRecentNotes([olderOpen, newerOpen], { 'newer-open': 900 }).map(({ id }) => id), ['newer-open', 'older-open']);
  assert.deepEqual(getRecentNotes([note('edited-now', 1200), note('older', 500)]).map(({ id }) => id), ['edited-now', 'older']);
});

test('recent list excludes archived and deleted notes and breaks equal-time ties deterministically', () => {
  const notes = [
    note('z', 100), note('a', 100), note('archived', 500, { archived: true }), note('trashed', 600, { trashed: true }),
  ];
  assert.deepEqual(getRecentNotes(notes).map(({ id }) => id), ['a', 'z']);
});

test('recent notes group by today, yesterday, last seven days and older month/year', () => {
  const now = new Date(2026, 9, 16, 15);
  const notes = [
    note('week', date(2026, 10, 12)), note('today', date(2026, 10, 16, 9)),
    note('yesterday', date(2026, 10, 15, 11)), note('old', date(2026, 9, 20)),
    note('last-year', date(2025, 10, 2)),
  ];
  const groups = groupMobileRecentNotes(notes, {}, now);
  assert.deepEqual(groups.map(({ label }) => label), ['Hôm nay', 'Hôm qua', '7 ngày trước', 'Tháng 9', 'Tháng 10, 2025']);
  assert.deepEqual(groups.flatMap(({ notes: bucket }) => bucket.map(({ id }) => id)), ['today', 'yesterday', 'week', 'old', 'last-year']);
});

test('dashboard Recent section shares the effective recent ordering', () => {
  const notes = [note('edited', 900), note('opened', 300)];
  assert.deepEqual(getDashboardRecentNotes(notes, 5, { opened: 1000 }).map(({ id }) => id), ['opened', 'edited']);
});

test('editor More opens grouped mobile Recent Notes and back restores editor context', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const list = await readFile(new URL('../src/components/NoteList.tsx', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /onNavigateRecent=\{\(\) => \{ flushCurrentDraft\(\); onNavigateRecent\(\); \}\}/);
  assert.match(app, /onNavigateRecent=\{handleNavigateRecent\}/);
  assert.match(app, /setRecentReturn\(\{ view, selectedNoteId, mobileDestination, searchQuery, mobileNoteReturn \}\)/);
  assert.match(app, /const handleSelectNote = \(id: string\) => \{[\s\S]*?recordNoteOpen\(id\);/);
  assert.match(app, /setSelectedNoteId\(recentReturn\.selectedNoteId\)/);
  assert.match(app, /mobileRecentMode=\{!isDesktop && view\.kind === 'recent'\}/);
  assert.match(list, /<h1>Ghi chú gần đây<\/h1>/);
  assert.match(list, /mobileRecentMode \? mobileRecentGroups : mobileAllNoteGroups/);
  assert.match(list, /onOpen=\{\(\) => onSelectNote\(note\.id\)\}/);
});
