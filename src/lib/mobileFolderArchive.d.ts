import type { Folder } from '@/types';

export function getMobileChildFolders(folders: Folder[], parentId: string, query?: string): Folder[];
export function getMobileFolderSummary(noteCount: number, folderCount: number): string;
