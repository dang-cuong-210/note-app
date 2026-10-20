export const TANOOKI_BACKUP_FORMAT = 'tanooki-json-backup';
const SETTINGS_VALUES = {
  theme: ['light', 'dark', 'system'],
  fontSize: ['sm', 'md', 'lg', 'xl'],
  sortBy: ['updated', 'created', 'title'],
  sortDir: ['asc', 'desc'],
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} phải là chuỗi không trống.`);
  return value;
}

function requireTimestamp(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${field} không hợp lệ.`);
  return value;
}

function validateSettings(value) {
  if (!isObject(value)) throw new Error('Phần cài đặt trong tệp JSON không hợp lệ.');
  const settings = {};
  for (const [key, allowed] of Object.entries(SETTINGS_VALUES)) {
    if (Object.hasOwn(value, key)) {
      if (!allowed.includes(value[key])) throw new Error(`Giá trị cài đặt “${key}” không được hỗ trợ.`);
      settings[key] = value[key];
    }
  }
  return settings;
}

function validateNotes(notes) {
  if (!Array.isArray(notes)) throw new Error('Danh sách ghi chú trong tệp JSON không hợp lệ.');
  const ids = new Set();
  return notes.map((item, index) => {
    const prefix = `Ghi chú thứ ${index + 1}`;
    if (!isObject(item)) throw new Error(`${prefix} không hợp lệ.`);
    const id = requireString(item.id, `${prefix}: ID`);
    if (ids.has(id)) throw new Error(`Tệp JSON có ID ghi chú trùng lặp: ${id}.`);
    ids.add(id);
    if (typeof item.title !== 'string' || typeof item.content !== 'string') throw new Error(`${prefix} thiếu tiêu đề hoặc nội dung hợp lệ.`);
    const folderId = item.folderId ?? null;
    if (folderId !== null && (typeof folderId !== 'string' || !folderId.trim())) throw new Error(`${prefix} có thư mục không hợp lệ.`);
    for (const field of ['pinned', 'archived', 'trashed']) {
      if (item[field] !== undefined && typeof item[field] !== 'boolean') throw new Error(`${prefix} có trạng thái không hợp lệ.`);
    }
    const trashedAt = item.trashedAt ?? null;
    if (trashedAt !== null && (typeof trashedAt !== 'number' || !Number.isFinite(trashedAt) || trashedAt < 0)) throw new Error(`${prefix} có ngày xóa không hợp lệ.`);
    return {
      id, title: item.title, content: item.content, folderId,
      pinned: item.pinned ?? false, archived: item.archived ?? false, trashed: item.trashed ?? false,
      trashedAt,
      createdAt: requireTimestamp(item.createdAt, `${prefix}: ngày tạo`),
      updatedAt: requireTimestamp(item.updatedAt, `${prefix}: ngày cập nhật`),
    };
  });
}

function validateFolders(folders) {
  if (!Array.isArray(folders)) throw new Error('Danh sách thư mục trong tệp JSON không hợp lệ.');
  const ids = new Set();
  return folders.map((item, index) => {
    const prefix = `Thư mục thứ ${index + 1}`;
    if (!isObject(item)) throw new Error(`${prefix} không hợp lệ.`);
    const id = requireString(item.id, `${prefix}: ID`);
    if (ids.has(id)) throw new Error(`Tệp JSON có ID thư mục trùng lặp: ${id}.`);
    ids.add(id);
    const name = requireString(item.name, `${prefix}: tên`);
    const parentId = item.parentId ?? null;
    if (parentId !== null && (typeof parentId !== 'string' || !parentId.trim())) throw new Error(`${prefix} có thư mục cha không hợp lệ.`);
    return { id, name, parentId, createdAt: requireTimestamp(item.createdAt, `${prefix}: ngày tạo`) };
  });
}

