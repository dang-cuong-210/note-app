const startOfLocalDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function groupMobileAllNotes(notes, now = new Date()) {
  const today = startOfLocalDay(now);
  const weekStart = today - 7 * 24 * 60 * 60 * 1000;
  const buckets = new Map();

  [...notes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((note) => {
      const date = new Date(note.updatedAt);
      const day = startOfLocalDay(date);
      let key;
      let label;

      if (day >= today) {
        key = 'today';
        label = 'Hôm nay';
      } else if (day >= weekStart) {
        key = 'week';
        label = '7 ngày trước';
      } else {
        key = `${date.getFullYear()}-${date.getMonth()}`;
        label = date.getFullYear() === now.getFullYear()
          ? `Tháng ${date.getMonth() + 1}`
          : `Tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;
      }

      if (!buckets.has(key)) buckets.set(key, { label, notes: [] });
      buckets.get(key).notes.push(note);
    });

  return [...buckets.values()];
}

export function formatMobileAllNoteDate(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  const today = startOfLocalDay(now);
  const day = startOfLocalDay(date);
  if (day >= today) return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (day >= today - 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString('vi-VN', { weekday: 'long' });
  }
  return date.toLocaleDateString('vi-VN', date.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'numeric' }
    : { day: 'numeric', month: 'numeric', year: 'numeric' });
}
