import { getNotesInView } from './advancedSearch.js';
import { shouldAutoSelectNote } from './dashboardData.js';

/** Keep a desktop editor selection valid for the active note-list view. */
export function reconcileDesktopSelection({ notes, view, selectedNoteId, candidateNotes = notes }) {
  const viewNoteIds = new Set(getNotesInView(notes, view).map((note) => note.id));

  if (selectedNoteId && viewNoteIds.has(selectedNoteId)) return selectedNoteId;
  if (!shouldAutoSelectNote(view)) return null;

  return candidateNotes.find((note) => viewNoteIds.has(note.id))?.id ?? null;
}