export function exportJsonBackup(notes, folders, settings, exportedAt = new Date().toISOString()) {
  return JSON.stringify({
    format: TANOOKI_BACKUP_FORMAT,
    version: 1,
    exportedAt,
    notes: validateNotes(notes),
    folders: validateFolders(folders),
    settings: validateSettings(settings),
  }, null, 2);
}

export function parseJsonBackup(json) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error('Tệp không phải JSON hợp lệ.'); }
  if (!isObject(data)) throw new Error('Nội dung tệp JSON phải là một đối tượng.');
  if (data.format !== undefined && data.format !== TANOOKI_BACKUP_FORMAT) throw new Error('Định dạng tệp sao lưu không được hỗ trợ.');
  if (data.exportedAt !== undefined && (typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)))) {
    throw new Error('Thời điểm xuất dữ liệu không hợp lệ.');
  }
  const version = data.version === undefined ? 0 : data.version;
  if (version !== 0 && version !== 1) throw new Error(`Phiên bản tệp sao lưu ${version} không được hỗ trợ.`);
  if (!Array.isArray(data.notes)) throw new Error('Danh sách ghi chú trong tệp JSON không hợp lệ.');
  if (!Array.isArray(data.folders)) throw new Error('Danh sách thư mục trong tệp JSON không hợp lệ.');
  if (data.settings !== undefined && !isObject(data.settings)) throw new Error('Phần cài đặt trong tệp JSON không hợp lệ.');
  const notes = validateNotes(data.notes);
  const folders = validateFolders(data.folders);
  const settings = data.settings === undefined ? undefined : validateSettings(data.settings);
  if (version === 0 && data.format !== undefined) throw new Error('Phiên bản tệp sao lưu không hợp lệ.');
  return { format: TANOOKI_BACKUP_FORMAT, version, legacy: data.format === undefined, notes, folders, settings };
}

export function summarizeJsonImport(data, currentNotes, currentFolders) {
  const noteIds = new Set(currentNotes.map((note) => note.id));
  const folderIds = new Set(currentFolders.map((folder) => folder.id));
  return {
    notesToAdd: data.notes.filter((note) => !noteIds.has(note.id)).length,
    notesToUpdate: data.notes.filter((note) => noteIds.has(note.id)).length,
    foldersToAdd: data.folders.filter((folder) => !folderIds.has(folder.id)).length,
    foldersToUpdate: data.folders.filter((folder) => folderIds.has(folder.id)).length,
    applySettings: Boolean(data.settings && Object.keys(data.settings).length),
  };
}

export function mergeJsonBackupData(data, currentNotes, currentFolders) {
  const currentNoteById = new Map(currentNotes.map((note) => [note.id, note]));
  const currentFolderById = new Map(currentFolders.map((folder) => [folder.id, folder]));
  const notes = currentNotes.map((note) => ({ ...note }));
  const folders = currentFolders.map((folder) => ({ ...folder }));
  let notesAdded = 0;
  let notesUpdated = 0;
  let foldersAdded = 0;
  let foldersUpdated = 0;
  for (const incoming of data.notes) {
    const existing = currentNoteById.get(incoming.id);
    if (existing) {
      notesUpdated += 1;
      const index = notes.findIndex((note) => note.id === incoming.id);
      notes[index] = { ...existing, ...incoming, revision: existing.revision, syncPending: undefined };
    } else {
      notesAdded += 1;
      notes.unshift({ ...incoming, revision: 0, syncPending: undefined });
    }
  }
  for (const incoming of data.folders) {
    const existing = currentFolderById.get(incoming.id);
    if (existing) {
      foldersUpdated += 1;
      const index = folders.findIndex((folder) => folder.id === incoming.id);
      folders[index] = { ...existing, ...incoming, revision: existing.revision };
    } else {
      foldersAdded += 1;
      folders.push(incoming);
    }
  }
  return { notes, folders, notesAdded, notesUpdated, foldersAdded, foldersUpdated };
}
