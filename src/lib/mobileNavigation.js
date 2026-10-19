import { getNotesInView } from './advancedSearch.js';

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

export function getMobileNewNoteState(noteId) {
  return { destination: 'search', view: { kind: 'all' }, folderId: null, selectedNoteId: noteId };
}

export function shouldShowMobileBottomNav(isDesktop, selectedNoteId, view) {
  return !isDesktop && view.kind !== 'home' && (!selectedNoteId || view.kind === 'trash');
}
/** Save the first list origin for an editor session; editor-created notes keep it. */
export function captureMobileNoteOrigin(current, existing = null, preserveExisting = false, openedNoteId = null) {
  if (preserveExisting && existing) return existing;
  return { ...current, openedNoteId };
}

/** Restore a mobile editor's origin, falling back when its context disappeared. */
export function resolveMobileNoteOrigin({ origin, notes = [], folders = [] }) {
  const fallback = { view: { kind: 'home' }, selectedNoteId: null, mobileDestination: 'home', searchQuery: '' };
  if (!origin || ['settings', 'trash'].includes(origin.view?.kind)) return fallback;
  if (origin.view.kind === 'folder' && !folders.some((folder) => folder.id === origin.view.id)) return fallback;

  const inView = getNotesInView(notes, origin.view);
  if (origin.openedNoteId && ['recent', 'pinned', 'archived', 'tag'].includes(origin.view.kind) &&
      !inView.some((note) => note.id === origin.openedNoteId)) return fallback;

  const selectedNoteId = origin.selectedNoteId && inView.some((note) => note.id === origin.selectedNoteId)
    ? origin.selectedNoteId
    : null;
  return {
    view: origin.view,
    selectedNoteId,
    mobileDestination: origin.mobileDestination,
    searchQuery: origin.searchQuery,
  };
}

export function getMobileNoteOriginLabel(origin, folders = []) {
  if (!origin) return 'Ghi chú';
  switch (origin.view.kind) {
    case 'home': return 'Trang chủ';
    case 'all': return origin.mobileDestination === 'all' ? 'Tất cả ghi chú' : 'Tìm kiếm';
    case 'recent': return 'Gần đây';
    case 'pinned': return 'Đã ghim';
    case 'archived': return 'Lưu trữ';
    case 'folder': return folders.find((folder) => folder.id === origin.view.id)?.name || 'Thư mục';
    case 'tag': return `#${origin.view.name}`;
    default: return 'Ghi chú';
  }
}
