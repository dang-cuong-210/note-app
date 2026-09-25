import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, Folder, Settings, Attachment } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import * as localDb from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { uid, createNote, applyTheme, applyFontSize } from '@/lib/utils';
import { deleteAllNoteImages } from '@/lib/images';
import {
  uploadAttachment,
  deleteAttachment,
  deleteAttachmentStorage,
  getAttachmentStoragePaths,
  loadAllAttachments,
} from '@/lib/attachments';

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

export function useAppData(userId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const folderSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const migratedRef = useRef(false);
  // Unsynced drafts remain in IndexedDB until the server confirms the write.
  const pendingNotes = useRef(new Map<string, Note>());
  const confirmedRevisions = useRef(new Map<string, number>());
  const inFlightTasks = useRef(new Map<string, Promise<void>>());
  const deletingNotes = useRef(new Set<string>());
  const activeAccountId = useRef<string | null>(userId);
  const cloudReadyRef = useRef(false);
  const [syncConflicts, setSyncConflicts] = useState(0);

  activeAccountId.current = userId;

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
    if (!userId || migratedRef.current) return;
    migratedRef.current = true;

    await localDb.migrateLegacyData(userId);

    const [localNotes, localFolders] = await Promise.all([
      localDb.getAllNotes(userId),
      localDb.getAllFolders(userId),
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
  }, [userId]);

  // Load all data from cloud, merging with any local-only changes
  const loadFromCloud = useCallback(async () => {
    if (!userId) return;
    const accountId = userId;
    setSyncing(true);
    // Load local cache first — used for merge and as fallback
    const [localNotes, localFolders] = await Promise.all([
      localDb.getAllNotes(accountId),
      localDb.getAllFolders(accountId),
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
            void localDb.deleteNote(accountId, ln.id);
          }
        }
      }

      const mergedFolders = [...cloudFolders];
      for (const lf of localFolders) {
        if (!mergedFolders.find((f) => f.id === lf.id)) {
          mergedFolders.push(lf);
        }
      }

      if (activeAccountId.current !== accountId) return;
      cloudReadyRef.current = true;
      setLoadedAccountId(accountId);
      setNotes(mergedNotes);
      setFolders(mergedFolders);
      setAttachments(cloudAttachments);

      // Cache locally for offline use
      await Promise.all([
        localDb.putNotes(accountId, mergedNotes),
        ...mergedFolders.map((f) => localDb.putFolder(accountId, f)),
        localDb.putAttachments(accountId, cloudAttachments),
      ]);
    } catch (err) {
      cloudReadyRef.current = false;
      console.warn('Cloud load failed, falling back to local cache:', err);
      if (activeAccountId.current !== accountId) return;
      const localAttachments = await localDb.getAllAttachments(accountId);
      const recovered = new Map(localNotes.map((note) => [note.id, note]));
      pendingNotes.current.forEach((draft, id) => recovered.set(id, draft));
      recovered.forEach((note) => {
        if (note.syncPending) pendingNotes.current.set(note.id, note);
      });
      setLoadedAccountId(accountId);
      setNotes(Array.from(recovered.values()));
      setFolders(localFolders);
      setAttachments(localAttachments);
    } finally {
      if (activeAccountId.current === accountId) {
        setSyncing(false);
        setLoaded(true);
      }
    }
  }, [userId]);

  // Initial load
  useEffect(() => {
    saveTimers.current.forEach(clearTimeout);
    folderSaveTimers.current.forEach(clearTimeout);
    saveTimers.current.clear();
    folderSaveTimers.current.clear();
    pendingNotes.current.clear();
    confirmedRevisions.current.clear();
    deletingNotes.current.clear();
    cloudReadyRef.current = false;
    migratedRef.current = false;
    setNotes([]);
    setFolders([]);
    setAttachments([]);
    setLoaded(false);
    setLoadedAccountId(null);
    if (!userId) return;
    (async () => {
      await migrateLocalData();
      await loadFromCloud();
    })();
  }, [userId, migrateLocalData, loadFromCloud]);

  // Realtime subscription for cross-device sync
  useEffect(() => {
    if (!loaded || !userId) return;
    const accountId = userId;

    const notesChannel = supabase
      .channel('notes-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes' },
        (payload) => {
          if (activeAccountId.current !== accountId) return;
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as NoteRow;
            if (pendingNotes.current.has(oldRow.id)) return;
            confirmedRevisions.current.delete(oldRow.id);
            setNotes((prev) => prev.filter((n) => n.id !== oldRow.id));
            void localDb.deleteNote(accountId, oldRow.id);
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
            void localDb.putNote(accountId, note);
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
          if (activeAccountId.current !== accountId) return;
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as FolderRow;
            setFolders((prev) => prev.filter((f) => f.id !== oldRow.id));
            void localDb.deleteFolder(accountId, oldRow.id);
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
            void localDb.putFolder(accountId, folder);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notesChannel);
      supabase.removeChannel(foldersChannel);
    };
  }, [loaded, userId]);

  // ===== Cloud sync helpers =====
  const syncNoteToCloud = useCallback((note: Note): Promise<void> => {
    const id = note.id;
    const accountId = userId;
    const taskKey = accountId ? `${accountId}:${id}` : id;
    const existingTask = inFlightTasks.current.get(taskKey);
    if (existingTask) return existingTask;
    // A stale debounce callback must NEVER recreate a draft already confirmed.
    if (!accountId || !pendingNotes.current.has(id) || deletingNotes.current.has(id) ||
        !navigator.onLine || !cloudReadyRef.current) return Promise.resolve();
    const task = (async () => {
      try {
      // Serialise writes per note; a newer edit can arrive while awaiting RPC.
      while (pendingNotes.current.has(id) && !deletingNotes.current.has(id) &&
             activeAccountId.current === accountId && navigator.onLine) {
        const draft = pendingNotes.current.get(id)!;
        const expected = confirmedRevisions.current.get(id) ?? (draft.revision ?? -1);
        const { data, error } = await supabase.rpc('save_note_versioned', {
          p_note: noteToRow(draft), p_expected_revision: expected,
        });
        if (deletingNotes.current.has(id) || activeAccountId.current !== accountId) break;
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
              void localDb.putNote(accountId, saved);
            }
          } else if (newest) {
            const carried = { ...newest, revision, syncPending: true };
            pendingNotes.current.set(id, carried);
            void localDb.putNote(accountId, carried);
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
        // New conflict notes always start with creation semantics. Never inherit
        // the original note's server revision.
        await localDb.putNote(accountId, copy);
        pendingNotes.current.set(copy.id, copy);
        confirmedRevisions.current.set(copy.id, -1);
        pendingNotes.current.delete(id);
        const { data: current, error: fetchError } = await supabase.from('notes')
          .select('*').eq('id', id).maybeSingle();
        if (!fetchError && current) {
          const remote = mapNote(current as NoteRow);
          confirmedRevisions.current.set(id, remote.revision ?? 0);
          await localDb.putNote(accountId, remote);
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
      // A new edit that arrived during the last RPC must not be stranded.
      if (pendingNotes.current.has(id) && !deletingNotes.current.has(id) &&
          activeAccountId.current === accountId && navigator.onLine) {
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
    })();
    inFlightTasks.current.set(taskKey, task);
    void task.finally(() => {
      if (inFlightTasks.current.get(taskKey) === task) inFlightTasks.current.delete(taskKey);
    });
    return task;
  }, [userId]);
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
      if (!userId || deletingNotes.current.has(note.id)) return;
      // Save to local cache immediately and protect against Realtime overwrites.
      const draft = { ...note, syncPending: true };
      pendingNotes.current.set(note.id, draft);
      void localDb.putNote(userId, draft);
      // Debounce cloud sync
      const existing = saveTimers.current.get(note.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        saveTimers.current.delete(note.id);
        void syncNoteToCloud(note);
      }, 600);
      saveTimers.current.set(note.id, timer);
    },
    [syncNoteToCloud, userId]
  );

  const saveFolder = useCallback(
    (folder: Folder) => {
      if (!userId) return;
      void localDb.putFolder(userId, folder);
      const existing = folderSaveTimers.current.get(folder.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        syncFolderToCloud(folder);
        folderSaveTimers.current.delete(folder.id);
      }, 400);
      folderSaveTimers.current.set(folder.id, timer);
    },
    [syncFolderToCloud, userId]
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
        revision: 0,
        syncPending: true,
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
    async (id: string): Promise<void> => {
      if (!userId) throw new Error('Sign in before deleting a note.');
      const note = notesRef.current.find((item) => item.id === id);
      if (!note) throw new Error('The note is no longer available.');

      const timer = saveTimers.current.get(id);
      if (timer) clearTimeout(timer);
      saveTimers.current.delete(id);
      deletingNotes.current.add(id);
      let pendingBeforeDelete: Note | undefined;

      try {
        // Let an already-sent CAS request settle, then block all later retries.
        const activeSync = inFlightTasks.current.get(`${userId}:${id}`);
        if (activeSync) await activeSync;

        // Persist a non-pending cache copy before the remote delete. If the tab
        // closes after Supabase succeeds, startup treats this as a stale synced
        // row and removes it instead of recreating it.
        pendingBeforeDelete = pendingNotes.current.get(id);
        const latest = pendingBeforeDelete ?? notesRef.current.find((item) => item.id === id) ?? note;
        pendingNotes.current.delete(id);
        await localDb.putNote(userId, {
          ...latest,
          revision: confirmedRevisions.current.get(id) ?? latest.revision ?? 0,
          syncPending: false,
        });

        // Capture paths while attachment rows still exist. The note delete below
        // cascades those rows; storage cleanup is intentionally afterward.
        const attachmentPaths = await getAttachmentStoragePaths(id);
        const { error } = await supabase
          .from('notes').delete().eq('id', id).select('id');
        if (error) throw new Error(`Could not permanently delete note: ${error.message}`);
        // Zero returned rows means the authenticated account already has no
        // matching cloud note (for example, a never-synced offline note).

        pendingNotes.current.delete(id);
        confirmedRevisions.current.delete(id);
        setNotes((prev) => prev.filter((item) => item.id !== id));
        setAttachments((prev) => prev.filter((item) => item.noteId !== id));

        try {
          await Promise.all([
            localDb.deleteNote(userId, id),
            localDb.deleteAttachmentsByNote(userId, id),
          ]);
        } catch (cacheError) {
          // The cloud deletion is already final. Keep the in-memory tombstone
          // so a stale cache row cannot be uploaded again in this session.
          console.error('Local cleanup after note deletion failed:', cacheError);
        }

        // Database deletion is authoritative. Storage failures only leave
        // inaccessible orphan objects and must not roll back the UI deletion.
        await Promise.all([
          deleteAllNoteImages(id),
          deleteAttachmentStorage(attachmentPaths),
        ]);
      } catch (error) {
        deletingNotes.current.delete(id);
        if (pendingBeforeDelete) {
          pendingNotes.current.set(id, pendingBeforeDelete);
          void localDb.putNote(userId, pendingBeforeDelete);
          void syncNoteToCloudRef.current(pendingBeforeDelete);
        }
        throw error;
      }
    },
    [userId]
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
      if (userId) void localDb.deleteFolder(userId, id);
      deleteFolderFromCloud(id);
    },
    [saveNote, deleteFolderFromCloud, userId]
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
          if (userId) void localDb.putFolder(userId, f);
          syncFolderToCloud(f);
        });
      }
      if (data.notes) {
        setNotes(data.notes);
        if (userId) void localDb.putNotes(userId, data.notes);
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
    [saveNote, syncFolderToCloud, userId]
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
        if (userId) await localDb.putAttachment(userId, attachment);
        return attachment;
      } catch (err) {
        console.error('Attachment upload failed:', err);
        return null;
      }
    },
    [userId]
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
      if (userId) void localDb.putAttachment(userId, updated);
      return updated;
    }));
    return true;
  }, [userId]);

  const removeAttachment = useCallback(
    async (id: string) => {
      // Do not report success or erase the offline record until Supabase confirms deletion.
      await deleteAttachment(id);
      if (userId) await localDb.deleteAttachmentRecord(userId, id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    },
    [userId]
  );

  const getAttachmentsForNote = useCallback(
    (noteId: string): Attachment[] => attachments.filter((a) => a.noteId === noteId),
    [attachments]
  );

  return {
    notes: loadedAccountId === userId ? notes : [],
    folders: loadedAccountId === userId ? folders : [],
    attachments: loadedAccountId === userId ? attachments : [],
    settings,
    loaded: loadedAccountId === userId && loaded,
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
