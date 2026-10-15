import type { Note } from '@/types';

export const RECENT_OPEN_WRITE_INTERVAL: number;
export function loadRecentOpenTimes(storage: Pick<Storage, 'getItem'> | null, accountId: string | null): Record<string, number>;
export function recordRecentOpen(storage: Pick<Storage, 'getItem' | 'setItem'> | null, accountId: string | null, noteId: string, now: number, currentTimes?: Record<string, number>, writeInterval?: number): { times: Record<string, number>; recorded: boolean };
export function getEffectiveRecentTime(note: Note, openedAt?: Record<string, number>): number;
export function getRecentNotes(notes: Note[], openedAt?: Record<string, number>): Note[];
export function groupMobileRecentNotes(notes: Note[], openedAt?: Record<string, number>, now?: Date): Array<{ label: string; notes: Note[] }>;
