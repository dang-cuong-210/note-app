import { normalizeSearchText } from './advancedSearch.js';

export function getMobileHomeCounts(notes) {
  return notes.reduce((counts, note) => {
    if (note.trashed) counts.trashed += 1;
    else if (note.archived) counts.archived += 1;
    else counts.active += 1;
    return counts;
  }, { active: 0, archived: 0, trashed: 0 });
}

export function getMobileHomeFolderCount(notes, folderId) {
  return notes.filter((note) => note.folderId === folderId && !note.trashed && !note.archived).length;
}

export function getMatchingMobileHomeFolders(folders, query) {
  const normalizedQuery = normalizeSearchText(query);
  return normalizedQuery
    ? folders.filter((folder) => normalizeSearchText(folder.name).includes(normalizedQuery))
    : [];
}
