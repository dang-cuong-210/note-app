const TAG_METADATA_PATTERN = /<!--TANOOKI_TAGS:([^]*?)-->/g;

export function normalizeTagName(input) {
  const normalized = String(input ?? '')
    .normalize('NFC')
    .trim()
    .replace(/^#+/, '')
    .replace(/#/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLocaleLowerCase('vi');
  return normalized || null;
}

export function readManagedTags(content = '') {
  const tags = [];
  for (const match of String(content).matchAll(TAG_METADATA_PATTERN)) {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1]));
      if (Array.isArray(parsed)) tags.push(...parsed);
    } catch {
      // Ignore malformed metadata and preserve normal note content.
    }
  }
  return [...new Set(tags.map(normalizeTagName).filter(Boolean))];
}

export function extractTagsFromContent(content = '') {
  const html = String(content);
  const managed = readManagedTags(html);
  let text = html;
  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = html.replace(TAG_METADATA_PATTERN, '');
    container.querySelectorAll('script, style').forEach((node) => node.remove());
    text = container.textContent || '';
  } else {
    text = html
      .replace(TAG_METADATA_PATTERN, ' ')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&num;/gi, '#')
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ');
  }
  const inline = text.match(/#[\p{L}\p{M}\p{N}_]+(?:-[\p{L}\p{M}\p{N}_]+)*/gu) || [];
  return [...new Set([...inline.map((tag) => normalizeTagName(tag)), ...managed].filter(Boolean))];
}

export function writeManagedTags(content = '', tags = []) {
  const withoutMetadata = String(content).replace(TAG_METADATA_PATTERN, '');
  const normalized = [...new Set(tags.map(normalizeTagName).filter(Boolean))];
  if (!normalized.length) return withoutMetadata;
  const metadata = `<!--TANOOKI_TAGS:${encodeURIComponent(JSON.stringify(normalized))}-->`;
  return `${withoutMetadata}${metadata}`;
}

export function addTagToContent(content = '', rawTag) {
  const tag = normalizeTagName(rawTag);
  if (!tag) return { content: String(content), tag: null, changed: false };
  const existing = extractTagsFromContent(content);
  if (existing.includes(tag)) return { content: String(content), tag, changed: false };
  const managed = [...readManagedTags(content), tag];
  return { content: writeManagedTags(content, managed), tag, changed: true };
}

export function removeTagFromContent(content = '', rawTag) {
  const tag = normalizeTagName(rawTag);
  if (!tag) return { content: String(content), tag: null, changed: false };
  const source = String(content);
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hashtag = new RegExp(`#${escaped}(?![\\p{L}\\p{M}\\p{N}_-])`, 'giu');
  let removedInline = false;
  const withoutInline = source
    .replace(TAG_METADATA_PATTERN, '')
    .replace(/(<!--[^]*?-->|<[^>]*>|[^<]+)/g, (part) => {
      if (part.startsWith('<')) return part;
      return part.replace(hashtag, () => { removedInline = true; return ''; });
    });
  const managed = readManagedTags(source).filter((item) => item !== tag);
  const changed = removedInline || managed.length !== readManagedTags(source).length;
  return { content: changed ? writeManagedTags(withoutInline, managed) : source, tag, changed };
}

export function getTagSuggestions(notes = [], currentNoteId, query = '') {
  const normalizedQuery = normalizeTagName(query);
  const allTags = new Set();
  for (const note of notes) {
    if (note.trashed || note.id === currentNoteId) continue;
    for (const tag of extractTagsFromContent(note.content)) allTags.add(tag);
  }
  return [...allTags]
    .filter((tag) => !normalizedQuery || tag.includes(normalizedQuery))
    .sort((a, b) => a.localeCompare(b, 'vi'));
}
