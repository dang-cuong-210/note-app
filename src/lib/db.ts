import type { Note, Folder, Settings, Attachment } from '@/types';

const DB_NAME = 'noted-db';
const DB_VERSION = 2;
const NOTES_STORE = 'notes';
const FOLDERS_STORE = 'folders';
const SETTINGS_STORE = 'settings';
const ATTACHMENTS_STORE = 'attachments';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const store = db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('folderId', 'folderId');
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(ATTACHMENTS_STORE)) {
        const store = db.createObjectStore(ATTACHMENTS_STORE, { keyPath: 'id' });
        store.createIndex('noteId', 'noteId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function txAll<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T[]>
): Promise<T[]> {
  return tx(store, mode, fn);
}

// ===== Notes =====
export async function getAllNotes() {
  return txAll<Note>(NOTES_STORE, 'readonly', (s) => s.getAll() as IDBRequest<Note[]>);
}
export async function putNote(note: Note) {
  return tx(NOTES_STORE, 'readwrite', (s) => s.put(note));
}
export async function putNotes(notes: Note[]) {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(NOTES_STORE, 'readwrite');
        const s = t.objectStore(NOTES_STORE);
        notes.forEach((n) => s.put(n));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      })
  );
}
export async function deleteNote(id: string) {
  return tx(NOTES_STORE, 'readwrite', (s) => s.delete(id));
}

// ===== Folders =====
export async function getAllFolders() {
  return txAll<Folder>(FOLDERS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<Folder[]>);
}
export async function putFolder(folder: Folder) {
  return tx(FOLDERS_STORE, 'readwrite', (s) => s.put(folder));
}
export async function deleteFolder(id: string) {
  return tx(FOLDERS_STORE, 'readwrite', (s) => s.delete(id));
}

// ===== Settings =====
export async function getSettings() {
  return tx<{ key: string; value: Settings } | undefined>(
    SETTINGS_STORE,
    'readonly',
    (s) => s.get('app') as IDBRequest<{ key: string; value: Settings } | undefined>
  ).then((r) => r?.value ?? null);
}
export async function saveSettings(settings: Settings) {
  return tx(SETTINGS_STORE, 'readwrite', (s) => s.put({ key: 'app', value: settings }));
}

// ===== Attachments =====
export async function getAllAttachments() {
  return txAll<Attachment>(ATTACHMENTS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<Attachment[]>);
}
export async function getAttachmentsByNote(noteId: string) {
  return openDB().then(
    (db) =>
      new Promise<Attachment[]>((resolve, reject) => {
        const t = db.transaction(ATTACHMENTS_STORE, 'readonly');
        const s = t.objectStore(ATTACHMENTS_STORE);
        const idx = s.index('noteId');
        const req = idx.getAll(noteId);
        req.onsuccess = () => resolve(req.result as Attachment[]);
        req.onerror = () => reject(req.error);
      })
  );
}
export async function putAttachment(attachment: Attachment) {
  return tx(ATTACHMENTS_STORE, 'readwrite', (s) => s.put(attachment));
}
export async function putAttachments(attachments: Attachment[]) {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(ATTACHMENTS_STORE, 'readwrite');
        const s = t.objectStore(ATTACHMENTS_STORE);
        attachments.forEach((a) => s.put(a));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      })
  );
}
export async function deleteAttachmentRecord(id: string) {
  return tx(ATTACHMENTS_STORE, 'readwrite', (s) => s.delete(id));
}
