import type { Folder } from '@/types';

export function getFolderHierarchy(folders: Folder[]): Array<{ folder: Folder; depth: number }>;
export function getFolderOptionLabel(folder: Folder, depth?: number): string;
export function getFolderDisplayPath(folders: Folder[], folderId: string): string;
export function getFolderAncestorIds(folders: Folder[], folderId: string): string[];
export function removeFolderAndPromoteChildren(folders: Folder[], folderId: string): { folders: Folder[]; reparented: Folder[] };
