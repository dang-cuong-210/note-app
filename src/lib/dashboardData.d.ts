import type { Folder, Note, TagInfo } from '../types';
import type { ViewType } from './navigation';

export function getInitialView(): ViewType;
export function shouldAutoSelectNote(view: ViewType): boolean;
export function getDashboardNoteDestination(noteId: string): { view: ViewType; selectedNoteId: string };
export function getDashboardActiveNotes(notes: Note[]): Note[];
export function getDashboardPinnedNotes(notes: Note[], limit?: number): Note[];
export function getDashboardRecentNotes(notes: Note[], limit?: number): Note[];
export function getDirectFolderNoteCount(notes: Note[], folderId: Folder['id']): number;
export function getDashboardQuickTags(tags: TagInfo[], limit?: number): TagInfo[];
export function getDashboardSearchDestination(query: string): { view: ViewType; query: string };
