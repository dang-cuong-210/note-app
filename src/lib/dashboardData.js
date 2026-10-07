/** Pure dashboard selectors shared by the UI and regression tests. */
export function getInitialView(isDesktop) {
  return isDesktop ? { kind: 'home' } : { kind: 'all' };
}

export function shouldAutoSelectNote(view) {
  return view.kind !== 'home' && view.kind !== 'settings' && view.kind !== 'trash';
}

export function getDashboardNoteDestination(noteId) {
  return { view: { kind: 'all' }, selectedNoteId: noteId };
}

export function getDashboardActiveNotes(notes) {
  return notes.filter((note) => !note.trashed && !note.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDashboardPinnedNotes(notes, limit = 4) {
  return getDashboardActiveNotes(notes).filter((note) => note.pinned).slice(0, limit);
}

export function getDashboardRecentNotes(notes, limit = 5) {
  return getDashboardActiveNotes(notes).slice(0, limit);
}

export function getDirectFolderNoteCount(notes, folderId) {
  return notes.filter((note) => note.folderId === folderId && !note.trashed && !note.archived).length;
}

export function getDashboardQuickTags(tags, limit = 8) {
  return [...tags].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

export function getDashboardSearchDestination(query) {
  return { view: { kind: 'all' }, query: query.trim() };
}
