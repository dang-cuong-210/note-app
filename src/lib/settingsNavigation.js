import { getNotesInView } from './advancedSearch.js';

/** Capture the first origin only; repeated Settings navigation keeps it intact. */
export function captureSettingsReturnContext(current, existing = null) {
  if (current.view.kind === 'settings') return existing;
  return { ...current };
}

/** Resolve a saved Settings origin against current data and choose a safe fallback. */
export function resolveSettingsReturnContext({ origin, notes = [], folders = [], isDesktop }) {
  const fallback = isDesktop
    ? { view: { kind: 'all' }, selectedNoteId: null, mobileDestination: 'all', searchQuery: '' }
    : { view: { kind: 'home' }, selectedNoteId: null, mobileDestination: 'home', searchQuery: '' };

  if (!origin || origin.view.kind === 'settings') return fallback;
  if (origin.view.kind === 'folder' && !folders.some((folder) => folder.id === origin.view.id)) return fallback;

  const originNoteIds = new Set(getNotesInView(notes, origin.view).map((note) => note.id));
  const selectedNoteId = origin.selectedNoteId && originNoteIds.has(origin.selectedNoteId)
    ? origin.selectedNoteId
    : null;

  return {
    view: origin.view,
    selectedNoteId,
    mobileDestination: origin.mobileDestination,
    searchQuery: origin.searchQuery,
  };
}
