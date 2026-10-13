export function getMobileDestinationAfterView(view) {
  if (view.kind === 'home') return 'home';
  if (view.kind === 'settings') return 'more';
  if (view.kind === 'all') return 'all';
  return 'search';
}

export function getMobileSearchState(query) {
  return { destination: 'search', view: { kind: 'all' }, query: query.trim(), selectedNoteId: null };
}

export function getMobileFolderState(folderId) {
  return { destination: 'search', view: { kind: 'folder', id: folderId }, selectedNoteId: null };
}

export function getMobileRecentState() {
  return { destination: 'search', view: { kind: 'recent' }, selectedNoteId: null };
}

export function getMobileNewNoteState(noteId) {
  return { destination: 'search', view: { kind: 'all' }, folderId: null, selectedNoteId: noteId };
}

export function shouldShowMobileBottomNav(isDesktop, selectedNoteId, view) {
  return !isDesktop && view.kind !== 'home' && (!selectedNoteId || view.kind === 'trash');
}
