import type { Note } from '@/types';

export function normalizeTagName(input: string): string | null;
export function readManagedTags(content?: string): string[];
export function extractTagsFromContent(content?: string): string[];
export function writeManagedTags(content: string, tags: string[]): string;
export function addTagToContent(content: string, rawTag: string): { content: string; tag: string | null; changed: boolean };
export function removeTagFromContent(content: string, rawTag: string): { content: string; tag: string | null; changed: boolean };
export function getTagSuggestions(notes: Note[], currentNoteId: string, query?: string): string[];
