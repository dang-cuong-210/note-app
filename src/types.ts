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

export interface TagInfo {
  name: string;
  count: number;
}
