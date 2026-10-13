import type { Note } from '@/types';

export interface MobileNoteGroup {
  label: string;
  notes: Note[];
}

export function groupMobileAllNotes(notes: Note[], now?: Date): MobileNoteGroup[];
export function formatMobileAllNoteDate(timestamp: number, now?: Date): string;
