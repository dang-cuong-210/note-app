import type { Note, Folder, Settings, TagInfo } from '@/types';
import { normalizeSearchText, stripHtmlToText } from '@/lib/advancedSearch.js';
import { extractTagsFromContent } from '@/lib/tagUtils.js';

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function createNote(folderId: string | null = null): Note {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    content: '',
    folderId,
    pinned: false,
    archived: false,
    trashed: false,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function sortNotes(notes: Note[], settings: { sortBy: 'updated' | 'created' | 'title'; sortDir: 'asc' | 'desc' }): Note[] {
  const sorted = [...notes];
  const dir = settings.sortDir === 'asc' ? 1 : -1;
  sorted.sort((a, b) => {
    switch (settings.sortBy) {
      case 'created':
        return (a.createdAt - b.createdAt) * dir;
      case 'title':
        return a.title.localeCompare(b.title) * dir;
      default:
        return (a.updatedAt - b.updatedAt) * dir;
    }
  });
  // Pinned always first
  return sorted.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

/** Extract plain text from HTML for preview and search. */
export function htmlToText(html: string): string {
  return stripHtmlToText(html);
}

/** Get a short preview of note content. */
export function getPreview(content: string, maxLen = 120): string {
  const text = htmlToText(content);
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

/** Extract #tags from note content (as plain text). */
export function extractTags(content: string): string[] {
  return extractTagsFromContent(content);
}

/** Get all tags with counts from notes. */
export function getAllTags(notes: Note[]): TagInfo[] {
  const map = new Map<string, number>();
  for (const note of notes) {
    if (note.trashed) continue;
    for (const tag of extractTags(note.content)) {
      map.set(tag, (map.get(tag) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Check if note contains a tag. */
export function noteHasTag(note: Note, tag: string): boolean {
  return extractTags(note.content).includes(tag.toLowerCase());
}

/** Format timestamp for list display. */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Apply theme to document root. */
export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
}

/** Apply font size class to root. */
export function applyFontSize(size: Settings['fontSize']) {
  const root = document.documentElement;
  root.classList.remove('text-size-sm', 'text-size-md', 'text-size-lg', 'text-size-xl');
  root.classList.add(`text-size-${size}`);
}

/** Export all data as JSON. */
export function exportData(notes: Note[], folders: Folder[], settings: Settings): string {
  return JSON.stringify({ version: 1, notes, folders, settings }, null, 2);
}

/** Parse imported JSON. */
export function parseImport(json: string): {
  notes?: Note[];
  folders?: Folder[];
  settings?: Settings;
} {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object') throw new Error('Invalid file');
  return data;
}

/** Search notes by query in title and content. */
export function searchNotes(notes: Note[], query: string): Note[] {
  const q = normalizeSearchText(query);
  if (!q) return notes;
  return notes.filter((n) => {
    const title = normalizeSearchText(n.title);
    const content = normalizeSearchText(htmlToText(n.content));
    return title.includes(q) || content.includes(q);
  });
}
