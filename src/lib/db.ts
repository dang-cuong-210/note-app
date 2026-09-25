import type { Note, Folder, Settings, Attachment } from '@/types';

const DB_NAME = 'noted-db';
const DB_VERSION = 3;
const LEGACY_NOTES_STORE = 'notes';
const LEGACY_FOLDERS_STORE = 'folders';
const LEGACY_ATTACHMENTS_STORE = 'attachments';
const NOTES_STORE = 'user-notes';
const FOLDERS_STORE = 'user-folders';
const ATTACHMENTS_STORE = 'user-attachments';
const SETTINGS_STORE = 'settings';
const LEGACY_OWNER_KEY = 'legacy-data-owner';

type Scoped<T> = T & { scopedId: string; accountId: string };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Preserve v2 stores as a recovery source. New data only enters scoped stores.
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const store = db.createObjectStore(NOTES_STORE, { keyPath: 'scopedId' });
        store.createIndex('accountId', 'accountId');
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const store = db.createObjectStore(FOLDERS_STORE, { keyPath: 'scopedId' });
        store.createIndex('accountId', 'accountId');
      }
      if (!db.objectStoreNames.contains(ATTACHMENTS_STORE)) {
        const store = db.createObjectStore(ATTACHMENTS_STORE, { keyPath: 'scopedId' });
        store.createIndex('accountId', 'accountId');
        store.createIndex('accountNote', ['accountId', 'noteId']);
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeRequest<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDB();
  return request(run(db.transaction(storeName, mode).objectStore(storeName)));
}

function key(accountId: string, id: string) {
  return `${accountId}:${id}`;
}

function scope<T extends { id: string }>(accountId: string, value: T): Scoped<T> {
  return { ...value, accountId, scopedId: key(accountId, value.id) };
}

function unScope<T>(value: Scoped<T>): T {
  const data = { ...value } as Record<string, unknown>;
  delete data.accountId;
  delete data.scopedId;
  return data as T;
}

async function getForAccount<T>(storeName: string, accountId: string): Promise<T[]> {
  const db = await openDB();
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const rows = await request(store.index('accountId').getAll(accountId) as IDBRequest<Scoped<T>[]>);
  return rows.map(unScope<T>);
}

async function putMany<T extends { id: string }>(storeName: string, accountId: string, values: T[]) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    values.forEach((value) => store.put(scope(accountId, value)));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function migrateLegacyData(accountId: string): Promise<void> {
  const db = await openDB();
  const legacyStores = [LEGACY_NOTES_STORE, LEGACY_FOLDERS_STORE, LEGACY_ATTACHMENTS_STORE]
    .filter((name) => db.objectStoreNames.contains(name));
  if (legacyStores.length === 0) return;

  const owner = await storeRequest<{ key: string; value: string } | undefined>(
    SETTINGS_STORE, 'readonly', (store) => store.get(LEGACY_OWNER_KEY)
  );
  if (owner && owner.value !== accountId) return;
  if (!owner) {
    // Bind the legacy cache once to the persisted authenticated account that
    // opens v3. The marker prevents later accounts from reading those records.
    await storeRequest(SETTINGS_STORE, 'readwrite', (store) =>
      store.put({ key: LEGACY_OWNER_KEY, value: accountId })
    );
  }

  const [existingNotes, existingFolders, existingAttachments] = await Promise.all([
    getAllNotes(accountId), getAllFolders(accountId), getAllAttachments(accountId),
  ]);
  await Promise.all(legacyStores.map(async (name) => {
    const rows = await storeRequest<unknown[]>(name, 'readonly', (store) => store.getAll());
    if (name === LEGACY_NOTES_STORE && existingNotes.length === 0) await putNotes(accountId, rows as Note[]);
    if (name === LEGACY_FOLDERS_STORE && existingFolders.length === 0) await putFolders(accountId, rows as Folder[]);
    if (name === LEGACY_ATTACHMENTS_STORE && existingAttachments.length === 0) await putAttachments(accountId, rows as Attachment[]);
  }));
}

export function getAllNotes(accountId: string) { return getForAccount<Note>(NOTES_STORE, accountId); }
export function putNote(accountId: string, note: Note) { return storeRequest(NOTES_STORE, 'readwrite', (store) => store.put(scope(accountId, note))); }
export function putNotes(accountId: string, notes: Note[]) { return putMany(NOTES_STORE, accountId, notes); }
export function deleteNote(accountId: string, id: string) { return storeRequest(NOTES_STORE, 'readwrite', (store) => store.delete(key(accountId, id))); }

export function getAllFolders(accountId: string) { return getForAccount<Folder>(FOLDERS_STORE, accountId); }
export function putFolder(accountId: string, folder: Folder) { return storeRequest(FOLDERS_STORE, 'readwrite', (store) => store.put(scope(accountId, folder))); }
export function putFolders(accountId: string, folders: Folder[]) { return putMany(FOLDERS_STORE, accountId, folders); }
export function deleteFolder(accountId: string, id: string) { return storeRequest(FOLDERS_STORE, 'readwrite', (store) => store.delete(key(accountId, id))); }

// These preferences are intentionally device-wide. They contain no account data.
export async function getSettings() {
  return storeRequest<{ key: string; value: Settings } | undefined>(SETTINGS_STORE, 'readonly', (store) => store.get('app'))
    .then((row) => row?.value ?? null);
}
export function saveSettings(settings: Settings) { return storeRequest(SETTINGS_STORE, 'readwrite', (store) => store.put({ key: 'app', value: settings })); }

export function getAllAttachments(accountId: string) { return getForAccount<Attachment>(ATTACHMENTS_STORE, accountId); }
export async function getAttachmentsByNote(accountId: string, noteId: string) {
  const db = await openDB();
  const store = db.transaction(ATTACHMENTS_STORE, 'readonly').objectStore(ATTACHMENTS_STORE);
  const rows = await request(store.index('accountNote').getAll([accountId, noteId]) as IDBRequest<Scoped<Attachment>[]>);
  return rows.map(unScope<Attachment>);
}
export function putAttachment(accountId: string, attachment: Attachment) { return storeRequest(ATTACHMENTS_STORE, 'readwrite', (store) => store.put(scope(accountId, attachment))); }
export function putAttachments(accountId: string, attachments: Attachment[]) { return putMany(ATTACHMENTS_STORE, accountId, attachments); }
export function deleteAttachmentRecord(accountId: string, id: string) { return storeRequest(ATTACHMENTS_STORE, 'readwrite', (store) => store.delete(key(accountId, id))); }
export async function deleteAttachmentsByNote(accountId: string, noteId: string) {
  const rows = await getAttachmentsByNote(accountId, noteId);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENTS_STORE, 'readwrite');
    const store = transaction.objectStore(ATTACHMENTS_STORE);
    rows.forEach((row) => store.delete(key(accountId, row.id)));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
