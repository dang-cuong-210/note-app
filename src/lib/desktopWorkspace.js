export function getDesktopViewLabel(view, folders) {
  switch (view.kind) {
    case 'home': return 'Trang chủ';
    case 'all': return 'Tất cả ghi chú';
    case 'recent': return 'Gần đây';
    case 'pinned': return 'Đã ghim';
    case 'archived': return 'Lưu trữ';
    case 'trash': return 'Thùng rác';
    case 'settings': return 'Cài đặt';
    case 'folder': return folders.find((folder) => folder.id === view.id)?.name || 'Thư mục';
    case 'tag': return `#${view.name}`;
  }
}

export function getDesktopNoteProperties(note, folders, attachments, text, tags) {
  const plainText = text.trim();
  return {
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    folderName: folders.find((folder) => folder.id === note.folderId)?.name || null,
    tags,
    attachmentCount: attachments.length,
    wordCount: plainText ? plainText.split(/\s+/u).length : 0,
    characterCount: [...plainText].length,
    pinned: note.pinned,
    archived: note.archived,
  };
}
