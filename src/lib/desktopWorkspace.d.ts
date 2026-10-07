import type { Attachment, Folder, Note } from '@/types';
import type { ViewType } from '@/lib/navigation';

export function getDesktopViewLabel(view: ViewType, folders: Folder[]): string;
export function getDesktopNoteProperties(note: Note, folders: Folder[], attachments: Attachment[], text: string, tags: string[]): {
  createdAt: number;
  updatedAt: number;
  folderName: string | null;
  tags: string[];
  attachmentCount: number;
  wordCount: number;
  characterCount: number;
  pinned: boolean;
  archived: boolean;
};
