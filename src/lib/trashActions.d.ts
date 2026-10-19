import type { Note } from '../types';

export function confirmPermanentTrashDelete(
  note: Note | null | undefined,
  options: {
    isMobile: boolean;
    confirm: (message: string) => boolean;
    permanentDelete: (id: string) => Promise<void>;
  },
): Promise<boolean>;
