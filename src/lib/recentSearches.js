const RECENT_SEARCH_LIMIT = 8;
const RECENT_SEARCH_KEY_PREFIX = 'tanooki:recent-searches:v1:';

function keyFor(accountId) {
  return `${RECENT_SEARCH_KEY_PREFIX}${encodeURIComponent(accountId || 'device')}`;
}

export function loadRecentSearches(storage, accountId = null) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(keyFor(accountId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((query) => typeof query === 'string' && query.trim()).map((query) => query.trim()).slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

export function recordRecentSearch(storage, accountId, query) {
  const value = String(query || '').trim();
  if (!storage || !value) return loadRecentSearches(storage, accountId);
  const recent = loadRecentSearches(storage, accountId).filter((item) => item.toLocaleLowerCase() !== value.toLocaleLowerCase());
  const next = [value, ...recent].slice(0, RECENT_SEARCH_LIMIT);
  try { storage.setItem(keyFor(accountId), JSON.stringify(next)); } catch { /* Search remains usable when local storage is unavailable. */ }
  return next;
}

export function removeRecentSearch(storage, accountId, query) {
  const normalized = String(query || '').trim().toLocaleLowerCase();
  const next = loadRecentSearches(storage, accountId).filter((item) => item.toLocaleLowerCase() !== normalized);
  try { storage?.setItem(keyFor(accountId), JSON.stringify(next)); } catch { /* Recent search history is optional. */ }
  return next;
}

export function clearRecentSearches(storage, accountId) {
  try { storage?.removeItem(keyFor(accountId)); } catch { /* Recent search history is optional. */ }
  return [];
}
