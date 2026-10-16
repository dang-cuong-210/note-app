export function loadRecentSearches(storage: Pick<Storage, 'getItem'> | null, accountId?: string | null): string[];
export function recordRecentSearch(storage: Pick<Storage, 'getItem' | 'setItem'> | null, accountId: string | null, query: string): string[];
export function removeRecentSearch(storage: Pick<Storage, 'getItem' | 'setItem'> | null, accountId: string | null, query: string): string[];
export function clearRecentSearches(storage: Pick<Storage, 'removeItem'> | null, accountId: string | null): string[];
