const LAYOUT_PATTERN = /<!--NOTED_ATTACHMENT_LAYOUT:([^>]*)-->/g;

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function imageStoragePathFromUrl(url) {
  const match = decodeHtmlAttribute(url).match(/\/note-images\/(.+?)(?:\?|$)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function assertOwnedPath(path, accountId) {
  const parts = path.split('/');
  if (parts[0] !== accountId || parts.length < 3 || parts.some((part) => !part || part === '.' || part === '..') || path.includes('\\')) {
    throw new Error('A media file is outside the authenticated account folder.');
  }
}

function imageSources(content) {
  const sources = [];
  const tags = content.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const source = match && decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? '');
    if (source && imageStoragePathFromUrl(source)) sources.push({ tag, source, path: imageStoragePathFromUrl(source) });
  }
  return sources;
}

export function noteHasManagedMedia(content, attachments) {
  return imageSources(content).length > 0 || attachments.length > 0 || /data-noted-attachment-id\s*=/i.test(content);
}

export function assertMediaDuplicationOnline(containsMedia, online) {
  if (containsMedia && !online) {
    throw new Error('Cần kết nối mạng để nhân bản ghi chú có hình ảnh hoặc tệp đính kèm.');
  }
}

function rewriteLayout(content, idMap) {
  return content.replace(LAYOUT_PATTERN, (marker, encoded) => {
    let layout;
    try {
      layout = JSON.parse(decodeURIComponent(encoded));
    } catch {
      throw new Error('Attachment layout metadata could not be copied safely.');
    }
    if (Array.isArray(layout.order)) layout.order = layout.order.map((id) => idMap.get(id) ?? id);
    if (layout.widths && typeof layout.widths === 'object') {
      layout.widths = Object.fromEntries(Object.entries(layout.widths).map(([id, width]) => [idMap.get(id) ?? id, width]));
    }
    return `<!--NOTED_ATTACHMENT_LAYOUT:${encodeURIComponent(JSON.stringify(layout))}-->`;
  });
}

export function rewriteDuplicatedContent(content, imageUrlByPath, attachmentIdMap) {
  let rewritten = content.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!match) return tag;
    const source = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? '');
    const path = imageStoragePathFromUrl(source);
    const replacement = path && imageUrlByPath.get(path);
    if (!replacement) return tag;
    const escapedUrl = replacement.replace(/&/g, '&amp;');
    const quote = match[1] !== undefined ? '"' : match[2] !== undefined ? "'" : '';
    const value = quote ? `${quote}${escapedUrl}${quote}` : escapedUrl;
    return tag.replace(match[0], `src=${value}`);
  });
  rewritten = rewritten.replace(/(data-noted-attachment-id\s*=\s*)(["'])([^"']+)\2/gi, (full, prefix, quote, id) => {
    return `${prefix}${quote}${attachmentIdMap.get(id) ?? id}${quote}`;
  });
  return rewriteLayout(rewritten, attachmentIdMap);
}

/**
 * Copies note-owned media before the caller commits the note and attachment rows.
 * The injected adapter keeps this workflow deterministic in regression tests.
 */
export async function prepareNoteMediaCopy({ note, attachments, accountId, newNoteId, createId, now, storage }) {
  const createdObjects = [];
  const imageUrlByPath = new Map();
  const attachmentIdMap = new Map();
  const copiedAttachments = [];
  const sources = imageSources(note.content);

  const cleanup = async () => {
    if (createdObjects.length) await storage.remove(createdObjects);
  };

  try {
    for (const [index, { path }] of [...new Map(sources.map((image) => [image.path, image])).values()].entries()) {
      assertOwnedPath(path, accountId);
      const destination = `${accountId}/${newNoteId}/${index}-${path.split('/').at(-1)}`;
      await storage.copyImage(path, destination);
      createdObjects.push({ bucket: 'note-images', path: destination });
      imageUrlByPath.set(path, await storage.signImage(destination));
    }

    for (const [index, attachment] of attachments.entries()) {
      assertOwnedPath(attachment.storagePath, accountId);
      if (!attachment.id || attachmentIdMap.has(attachment.id)) throw new Error('Attachment metadata is invalid.');
      const id = createId();
      const destination = `${accountId}/${newNoteId}/${id}-${attachment.storagePath.split('/').at(-1)}`;
      await storage.copyAttachment(attachment.storagePath, destination);
      createdObjects.push({ bucket: 'note-files', path: destination });
      attachmentIdMap.set(attachment.id, id);
      copiedAttachments.push({
        id,
        noteId: newNoteId,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        storagePath: destination,
        url: await storage.signAttachment(destination),
        createdAt: now + index,
      });
    }

    const referencedIds = [...note.content.matchAll(/data-noted-attachment-id\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    if (referencedIds.some((id) => !attachmentIdMap.has(id))) throw new Error('An attachment referenced by this note is unavailable.');

    return {
      content: rewriteDuplicatedContent(note.content, imageUrlByPath, attachmentIdMap),
      attachments: copiedAttachments,
      createdObjects,
      cleanup,
    };
  } catch (error) {
    try { await cleanup(); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}
