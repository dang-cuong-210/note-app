import type { ViewType } from './navigation';

export type MobileDestination = 'home' | 'search' | 'all' | 'folders' | 'more';
export function getMobileDestinationAfterView(view: ViewType): MobileDestination;
export function getMobileSearchState(query: string): { destination: 'search'; view: { kind: 'all' }; query: string; selectedNoteId: null };
export function getMobileFolderState(folderId: string): { destination: 'search'; view: { kind: 'folder'; id: string }; selectedNoteId: null };
export function getMobileNewNoteState(noteId: string): { destination: 'search'; view: { kind: 'all' }; folderId: null; selectedNoteId: string };
export function shouldShowMobileBottomNav(isDesktop: boolean, selectedNoteId: string | null, view: ViewType): boolean;
export type MobileNoteOrigin = { view: ViewType; selectedNoteId: string | null; mobileDestination: MobileDestination; searchQuery: string; openedNoteId?: string | null };
export function captureMobileNoteOrigin(current: Omit<MobileNoteOrigin, 'openedNoteId'>, existing?: MobileNoteOrigin | null, preserveExisting?: boolean, openedNoteId?: string | null): MobileNoteOrigin;
export function noteBelongsToMobileOrigin(note: import('@/types').Note | null | undefined, origin: MobileNoteOrigin | null): boolean;
export function resolveMobileNoteOrigin(args: { origin: MobileNoteOrigin | null; notes: import('@/types').Note[]; folders: import('@/types').Folder[] }): Omit<MobileNoteOrigin, 'openedNoteId'>;
export function getMobileNoteOriginLabel(origin: MobileNoteOrigin | null, folders?: import('@/types').Folder[]): string;
