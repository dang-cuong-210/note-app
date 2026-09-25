export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  revision?: number; // Last confirmed server revision for optimistic concurrency
  syncPending?: boolean; // Local IndexedDB flag; not sent to Supabase
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  sortBy: 'updated' | 'created' | 'title';
  sortDir: 'asc' | 'desc';
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 'md',
  sortBy: 'updated',
  sortDir: 'desc',
};

export interface Attachment {
  id: string;
  noteId: string;
  name: string;
  type: string;
  size: number;
  storagePath: string;
  url: string | null;
  createdAt: number;
}

export interface TagInfo {
  name: string;
  count: number;
}
