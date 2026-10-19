import type { Note } from '@/types';
import type { ViewType } from './navigation';

export function reconcileDesktopSelection(args: {
  notes: Note[];
  view: ViewType;
  selectedNoteId: string | null;
  candidateNotes?: Note[];
}): string | null;
