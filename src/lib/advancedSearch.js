import { extractTagsFromContent } from './tagUtils.js';

const namedEntities = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  '#39': "'",
};

export function stripHtmlToText(html = '') {
  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = String(html);
    container.querySelectorAll('script, style').forEach((node) => node.remove());
    container.querySelectorAll('br').forEach((node) => node.replaceWith(' '));
    container.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote').forEach((node) => node.append(' '));
    return (container.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return String(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z\d]+);/gi, (entity, code) => {
      if (code[0] === '#') {
        const hex = code[1]?.toLowerCase() === 'x';
        const value = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(value) ? String.fromCodePoint(value) : ' ';
      }
      return namedEntities[code.toLowerCase()] ?? ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSearchText(text = '') {
  return String(text).normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function buildSearchRecords(notes) {
  return notes.map((note) => {
    const bodyText = stripHtmlToText(note.content);
    return {
      note,
      titleText: note.title || '',
      bodyText,
      tags: extractTagsFromHtml(note.content),
      titleNormalized: normalizeSearchText(note.title),
      bodyNormalized: normalizeSearchText(bodyText),
    };
  });
}

export function getNotesInView(notes, view) {
  return notes.filter((note) => isInView(note, view));
}

function isInView(note, view) {
  switch (view.kind) {
    case 'all':
    case 'recent': return !note.trashed && !note.archived;
    case 'pinned': return !note.trashed && !note.archived && note.pinned;
    case 'archived': return !note.trashed && note.archived;
    case 'trash': return note.trashed;
    case 'folder': return !note.trashed && !note.archived && note.folderId === view.id;
    case 'tag': return !note.trashed && !note.archived && extractTagsFromHtml(note.content).includes(view.name.toLowerCase());
    default: return false;
  }
}

function extractTagsFromHtml(html) { return extractTagsFromContent(html); }

export function filterSearchRecords(records, { query = '', folderId = 'all', tag = 'all', pinned = 'all', archive = 'current' } = {}, view) {
  const normalizedQuery = normalizeSearchText(query);
  return records.filter(({ note, titleNormalized, bodyNormalized, tags }) => {
    const inScope = view.kind === 'all'
      ? archive === 'all' ? !note.trashed
        : archive === 'archived' ? !note.trashed && note.archived
          : !note.trashed && !note.archived
      : isInView(note, view);
    if (!inScope) return false;
    if (folderId !== 'all' && note.folderId !== (folderId === 'none' ? null : folderId)) return false;
    if (tag !== 'all' && !tags.includes(tag)) return false;
    if (pinned === 'pinned' && !note.pinned) return false;
    if (pinned === 'unpinned' && note.pinned) return false;
    return !normalizedQuery || titleNormalized.includes(normalizedQuery) || bodyNormalized.includes(normalizedQuery);
  });
}

export function sortSearchNotes(notes, mode = 'updated', promotePinned = false) {
  const indexed = notes.map((note, index) => ({ note, index }));
  indexed.sort((a, b) => {
    const left = a.note;
    const right = b.note;
    if (promotePinned && left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    let result = 0;
    if (mode === 'created') result = right.createdAt - left.createdAt;
    else if (mode === 'title-asc' || mode === 'title-desc') {
      result = (left.title || '').localeCompare(right.title || '', undefined, { sensitivity: 'base' });
      if (mode === 'title-desc') result *= -1;
    } else result = right.updatedAt - left.updatedAt;
    if (result) return result;
    const titleTie = (left.title || '').localeCompare(right.title || '', undefined, { sensitivity: 'base' });
    return titleTie || left.id.localeCompare(right.id) || a.index - b.index;
  });
  return indexed.map(({ note }) => note);
}

export function getSearchSnippet(text, query, maxLength = 120) {
  const plainText = String(text || '').replace(/\s+/g, ' ').trim();
  if (plainText.length <= maxLength) return plainText;
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean);
  const expression = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const match = expression ? new RegExp(expression, 'iu').exec(plainText) : null;
  if (!match || match.index < 0) return `${plainText.slice(0, maxLength).trimEnd()}…`;
  const context = Math.max(18, Math.floor((maxLength - match[0].length) / 2));
  let start = Math.max(0, match.index - context);
  let end = Math.min(plainText.length, start + maxLength);
  if (end - start < maxLength) start = Math.max(0, end - maxLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plainText.length ? '…' : '';
  return `${prefix}${plainText.slice(start, end).trim()}${suffix}`;
}

export function highlightSegments(text, query) {
  const value = String(text || '');
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (!value || !terms.length) return [{ text: value, match: false }];
  const expression = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const regex = new RegExp(expression, 'giu');
  const segments = [];
  let cursor = 0;
  let match;
  while ((match = regex.exec(value))) {
    if (match.index > cursor) segments.push({ text: value.slice(cursor, match.index), match: false });
    segments.push({ text: match[0], match: true });
    cursor = match.index + match[0].length;
    if (!match[0].length) regex.lastIndex += 1;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), match: false });
  return segments.length ? segments : [{ text: value, match: false }];
}
