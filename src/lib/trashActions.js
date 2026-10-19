const MOBILE_SINGLE_DELETE_COPY = (note) =>
  `Xóa vĩnh viễn ghi chú “${note.title.trim() || 'Chưa có tiêu đề'}”?`;

const DESKTOP_SINGLE_DELETE_COPY =
  'Xóa vĩnh viễn ghi chú?\n\nGhi chú này sẽ bị xóa vĩnh viễn và không thể khôi phục.';

/** Confirms a single permanent delete and invokes the existing delete flow once. */
export async function confirmPermanentTrashDelete(note, {
  isMobile,
  confirm,
  permanentDelete,
}) {
  if (!note || note.trashed !== true || typeof note.id !== 'string') return false;

  const message = isMobile ? MOBILE_SINGLE_DELETE_COPY(note) : DESKTOP_SINGLE_DELETE_COPY;
  if (!confirm(message)) return false;

  await permanentDelete(note.id);
  return true;
}
