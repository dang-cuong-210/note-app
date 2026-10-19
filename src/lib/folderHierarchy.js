export function getFolderHierarchy(folders) {
  const byParent = new Map();
  const folderIds = new Set(folders.map((folder) => folder.id));
  for (const folder of folders) {
    const parentId = folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
    const siblings = byParent.get(parentId) || [];
    siblings.push(folder);
    byParent.set(parentId, siblings);
  }

  const result = [];
  const visited = new Set();
  const visit = (parentId, depth) => {
    for (const folder of byParent.get(parentId) || []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      result.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  // Corrupt cyclic references remain reachable as roots instead of disappearing.
  for (const folder of folders) {
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);
    result.push({ folder, depth: 0 });
    visit(folder.id, 1);
  }
  return result;
}

export function getFolderOptionLabel(folder, depth = 0) {
  return `${depth ? `${'\u00a0\u00a0'.repeat(depth)}└ ` : ''}${folder.name}`;
}

export function getFolderDisplayPath(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names = [];
  const visited = new Set();
  let folder = byId.get(folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    names.unshift(folder.name);
    folder = folder.parentId ? byId.get(folder.parentId) : null;
  }
  return names.join(' › ');
}

export function getFolderAncestorIds(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors = [];
  const visited = new Set([folderId]);
  let folder = byId.get(folderId);
  while (folder?.parentId && byId.has(folder.parentId) && !visited.has(folder.parentId)) {
    visited.add(folder.parentId);
    ancestors.unshift(folder.parentId);
    folder = byId.get(folder.parentId);
  }
  return ancestors;
}

export function removeFolderAndPromoteChildren(folders, folderId) {
  const folder = folders.find((item) => item.id === folderId);
  const parentId = folder?.parentId ?? null;
  const reparented = folders.filter((item) => item.parentId === folderId).map((item) => ({ ...item, parentId }));
  const updatedById = new Map(reparented.map((item) => [item.id, item]));
  return {
    folders: folders.filter((item) => item.id !== folderId).map((item) => updatedById.get(item.id) || item),
    reparented,
  };
}
