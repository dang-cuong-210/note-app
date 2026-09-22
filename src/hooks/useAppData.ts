import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, Folder, Settings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import * as localDb from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { uid, createNote, applyTheme, applyFontSize } from '@/lib/utils';
import { deleteAllNoteImages } from '@/lib/images';

interface NoteRow {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    folderId: row.folder_id,
    pinned: row.pinned,
    archived: row.archived,
    trashed: row.trashed,
    trashedAt: row.trashed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}

function noteToRow(note: Note): NoteRow {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    folder_id: note.folderId,
    pinned: note.pinned,
    archived: note.archived,
    trashed: note.trashed,
    trashed_at: note.trashedAt,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

function folderToRow(folder: Folder): FolderRow {
  return {
    id: folder.id,
    name: folder.name,
    parent_id: folder.parentId,
    created_at: folder.createdAt,
  };
}

export function useAppData() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const folderSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const migratedRef = useRef(false);

  // Load settings from local storage (settings stay local — they're device-specific)
  useEffect(() => {
    (async () => {
      const s = await localDb.getSettings();
      const finalSettings = s ?? DEFAULT_SETTINGS;
      setSettings(finalSettings);
      applyTheme(finalSettings.theme);
      applyFontSize(finalSettings.fontSize);
    })();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      setSettings((prev) => {
        if (prev.theme === 'system') applyTheme('system');
        return prev;
      });
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Online/offline tracking
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Migrate local IndexedDB data to cloud on first load
  const migrateLocalData = useCallback(async () => {
    if (migratedRef.current) return;
    migratedRef.current = true;

    const [localNotes, localFolders] = await Promise.all([
      localDb.getAllNotes(),
      localDb.getAllFolders(),
    ]);

    if (localNotes.length === 0 && localFolders.length === 0) return;

    // Check if cloud already has data (to avoid duplicating)
    const { count: noteCount } = await supabase
      .from('notes')
      .select('*', { count: 'exact', head: true });

    if (noteCount && noteCount > 0) {
      // Cloud already has data — just clear local cache, cloud wins
      return;
    }

    // Upload local data to cloud
    if (localFolders.length > 0) {
      const rows = localFolders.map(folderToRow);
      const { error } = await supabase.from('folders').upsert(rows, { onConflict: 'id' });
      if (error) console.warn('Folder migration error:', error.message);
    }
    if (localNotes.length > 0) {
      const rows = localNotes.map(noteToRow);
      const { error } = await supabase.from('notes').upsert(rows, { onConflict: 'id' });
      if (error) console.warn('Note migration error:', error.message);
    }
  }, []);

  // Load all data from cloud
  const loadFromCloud = useCallback(async () => {
    setSyncing(true);
    try {
      const [notesRes, foldersRes] = await Promise.all([
        supabase.from('notes').select('*').order('updated_at', { ascending: false }),
        supabase.from('folders').select('*').order('name', { ascending: true }),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (foldersRes.error) throw foldersRes.error;

      const cloudNotes = (notesRes.data as NoteRow[]).map(mapNote);
      const cloudFolders = (foldersRes.data as FolderRow[]).map(mapFolder);

      setNotes(cloudNotes);
      setFolders(cloudFolders);

      // Cache locally for offline use
      await Promise.all([
        localDb.putNotes(cloudNotes),
        ...cloudFolders.map((f) => localDb.putFolder(f)),
      ]);
    } catch (err) {
      console.warn('Cloud load failed, falling back to local cache:', err);
      // Fall back to local cache
      const [localNotes, localFolders] = await Promise.all([
        localDb.getAllNotes(),
        localDb.getAllFolders(),
      ]);
      setNotes(localNotes);
      setFolders(localFolders);
    } finally {
      setSyncing(false);
      setLoaded(true);
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      await migrateLocalData();
      await loadFromCloud();
    })();
  }, [migrateLocalData, loadFromCloud]);

  // Realtime subscription for cross-device sync
  useEffect(() => {
    if (!loaded) return;

    const notesChannel = supabase
      .channel('notes-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as NoteRow;
            setNotes((prev) => prev.filter((n) => n.id !== oldRow.id));
          } else {
            const newRow = payload.new as NoteRow;
            const note = mapNote(newRow);
            setNotes((prev) => {
              const idx = prev.findIndex((n) => n.id === note.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = note;
                return next;
              }
              return [note, ...prev];
            });
            localDb.putNote(note);
          }
        }
      )
      .subscribe();

    const foldersChannel = supabase
      .channel('folders-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'folders' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as FolderRow;
            setFolders((prev) => prev.filter((f) => f.id !== oldRow.id));
          } else {
            const newRow = payload.new as FolderRow;
            const folder = mapFolder(newRow);
            setFolders((prev) => {
              const idx = prev.findIndex((f) => f.id === folder.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = folder;
                return next;
              }
              return [...prev, folder];
            });
            localDb.putFolder(folder);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notesChannel);
      supabase.removeChannel(foldersChannel);
    };
  }, [loaded]);

  // ===== Cloud sync helpers =====
  const syncNoteToCloud = useCallback(async (note: Note) => {
    try {
      const { error } = await supabase.from('notes').upsert(noteToRow(note), { onConflict: 'id' });
      if (error) console.warn('Note sync error:', error.message);
    } catch (err) {
      console.warn('Note sync failed (offline?):', err);
    }
  }, []);

  const syncFolderToCloud = useCallback(async (folder: Folder) => {
    try {
      const { error } = await supabase.from('folders').upsert(folderToRow(folder), { onConflict: 'id' });
      if (error) console.warn('Folder sync error:', error.message);
    } catch (err) {
      console.warn('Folder sync failed:', err);
    }
  }, []);

  const deleteNoteFromCloud = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('notes').delete().eq('id', id);
      if (error) console.warn('Note delete error:', error.message);
    } catch (err) {
      console.warn('Note delete failed:', err);
    }
  }, []);

  const deleteFolderFromCloud = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('folders').delete().eq('id', id);
      if (error) console.warn('Folder delete error:', error.message);
    } catch (err) {
      console.warn('Folder delete failed:', err);
    }
  }, []);

  // Debounced save: local + cloud
  const saveNote = useCallback(
    (note: Note) => {
      // Save to local cache immediately
      localDb.putNote(note);
      // Debounce cloud sync
      const existing = saveTimers.current.get(note.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        syncNoteToCloud(note);
        saveTimers.current.delete(note.id);
      }, 600);
      saveTimers.current.set(note.id, timer);
    },
    [syncNoteToCloud]
  );

  const saveFolder = useCallback(
    (folder: Folder) => {
      localDb.putFolder(folder);
      const existing = folderSaveTimers.current.get(folder.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        syncFolderToCloud(folder);
        folderSaveTimers.current.delete(folder.id);
      }, 400);
      folderSaveTimers.current.set(folder.id, timer);
    },
    [syncFolderToCloud]
  );

  const notesRef = useRef(notes);
  notesRef.current = notes;

  // ===== Note operations =====
  const addNote = useCallback(
    (folderId: string | null = null): Note => {
      const note = createNote(folderId);
      setNotes((prev) => [note, ...prev]);
      saveNote(note);
      return note;
    },
    [saveNote]
  );

  const updateNote = useCallback(
    (id: string, updates: Partial<Note>) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, ...updates, updatedAt: Date.now() };
          saveNote(updated);
          return updated;
        })
      );
    },
    [saveNote]
  );

  const updateNoteContent = useCallback(
    (id: string, title: string, content: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, title, content, updatedAt: Date.now() };
          saveNote(updated);
          return updated;
        })
      );
    },
    [saveNote]
  );

  const duplicateNote = useCallback(
    (id: string): Note | null => {
      const original = notesRef.current.find((n) => n.id === id);
      if (!original) return null;
      const now = Date.now();
      const copy: Note = {
        ...original,
        id: uid(),
        title: original.title + ' (copy)',
        pinned: false,
        trashed: false,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((prev) => [copy, ...prev]);
      saveNote(copy);
      return copy;
    },
    [saveNote]
  );

  const trashNote = useCallback(
    (id: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, trashed: true, trashedAt: Date.now(), pinned: false };
          saveNote(updated);
          return updated;
        })
      );
    },
    [saveNote]
  );

  const restoreNote = useCallback(
    (id: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, trashed: false, trashedAt: null };
          saveNote(updated);
          return updated;
        })
      );
    },
    [saveNote]
  );

  const permanentDelete = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      localDb.deleteNote(id);
      deleteNoteFromCloud(id);
      deleteAllNoteImages(id);
    },
    [deleteNoteFromCloud]
  );

  const togglePin = useCallback(
    (id: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, pinned: !n.pinned };
          saveNote(updated);
          return updated;
        })
      );
    },
    [saveNote]
  );

  const archiveNote = useCallback(
    (id: string, archived: boolean) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, archived };
          saveNote(updated);
          return updated;
        })
      );
    },
    [saveNote]
  );

  const moveNote = useCallback(
    (id: string, folderId: string | null) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, folderId };
          saveNote(updated);
          return updated;
        })
      );
    },
    [saveNote]
  );

  // ===== Folder operations =====
  const addFolder = useCallback(
    (name: string, parentId: string | null = null): Folder => {
      const folder: Folder = {
        id: uid(),
        name: name.trim() || 'New Folder',
        parentId,
        createdAt: Date.now(),
      };
      setFolders((prev) => [...prev, folder]);
      saveFolder(folder);
      return folder;
    },
    [saveFolder]
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      setFolders((prev) => {
        const next = prev.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f));
        const folder = next.find((f) => f.id === id);
        if (folder) saveFolder(folder);
        return next;
      });
    },
    [saveFolder]
  );

  const removeFolder = useCallback(
    (id: string) => {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      // Move notes in this folder to no folder
      setNotes((prev) =>
        prev.map((n) => {
          if (n.folderId !== id) return n;
          const updated = { ...n, folderId: null };
          saveNote(updated);
          return updated;
        })
      );
      localDb.deleteFolder(id);
      deleteFolderFromCloud(id);
    },
    [saveNote, deleteFolderFromCloud]
  );

  // ===== Settings =====
  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      if (updates.theme) applyTheme(updates.theme);
      if (updates.fontSize) applyFontSize(updates.fontSize);
      localDb.saveSettings(next);
      return next;
    });
  }, []);

  // ===== Import/Export =====
  const importData = useCallback(
    (data: { notes?: Note[]; folders?: Folder[]; settings?: Settings }) => {
      if (data.folders) {
        setFolders(data.folders);
        data.folders.forEach((f) => {
          localDb.putFolder(f);
          syncFolderToCloud(f);
        });
      }
      if (data.notes) {
        setNotes(data.notes);
        localDb.putNotes(data.notes);
        data.notes.forEach((n) => syncNoteToCloud(n));
      }
      if (data.settings) {
        setSettings(data.settings);
        applyTheme(data.settings.theme);
        applyFontSize(data.settings.fontSize);
        localDb.saveSettings(data.settings);
      }
    },
    [syncNoteToCloud, syncFolderToCloud]
  );

  const flushAll = useCallback(async () => {
    saveTimers.current.forEach((timer) => clearTimeout(timer));
    saveTimers.current.clear();
    folderSaveTimers.current.forEach((timer) => clearTimeout(timer));
    folderSaveTimers.current.clear();
  }, []);

  return {
    notes,
    folders,
    settings,
    loaded,
    syncing,
    online,
    addNote,
    updateNote,
    updateNoteContent,
    duplicateNote,
    trashNote,
    restoreNote,
    permanentDelete,
    togglePin,
    archiveNote,
    moveNote,
    addFolder,
    renameFolder,
    removeFolder,
    updateSettings,
    importData,
    flushAll,
  };
}

export type AppData = ReturnType<typeof useAppData>;
