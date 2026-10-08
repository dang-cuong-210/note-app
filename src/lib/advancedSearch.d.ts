import type { Note } from '@/types';

export interface SearchRecord {
  note: Note;
  titleText: string;
  bodyText: string;
  tags: string[];
  titleNormalized: string;
  bodyNormalized: string;
}
export interface SearchFilters {
  query?: string;
  folderId?: string;
  tag?: string;
  pinned?: 'all' | 'pinned' | 'unpinned';
  archive?: 'current' | 'active' | 'archived' | 'all';
}
export function stripHtmlToText(html?: string): string;
export function normalizeSearchText(text?: string): string;
export function buildSearchRecords(notes: Note[]): SearchRecord[];
export function getNotesInView(notes: Note[], view: { kind: string; id?: string; name?: string }): Note[];
export function filterSearchRecords(records: SearchRecord[], filters: SearchFilters, view: { kind: string }): SearchRecord[];
export function sortSearchNotes(notes: Note[], mode?: 'updated' | 'created' | 'title-asc' | 'title-desc', promotePinned?: boolean): Note[];
export function getSearchSnippet(text: string, query: string, maxLength?: number): string;
export function highlightSegments(text: string, query: string): { text: string; match: boolean }[];
