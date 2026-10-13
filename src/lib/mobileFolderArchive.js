export function getMobileChildFolders(folders, parentId, query = '') {
  const normalizedQuery = String(query).normalize('NFC').toLocaleLowerCase().trim();
  return folders.filter((folder) => folder.parentId === parentId && (
    !normalizedQuery || folder.name.normalize('NFC').toLocaleLowerCase().includes(normalizedQuery)
  ));
}

export function getMobileFolderSummary(noteCount, folderCount) {
  if (noteCount && folderCount) return `${noteCount} ghi chú · ${folderCount} thư mục`;
  if (noteCount) return `${noteCount} ghi chú`;
  if (folderCount) return `Không có ghi chú · ${folderCount} thư mục`;
  return 'Không có ghi chú';
}
