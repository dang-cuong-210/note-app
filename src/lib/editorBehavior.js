const MANAGED_TAGS_PATTERN = /<!--TANOOKI_TAGS:([^]*?)-->/g;
const EMPTY_SPACE_ENTITIES = /&(?:nbsp|ensp|emsp|thinsp|hairsp|numsp|puncsp|MediumSpace|ThickSpace|ZeroWidthSpace);/gi;

function decodeNumericEntities(value) {
  return value.replace(/&#(?:x([\da-f]+)|(\d+));?/gi, (entity, hex, decimal) => {
    const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
    try { return String.fromCodePoint(codePoint); } catch { return entity; }
  });
}

function hasManagedTag(content) {
  for (const match of content.matchAll(MANAGED_TAGS_PATTERN)) {
    try {
      const tags = JSON.parse(decodeURIComponent(match[1]));
      if (Array.isArray(tags) && tags.some((tag) => String(tag ?? '').trim())) return true;
    } catch {
      // Invalid metadata does not make an otherwise empty draft meaningful.
    }
  }
  return false;
}

export function isMeaningfulNoteContent(title = '', html = '', hasAttachments = false) {
  const normalizedTitle = String(title ?? '').trim();
  if (normalizedTitle && !/^(?:ghi chú mới|new note|untitled)$/i.test(normalizedTitle)) return true;
  if (hasAttachments) return true;

  const source = String(html ?? '');
  if (/<(?:img|video|audio|iframe|object|embed|table|hr)\b|data-noted-attachment-id\s*=/i.test(source)) return true;
  if (hasManagedTag(source)) return true;

  const withoutNonContent = source
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(EMPTY_SPACE_ENTITIES, ' ');
  const text = decodeNumericEntities(withoutNonContent)
    .replace(/[\s\u00a0\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g, '');
  return Boolean(text || /&(?:amp|lt|gt|quot|apos);|&(?:#x?[\da-f]+);?/i.test(withoutNonContent));
}

export function getBlankLinesToAppend(targetY, endY, lineHeight, maxLines = 32) {
  const target = Number(targetY);
  const end = Number(endY);
  const height = Number(lineHeight);
  const limit = Math.max(0, Math.floor(Number(maxLines) || 0));
  if (!Number.isFinite(target) || !Number.isFinite(end) || !Number.isFinite(height) || height <= 0 || limit === 0) return 0;
  if (target <= end + 1) return 0;
  return Math.min(limit, Math.max(1, Math.ceil((target - end) / height)));
}

export function canDiscardUnsentDraftOffline({ debouncePending, confirmedRevision, inFlight }) {
  return Boolean(debouncePending && !inFlight && (confirmedRevision ?? -1) < 0);
}

export function shouldDiscardNewEmptyDraft({ createdInSession, everMeaningful, explicitlyDeleted = false }) {
  return Boolean(createdInSession && !everMeaningful && !explicitlyDeleted);
}
