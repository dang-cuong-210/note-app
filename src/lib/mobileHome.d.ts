import type { Folder, Note } from '../types';

export function getMobileHomeCounts(notes: Note[]): { active: number; archived: number; trashed: number };
export function getMobileHomeFolderCount(notes: Note[], folderId: string): number;
export function getMatchingMobileHomeFolders(folders: Folder[], query: string): Folder[];
