const OPEN_TIMES_KEY_PREFIX = 'tanooki:recent-opened:v1:';
export const RECENT_OPEN_WRITE_INTERVAL = 60_000;

export function loadRecentOpenTimes(storage, accountId) {
  if (!storage || !accountId) return {};
  try {
    const parsed = JSON.parse(storage.getItem(`${OPEN_TIMES_KEY_PREFIX}${encodeURIComponent(accountId)}`) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => Number.isFinite(value) && value > 0));
  } catch {
    return {};
  }
}

export function recordRecentOpen(storage, accountId, noteId, now, currentTimes = {}, writeInterval = RECENT_OPEN_WRITE_INTERVAL) {
  if (!accountId || !noteId || !Number.isFinite(now)) return { times: currentTimes, recorded: false };
  const storageKey = `${OPEN_TIMES_KEY_PREFIX}${encodeURIComponent(accountId)}`;
  const storedTimes = loadRecentOpenTimes(storage, accountId);
  const previousTime = Math.max(storedTimes[noteId] || 0, currentTimes[noteId] || 0);
  if (previousTime && now - previousTime < writeInterval) {
    return { times: { ...storedTimes, ...currentTimes, [noteId]: previousTime }, recorded: false };
  }

  const times = { ...storedTimes, ...currentTimes, [noteId]: now };
  try {
    storage?.setItem(storageKey, JSON.stringify(times));
  } catch {
    // Recency is an enhancement; unavailable storage must not block opening a note.
  }
  return { times, recorded: true };
}

export function getEffectiveRecentTime(note, openedAt = {}) {
  const opened = openedAt[note.id];
  return Math.max(Number.isFinite(note.updatedAt) ? note.updatedAt : 0, Number.isFinite(opened) ? opened : 0);
}

export function getRecentNotes(notes, openedAt = {}) {
  return notes
    .filter((note) => !note.trashed && !note.archived)
    .slice()
    .sort((left, right) => getEffectiveRecentTime(right, openedAt) - getEffectiveRecentTime(left, openedAt)
      || right.updatedAt - left.updatedAt
      || right.createdAt - left.createdAt
      || left.id.localeCompare(right.id));
}

const startOfLocalDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function groupMobileRecentNotes(notes, openedAt = {}, now = new Date()) {
  const today = startOfLocalDay(now);
  const yesterday = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const weekStart = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const buckets = new Map();

  getRecentNotes(notes, openedAt).forEach((note) => {
    const recentTime = getEffectiveRecentTime(note, openedAt);
    const date = new Date(recentTime);
    const day = startOfLocalDay(date);
    let key;
    let label;
    if (day >= today) {
      key = 'today';
      label = 'Hôm nay';
    } else if (day >= yesterday) {
      key = 'yesterday';
      label = 'Hôm qua';
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
