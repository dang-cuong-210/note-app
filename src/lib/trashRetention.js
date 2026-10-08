export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpiredTrashedNote(note, now = Date.now()) {
  return Boolean(
    note?.trashed === true &&
    typeof note.trashedAt === 'number' &&
    Number.isFinite(note.trashedAt) &&
    now - note.trashedAt >= TRASH_RETENTION_MS
  );
}

/** Deletes eligible notes sequentially through the caller's existing delete flow. */
export async function cleanupExpiredTrashedNotes(notes, {
  now = Date.now(),
  isOnline,
  isStillExpired = (note) => isExpiredTrashedNote(note, Date.now()),
  permanentDelete,
  onFailure,
}) {
  const deletedIds = [];
  const failedIds = [];

  for (const note of notes.filter((candidate) => isExpiredTrashedNote(candidate, now))) {
    if (!isOnline()) return { deletedIds, failedIds, stoppedOffline: true };
    if (!isStillExpired(note)) continue;

    try {
      await permanentDelete(note.id);
      deletedIds.push(note.id);
    } catch (error) {
      failedIds.push(note.id);
      onFailure?.(note.id, error);
      if (!isOnline()) return { deletedIds, failedIds, stoppedOffline: true };
    }
  }

  return { deletedIds, failedIds, stoppedOffline: false };
}
