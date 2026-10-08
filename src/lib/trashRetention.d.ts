import type { Note } from '../types';

export const TRASH_RETENTION_MS: number;
export function isExpiredTrashedNote(note: Note | null | undefined, now?: number): boolean;
export function cleanupExpiredTrashedNotes(
  notes: Note[],
  options: {
    now?: number;
    isOnline: () => boolean;
    isStillExpired?: (note: Note) => boolean;
    permanentDelete: (id: string) => Promise<void>;
    onFailure?: (id: string, error: unknown) => void;
  },
): Promise<{ deletedIds: string[]; failedIds: string[]; stoppedOffline: boolean }>;
