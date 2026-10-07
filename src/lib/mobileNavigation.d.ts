import type { ViewType } from './navigation';

export type MobileDestination = 'home' | 'search' | 'folders' | 'more';
export function getMobileDestinationAfterView(view: ViewType): MobileDestination;
export function getMobileSearchState(query: string): { destination: 'search'; view: { kind: 'all' }; query: string; selectedNoteId: null };
export function getMobileFolderState(folderId: string): { destination: 'search'; view: { kind: 'folder'; id: string }; selectedNoteId: null };
export function getMobileRecentState(): { destination: 'search'; view: { kind: 'recent' }; selectedNoteId: null };
export function getMobileNewNoteState(noteId: string): { destination: 'search'; view: { kind: 'all' }; folderId: null; selectedNoteId: string };
export function shouldShowMobileBottomNav(isDesktop: boolean, selectedNoteId: string | null, view: ViewType): boolean;
