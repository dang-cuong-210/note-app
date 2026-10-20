import type { Note, Folder, Settings } from '@/types';

export const TANOOKI_BACKUP_FORMAT: 'tanooki-json-backup';
export interface JsonBackup {
  format: 'tanooki-json-backup';
  version: 0 | 1;
  legacy: boolean;
  notes: Note[];
  folders: Folder[];
  settings?: Partial<Settings>;
}
export interface JsonImportSummary {
  notesToAdd: number;
  notesToUpdate: number;
  foldersToAdd: number;
  foldersToUpdate: number;
  applySettings: boolean;
}
export function exportJsonBackup(notes: Note[], folders: Folder[], settings: Settings, exportedAt?: string): string;
export function parseJsonBackup(json: string): JsonBackup;
export function summarizeJsonImport(data: JsonBackup, currentNotes: Note[], currentFolders: Folder[]): JsonImportSummary;
export function mergeJsonBackupData(data: Pick<JsonBackup, 'notes' | 'folders'>, currentNotes: Note[], currentFolders: Folder[]): {
  notes: Note[]; folders: Folder[]; notesAdded: number; notesUpdated: number; foldersAdded: number; foldersUpdated: number;
};
