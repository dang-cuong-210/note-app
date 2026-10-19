import type { Attachment, Note } from '@/types';

export interface CreatedMediaObject { bucket: 'note-images' | 'note-files'; path: string }
export interface CopiedAttachmentRow extends Attachment { noteId: string }
export interface PreparedNoteMediaCopy {
  content: string;
  attachments: CopiedAttachmentRow[];
  createdObjects: CreatedMediaObject[];
  cleanup: () => Promise<void>;
}
export interface NoteMediaStorageAdapter {
  copyImage: (source: string, destination: string) => Promise<void>;
  signImage: (path: string) => Promise<string>;
  copyAttachment: (source: string, destination: string) => Promise<void>;
  signAttachment: (path: string) => Promise<string | null>;
  remove: (objects: CreatedMediaObject[]) => Promise<void>;
}
export function imageStoragePathFromUrl(url: string): string | null;
export function noteHasManagedMedia(content: string, attachments: Attachment[]): boolean;
export function assertMediaDuplicationOnline(containsMedia: boolean, online: boolean): void;
export function rewriteDuplicatedContent(content: string, imageUrlByPath: Map<string, string>, attachmentIdMap: Map<string, string>): string;
export function prepareNoteMediaCopy(options: {
  note: Note;
  attachments: Attachment[];
  accountId: string;
  newNoteId: string;
  createId: () => string;
  now: number;
  storage: NoteMediaStorageAdapter;
}): Promise<PreparedNoteMediaCopy>;
