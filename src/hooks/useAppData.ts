import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, Folder, Settings, Attachment } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import * as localDb from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { uid, createNote, applyTheme, applyFontSize } from '@/lib/utils';
import { deleteAllNoteImages } from '@/lib/images';
import { uploadAttachment, deleteAttachment, deleteAllAttachments, loadAllAttachments } from '@/lib/attachments';

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
  revision: number;
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
    revision: row.revision ?? 0,
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
    revision: note.revision ?? 0,
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const folderSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const migratedRef = useRef(false);
  // Unsynced drafts remain in IndexedDB until the server confirms the write.
  const pendingNotes = useRef(new Map<string, Note>());
  const confirmedRevisions = useRef(new Map<string, number>());
  const inFlightNotes = useRef(new Set<string>());
  const cloudReadyRef = useRef(false);
  const [syncConflicts, setSyncConflicts] = useState(0);

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
    const { count: noteCount, error: countError } = await supabase
      .from('notes')
      .select('*', { count: 'exact', head: true });

    // A failed count must never be misinterpreted as an empty cloud.
    if (countError || noteCount === null) return;
    if (noteCount > 0) {
      // Cloud already has data — just clear local cache, cloud wins
      return;
    }

    // Upload local data to cloud
    if (localFolders.length > 0) {
      const rows = localFolders.map(folderToRow);
      const { error } = await supabase.from('folders').upsert(rows, { onConflict: 'id' });
      if (error) console.warn('Folder migration error:', error.message);
    }
    // Never resurrect known synced notes removed on another device.
    const toMigrate = localNotes.filter((n) => n.syncPending || n.revision === undefined);
    if (toMigrate.length > 0) {
      const rows = toMigrate.map(noteToRow);
      const { error } = await supabase.from('notes').upsert(rows, { onConflict: 'id' });
      if (error) console.warn('Note migration error:', error.message);
    }
  }, []);

  // Load all data from cloud, merging with any local-only changes
  const loadFromCloud = useCallback(async () => {
    setSyncing(true);
    // Load local cache first — used for merge and as fallback
    const [localNotes, localFolders] = await Promise.all([
      localDb.getAllNotes(),
      localDb.getAllFolders(),
    ]);
    try {
      const [notesRes, foldersRes, cloudAttachments] = await Promise.all([
        supabase.from('notes').select('*').order('updated_at', { ascending: false }),
        supabase.from('folders').select('*').order('name', { ascending: true }),
        loadAllAttachments(),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (foldersRes.error) throw foldersRes.error;

      const cloudNotes = (notesRes.data as NoteRow[]).map(mapNote);
      const cloudFolders = (foldersRes.data as FolderRow[]).map(mapFolder);

      // Merge: for each note, keep whichever (local vs cloud) has a newer updatedAt.
      // This prevents losing local edits that haven't synced yet.
      const localMap = new Map(localNotes.map((n) => [n.id, n]));
      // Include edits made while the cloud request was in flight.
      pendingNotes.current.forEach((draft, id) => localMap.set(id, draft));
      const mergedNotes = cloudNotes.map((cn) => {
        const ln = localMap.get(cn.id);
        // A newer local draft is never discarded just because the server has
        // advanced. The CAS write below will preserve BOTH versions if needed.
        if (ln && (ln.syncPending || ln.updatedAt > cn.updatedAt) &&
            (ln.title !== cn.title || ln.content !== cn.content ||
             ln.pinned !== cn.pinned || ln.archived !== cn.archived || ln.trashed !== cn.trashed ||
             ln.folderId !== cn.folderId)) {
          confirmedRevisions.current.set(cn.id, ln.revision ?? 0);
          pendingNotes.current.set(cn.id, ln);
          return ln;
        }
        confirmedRevisions.current.set(cn.id, cn.revision ?? 0);
        return cn;
      });
      // Include local-only notes (created offline, not yet in cloud)
      for (const ln of localMap.values()) {
        if (!mergedNotes.find((n) => n.id === ln.id)) {
          if (ln.syncPending || ln.revision === undefined) {
            // The pending marker survives reloads/offline sessions.
            // Older cached notes lacking the marker receive a one-time
            // conservative recovery rather than being silently discarded.
            mergedNotes.unshift(ln);
            confirmedRevisions.current.set(ln.id, ln.revision ? ln.revision : -1);
            pendingNotes.current.set(ln.id, ln);
          } else {
            // The server no longer has a previously synced note (deleted elsewhere).
            void localDb.deleteNote(ln.id);
          }
        }
      }

      const mergedFolders = [...cloudFolders];
      for (const lf of localFolders) {
        if (!mergedFolders.find((f) => f.id === lf.id)) {
          mergedFolders.push(lf);
        }
      }

      cloudReadyRef.current = true;
      setNotes(mergedNotes);
      setFolders(mergedFolders);
      setAttachments(cloudAttachments);

      // Cache locally for offline use
      await Promise.all([
        localDb.putNotes(mergedNotes),
        ...mergedFolders.map((f) => localDb.putFolder(f)),
        localDb.putAttachments(cloudAttachments),
      ]);
    } catch (err) {
      cloudReadyRef.current = false;
      console.warn('Cloud load failed, falling back to local cache:', err);
      const localAttachments = await localDb.getAllAttachments();
      const recovered = new Map(localNotes.map((note) => [note.id, note]));
      pendingNotes.current.forEach((draft, id) => recovered.set(id, draft));
      recovered.forEach((note) => {
        if (note.syncPending) pendingNotes.current.set(note.id, note);
      });
      setNotes(Array.from(recovered.values()));
      setFolders(localFolders);
      setAttachments(localAttachments);
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
            if (pendingNotes.current.has(oldRow.id)) return;
            confirmedRevisions.current.delete(oldRow.id);
            setNotes((prev) => prev.filter((n) => n.id !== oldRow.id));
            void localDb.deleteNote(oldRow.id);
          } else {
            const newRow = payload.new as NoteRow;
            const note = mapNote(newRow);
            // Never overwrite an unsynced draft, including the IndexedDB copy.
            // Its conditional write will either succeed or create a conflict copy.
            if (pendingNotes.current.has(note.id)) return;
            const knownRevision = confirmedRevisions.current.get(note.id) ?? -1;
            if (note.revision! < knownRevision) return;
            confirmedRevisions.current.set(note.id, note.revision ?? 0);
            setNotes((prev) => {
              const idx = prev.findIndex((n) => n.id === note.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = note;
                return next;
              }
              return [note, ...prev];
            });
            void localDb.putNote(note);
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
    const id = note.id;
    // A stale debounce callback must NEVER recreate a draft already confirmed.
    if (!pendingNotes.current.has(id)) return;
    if (inFlightNotes.current.has(id) || !navigator.onLine || !cloudReadyRef.current) return;
    inFlightNotes.current.add(id);
    try {
      // Serialise writes per note; a newer edit can arrive while awaiting RPC.
      while (pendingNotes.current.has(id) && navigator.onLine) {
        const draft = pendingNotes.current.get(id)!;
        const expected = confirmedRevisions.current.get(id) ?? (draft.revision ?? -1);
        const { data, error } = await supabase.rpc('save_note_versioned', {
          p_note: noteToRow(draft), p_expected_revision: expected,
        });
        if (error) {
          // Network / missing-migration errors leave the local draft intact.
          console.warn('Note sync postponed:', error.message);
          break;
        }
        const result = data as { status: string; revision?: number; updated_at?: number } | null;
        if (!result || !['saved', 'conflict'].includes(result.status)) {
          console.warn('Unexpected note sync result; draft remains on this device');
          break;
        }
        if (result.status === 'saved') {
          const revision = result.revision!;
          confirmedRevisions.current.set(id, revision);
          const newest = pendingNotes.current.get(id);
          if (newest === draft) {
            pendingNotes.current.delete(id);
            const saved = { ...draft, syncPending: false, revision, updatedAt: result.updated_at ?? draft.updatedAt };
            setNotes((prev) => prev.map((n) => n.id === id &&
              n.title === draft.title && n.content === draft.content && n.updatedAt === draft.updatedAt
              ? saved : n));
            if (confirmedRevisions.current.get(id) === revision && !pendingNotes.current.has(id)) {
              void localDb.putNote(saved);
            }
          } else if (newest) {
            const carried = { ...newest, revision, syncPending: true };
            pendingNotes.current.set(id, carried);
            void localDb.putNote(carried);
          }
          continue;
        }
        // A simultaneous edit won the race. Keep ours as a separately named,
        // locally backed note BEFORE replacing the original with cloud data.
        const copy: Note = {
          ...pendingNotes.current.get(id)!, id: uid(),
          title: `${draft.title || 'Untitled'} (conflict copy)`,
          revision: 0, syncPending: true, createdAt: Date.now(), updatedAt: Date.now(),
        };
        await localDb.putNote(copy);
        pendingNotes.current.set(copy.id, copy);
        confirmedRevisions.current.set(copy.id, -1);
        pendingNotes.current.delete(id);
        const { data: current, error: fetchError } = await supabase.from('notes')
          .select('*').eq('id', id).maybeSingle();
        if (!fetchError && current) {
          const remote = mapNote(current as NoteRow);
          confirmedRevisions.current.set(id, remote.revision ?? 0);
          await localDb.putNote(remote);
          setNotes((prev) => [copy, ...prev.map((n) => n.id === id ? remote : n)]);
        } else {
          // The server may be temporarily unavailable; retain both local rows.
          setNotes((prev) => [copy, ...prev]);
        }
        setSyncConflicts((count) => count + 1);
        void syncNoteToCloudRef.current(copy);
        break;
      }
    } catch (err) {
      // Unexpected network exceptions must not discard the local draft.
      console.warn('Note sync interrupted:', err);
    } finally {
      inFlightNotes.current.delete(id);
      // A new edit that arrived during the last RPC must not be stranded.
      if (pendingNotes.current.has(id) && navigator.onLine) {
        const latest = pendingNotes.current.get(id)!;
        // Do not immediately retry a failing request in a tight loop.
        const existing = saveTimers.current.get(id);
        if (!existing) {
          const timer = setTimeout(() => {
            saveTimers.current.delete(id);
            void syncNoteToCloudRef.current(latest);
          }, 5000);
          saveTimers.current.set(id, timer);
        }
      }
    }
  }, []);
  const syncNoteToCloudRef = useRef(syncNoteToCloud);
  syncNoteToCloudRef.current = syncNoteToCloud;

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
      // Save to local cache immediately and protect against Realtime overwrites.
      const draft = { ...note, syncPending: true };
      pendingNotes.current.set(note.id, draft);
      void localDb.putNote(draft);
      // Debounce cloud sync
      const existing = saveTimers.current.get(note.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        saveTimers.current.delete(note.id);
        void syncNoteToCloud(note);
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
      const note = { ...createNote(folderId), revision: 0 };
      confirmedRevisions.current.set(note.id, -1);
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
          const updated = { ...n, ...updates, updatedAt: Math.max(Date.now(), n.updatedAt + 1) };
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
          const updated = { ...n, title, content, updatedAt: Math.max(Date.now(), n.updatedAt + 1) };
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
      confirmedRevisions.current.set(copy.id, -1);
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
      const timer = saveTimers.current.get(id);
      if (timer) clearTimeout(timer);
      saveTimers.current.delete(id);
      pendingNotes.current.delete(id);
      confirmedRevisions.current.delete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setAttachments((prev) => prev.filter((a) => a.noteId !== id));
      localDb.deleteNote(id);
      deleteNoteFromCloud(id);
      deleteAllNoteImages(id);
      deleteAllAttachments(id);
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
        data.notes.forEach((n) => {
          if (!confirmedRevisions.current.has(n.id)) confirmedRevisions.current.set(n.id, -1);
          saveNote(n);
        });
      }
      if (data.settings) {
        setSettings(data.settings);
        applyTheme(data.settings.theme);
        applyFontSize(data.settings.fontSize);
        localDb.saveSettings(data.settings);
      }
    },
    [saveNote, syncFolderToCloud]
  );

  const flushAll = useCallback(async () => {
    // Sync any pending note changes before clearing timers
    saveTimers.current.forEach((timer) => clearTimeout(timer));
    saveTimers.current.clear();
    folderSaveTimers.current.forEach((timer) => clearTimeout(timer));
    folderSaveTimers.current.clear();
    // Never re-upload every cached note: stale tabs could overwrite current data.
    for (const note of Array.from(pendingNotes.current.values())) {
      await syncNoteToCloud(note);
    }
  }, [syncNoteToCloud]);

  // Flush pending changes when the page is hidden or unloaded
  useEffect(() => {
    if (!loaded) return;
    const handler = () => { void flushAll(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handler();
    };
    const onOnline = () => {
      // Refetch revisions before trying to upload offline edits.
      void loadFromCloud().then(() => {
        if (cloudReadyRef.current) void flushAll();
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', handler);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('online', onOnline);
    };
  }, [loaded, flushAll, loadFromCloud]);

  // After recovering drafts from IndexedDB, try to upload them now.
  useEffect(() => {
    if (loaded && navigator.onLine && cloudReadyRef.current && pendingNotes.current.size) void flushAll();
  }, [loaded, flushAll]);

  // ===== Attachment operations =====
  const addAttachment = useCallback(
    async (noteId: string, file: File): Promise<Attachment | null> => {
      try {
        const attachment = await uploadAttachment(noteId, file);
        setAttachments((prev) => [...prev, attachment]);
        localDb.putAttachment(attachment);
        return attachment;
      } catch (err) {
        console.error('Attachment upload failed:', err);
        return null;
      }
    },
    []
  );

  // Keep a renamed file's storage path unchanged; only its display name changes.
  const renameAttachment = useCallback(async (id: string, name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const { error } = await supabase.from('attachments').update({ name: trimmed }).eq('id', id);
    if (error) {
      console.error('Attachment rename failed:', error);
      return false;
    }
    setAttachments((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const updated = { ...a, name: trimmed };
      localDb.putAttachment(updated);
      return updated;
    }));
    return true;
  }, []);

  const removeAttachment = useCallback(
    async (id: string) => {
      // Do not report success or erase the offline record until Supabase confirms deletion.
      await deleteAttachment(id);
      await localDb.deleteAttachmentRecord(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    },
    []
  );

  const getAttachmentsForNote = useCallback(
    (noteId: string): Attachment[] => attachments.filter((a) => a.noteId === noteId),
    [attachments]
  );

  return {
    notes,
    folders,
    attachments,
    settings,
    loaded,
    syncing,
    online,
    syncConflicts,
    dismissSyncConflicts: () => setSyncConflicts(0),
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
    addAttachment,
    removeAttachment,
    renameAttachment,
    getAttachmentsForNote,
  };
}

export type AppData = ReturnType<typeof useAppData>;
