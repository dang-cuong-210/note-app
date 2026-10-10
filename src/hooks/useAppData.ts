import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, Folder, Settings, Attachment } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import * as localDb from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { uid, createNote, applyTheme, applyFontSize } from '@/lib/utils';
import { deleteAllNoteImages } from '@/lib/images';
import { createAttachmentSync } from '@/lib/attachmentSync';
import { createFolderSync, mapRemoteFolder, type FolderRecord } from '@/lib/folderSync';
import {
  uploadAttachment,
  deleteAttachment,
  deleteAttachmentStorage,
  getAttachmentStoragePaths,
  loadAllAttachments,
} from '@/lib/attachments';

interface NoteRow {
  id: string;
  user_id?: string;
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
  user_id?: string;
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

function realtimeDebug(message: string, details?: unknown) {
  if (!import.meta.env.DEV) return;
  if (details === undefined) console.debug(`[Noted realtime] ${message}`);
  else console.debug(`[Noted realtime] ${message}`, details);
}

const REALTIME_DIAGNOSTICS_ENABLED = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('rtdebug') === '1';

export interface RealtimeDiagnostics {
  enabled: boolean;
  maskedUserId: string;
  sessionStatus: string;
  sessionError: string | null;
  notesChannelStatus: string;
  notesChannelError: string | null;
  foldersChannelStatus: string;
  foldersChannelError: string | null;
  attachmentsChannelStatus: string;
  attachmentsChannelError: string | null;
  lastAttachmentsEventAt: string | null;
  lastAttachmentsEventType: string | null;
  websocketState: string;
  lastNotesEventAt: string | null;
  lastFoldersEventAt: string | null;
  lastEventType: string | null;
  lastRowId: string | null;
  receivedRevision: number | null;
  knownLocalRevision: number | null;
  decision: 'none' | 'received' | 'accepted' | 'ignored';
  ignoreReason: string | null;
  pendingNotesSize: number;
  inFlightSyncCount: number;
}

function maskUserId(userId: string | null): string {
  if (!userId) return 'none';
  if (userId.length <= 12) return `${userId.slice(0, 4)}…`;
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

function initialRealtimeDiagnostics(userId: string | null): RealtimeDiagnostics {
  return {
    enabled: REALTIME_DIAGNOSTICS_ENABLED,
    maskedUserId: maskUserId(userId),
    sessionStatus: userId ? 'not checked' : 'no authenticated user',
    sessionError: null,
    notesChannelStatus: 'not started',
    notesChannelError: null,
    foldersChannelStatus: 'not started',
    foldersChannelError: null,
    attachmentsChannelStatus: 'not started',
    attachmentsChannelError: null,
    lastAttachmentsEventAt: null,
    lastAttachmentsEventType: null,
    websocketState: REALTIME_DIAGNOSTICS_ENABLED
      ? supabase.realtime.connectionState()
      : 'disabled',
    lastNotesEventAt: null,
    lastFoldersEventAt: null,
    lastEventType: null,
    lastRowId: null,
    receivedRevision: null,
    knownLocalRevision: null,
    decision: 'none',
    ignoreReason: null,
    pendingNotesSize: 0,
    inFlightSyncCount: 0,
  };
}

export function useAppData(userId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentSync = useRef<ReturnType<typeof createAttachmentSync> | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  // Debounce timers and failed-request retries have different lifecycles.
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const folderSync = useRef<ReturnType<typeof createFolderSync> | null>(null);
  const [folderConflicts, setFolderConflicts] = useState<FolderRecord[]>([]);
  const [folderSyncError, setFolderSyncError] = useState<string | null>(null);
  const migratedRef = useRef(false);
  // Unsynced drafts remain in IndexedDB until the server confirms the write.
  const pendingNotes = useRef(new Map<string, Note>());
  const confirmedRevisions = useRef(new Map<string, number>());
  const inFlightTasks = useRef(new Map<string, Promise<void>>());
  const deletingNotes = useRef(new Set<string>());
  const activeAccountId = useRef<string | null>(userId);
  const cloudReadyRef = useRef(false);
  const flushPendingNotesToCloudRef = useRef<(accountId: string) => Promise<void>>(async () => {});
  const loadFromCloudRef = useRef<() => Promise<void>>(async () => {});
  const [syncConflicts, setSyncConflicts] = useState(0);
  const [realtimeDiagnostics, setRealtimeDiagnostics] = useState<RealtimeDiagnostics>(
    () => initialRealtimeDiagnostics(userId)
  );

  activeAccountId.current = userId;

  const updateRealtimeDiagnostics = useCallback((patch: Partial<RealtimeDiagnostics>) => {
    if (!REALTIME_DIAGNOSTICS_ENABLED) return;
    setRealtimeDiagnostics((current) => ({
      ...current,
      ...patch,
      pendingNotesSize: pendingNotes.current.size,
      inFlightSyncCount: inFlightTasks.current.size,
    }));
  }, []);

  useEffect(() => {
    if (!REALTIME_DIAGNOSTICS_ENABLED) return;
    updateRealtimeDiagnostics({
      maskedUserId: maskUserId(userId),
      sessionStatus: userId ? 'not checked' : 'no authenticated user',
      sessionError: null,
      notesChannelStatus: 'not started',
      notesChannelError: null,
      foldersChannelStatus: 'not started',
      foldersChannelError: null,
      attachmentsChannelStatus: 'not started',
      attachmentsChannelError: null,
      lastAttachmentsEventAt: null,
      lastAttachmentsEventType: null,
      lastNotesEventAt: null,
      lastFoldersEventAt: null,
      lastEventType: null,
      lastRowId: null,
      receivedRevision: null,
      knownLocalRevision: null,
      decision: 'none',
      ignoreReason: null,
    });
  }, [userId, updateRealtimeDiagnostics]);

  useEffect(() => {
    if (!REALTIME_DIAGNOSTICS_ENABLED) return;
    const refreshLiveValues = () => updateRealtimeDiagnostics({
      maskedUserId: maskUserId(userId),
      websocketState: supabase.realtime.connectionState(),
    });
    refreshLiveValues();
    const timer = window.setInterval(refreshLiveValues, 500);
    return () => window.clearInterval(timer);
  }, [userId, updateRealtimeDiagnostics]);

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
    const onOnline = () => {
      setOnline(true);
      const accountId = activeAccountId.current;
      if (!accountId) return;
      // Refresh revisions before resuming CAS writes. loadFromCloud also flushes
      // after its merge succeeds, including if `loaded` was already true.
      void loadFromCloudRef.current().then(async () => {
        if (activeAccountId.current !== accountId) return;
        await flushPendingNotesToCloudRef.current(accountId);
        const folderSession = folderSync.current;
        if (navigator.onLine && folderSession?.accountId === accountId) await folderSession.flush();
      }).catch((error) => console.warn('Online sync recovery failed:', error));
    };
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

    const [cloudNoteIdsResult, cloudFolderIdsResult] = await Promise.all([
      supabase.from('notes').select('id'),
      supabase.from('folders').select('id'),
    ]);
    if (cloudNoteIdsResult.error || cloudFolderIdsResult.error) return;
    const cloudNoteIds = new Set((cloudNoteIdsResult.data as { id: string }[]).map((row) => row.id));
    const cloudFolderIds = new Set((cloudFolderIdsResult.data as { id: string }[]).map((row) => row.id));
    await localDb.migrateLegacyData(userId, cloudNoteIds, cloudFolderIds);

    const [localNotes, localFolders] = await Promise.all([
      localDb.getAllNotes(userId),
      localDb.getAllFolders(userId),
    ]);

    if (localNotes.length === 0 && localFolders.length === 0) return;

    // Check if cloud already has data (to avoid duplicating)
    if (cloudNoteIds.size > 0) {
      // Cloud already has data — just clear local cache, cloud wins
      return;
    }

    // Unmarked cached folders are never interpreted as creates. Folder recovery
    // and new operations use the durable folder queue, separate from note CAS.
    // Never resurrect known synced notes removed on another device.
    const toMigrate = localNotes.filter((n) => n.syncPending || n.revision === undefined);
    if (toMigrate.length > 0) {
      const rows = toMigrate.map(noteToRow);
      const { error } = await supabase.from('notes').upsert(rows, { onConflict: 'id' });
      if (error) console.warn('Note migration error:', error.message);
    }
  }, [userId]);

  // Attachment requests have their own generation and mutation journal. A late
  // cloud response must not overwrite an event or a local upload/delete echo.
  const refreshAttachments = useCallback(async () => {
    const sync = attachmentSync.current;
    if (!userId || sync?.accountId !== userId) return;
    const snapshot = sync.beginSnapshot();
    try {
      const rows = await loadAllAttachments(userId);
      sync.applySnapshot(rows, snapshot);
    } catch (error) {
      console.warn('Attachment refresh failed; keeping cached metadata:', error);
      try {
        await sync.restoreCache(snapshot);
      } catch (cacheError) {
        console.warn('Attachment cache load failed:', cacheError);
      }
    }
  }, [userId]);

  // Load all data from cloud, merging with any local-only changes
  const refreshFolders = useCallback(async () => {
    const session = folderSync.current;
    if (!userId || activeAccountId.current !== userId || session?.accountId !== userId) return;
    await session.ready;
    const token = session.beginSnapshot();
    const { data, error } = await supabase.from('folders').select('*').eq('user_id', userId);
    if (error) return; // Keep durable pending work and cache; timer/online retries.
    await session.snapshot((data as Record<string, unknown>[]).map(mapRemoteFolder), token);
    await session.flush();
  }, [userId]);

  const loadFromCloud = useCallback(async () => {
    if (!userId || activeAccountId.current !== userId) return;
    const accountId = userId;
    setSyncing(true);
    // Load local cache first — used for merge and as fallback
    const folderSession = folderSync.current;
    if (folderSession?.accountId !== accountId) return;
    await folderSession?.ready;
    const folderSnapshot = folderSession?.beginSnapshot();
    const localNotes = await localDb.getAllNotes(accountId);
    try {
      const [notesRes, foldersRes] = await Promise.all([
        supabase.from('notes').select('*').order('updated_at', { ascending: false }),
        supabase.from('folders').select('*').eq('user_id', accountId).order('name', { ascending: true }),
        refreshAttachments(),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (foldersRes.error) throw foldersRes.error;

      const cloudNotes = (notesRes.data as NoteRow[]).map(mapNote);
      const cloudFolders = (foldersRes.data as Record<string, unknown>[]).map(mapRemoteFolder);

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

      if (folderSnapshot) await folderSession?.snapshot(cloudFolders, folderSnapshot);
      if (activeAccountId.current !== accountId) return;
      cloudReadyRef.current = true;
      setLoadedAccountId(accountId);
      setNotes(mergedNotes);

      // Cache locally for offline use
      await Promise.all([
        localDb.putNotes(accountId, mergedNotes),
      ]);
      // Flush only after merged drafts and CAS revision bookkeeping are ready.
      // This also handles a successful refresh where `loaded` does not change.
      if (navigator.onLine && activeAccountId.current === accountId) {
        void flushPendingNotesToCloudRef.current(accountId);
      }
    } catch (err) {
      cloudReadyRef.current = false;
      console.warn('Cloud load failed, falling back to local cache:', err);
      if (activeAccountId.current !== accountId) return;
      const recovered = new Map(localNotes.map((note) => [note.id, note]));
      pendingNotes.current.forEach((draft, id) => recovered.set(id, draft));
      recovered.forEach((note) => {
        if (note.syncPending) pendingNotes.current.set(note.id, note);
      });
      setLoadedAccountId(accountId);
      setNotes(Array.from(recovered.values()));
    } finally {
      if (activeAccountId.current === accountId) {
        setSyncing(false);
        setLoaded(true);
      }
    }
  }, [userId, refreshAttachments]);
  loadFromCloudRef.current = loadFromCloud;

  // Initial load
  useEffect(() => {
    saveTimers.current.forEach(clearTimeout);
    saveTimers.current.clear();
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current.clear();
    pendingNotes.current.clear();
    confirmedRevisions.current.clear();
    deletingNotes.current.clear();
    cloudReadyRef.current = false;
    migratedRef.current = false;
    setNotes([]);
    setFolders([]);
    setFolderConflicts([]);
    setFolderSyncError(null);
    setAttachments([]);
    setLoaded(false);
    setLoadedAccountId(null);
    if (!userId) return;
    const sync = createAttachmentSync(userId, localDb, (values) => {
      if (activeAccountId.current === userId) setAttachments(values);
    }, (error) => console.warn('Attachment cache write failed:', error));
    attachmentSync.current = sync;
    const folders = createFolderSync(userId, localDb, async (op) => {
      if (activeAccountId.current !== userId) throw new Error('Account changed');
      const { data, error } = await supabase.rpc('write_folder_versioned', {
        p_account: userId, p_folder: folderToRow(op.value), p_expected: op.expected,
        p_operation: op.id, p_delete: op.kind === 'delete',
      });
      if (error) throw error;
      if (!data || !['saved', 'deleted', 'conflict'].includes(data.status)) throw new Error('Invalid folder acknowledgement');
      if (activeAccountId.current === userId) setFolderSyncError(null);
      return { status: data.status, folder: data.folder ? mapRemoteFolder(data.folder) : null };
    }, (values, conflicts) => {
      if (activeAccountId.current !== userId) return;
      setFolders(values);
      setFolderConflicts(conflicts);
    }, (error) => {
      console.warn('Folder sync pending:', error);
      if (activeAccountId.current === userId) setFolderSyncError('Folder changes could not be saved or synced. Keep this window open if device storage is unavailable.');
    });
    folderSync.current = folders;
    const retry = window.setInterval(() => { if (navigator.onLine) void folders.flush(); }, 5000);
    (async () => {
      await migrateLocalData();
      await folders.ready;
      await loadFromCloud();
      if (navigator.onLine) void folders.flush();
    })();
    return () => {
      window.clearInterval(retry);
      folders.dispose();
      if (folderSync.current === folders) folderSync.current = null;
      sync.dispose();
      if (attachmentSync.current === sync) attachmentSync.current = null;
    };
  }, [userId, migrateLocalData, loadFromCloud]);

  // Realtime subscription for cross-device sync
  useEffect(() => {
    if (!loaded || !userId) return;
    const accountId = userId;
    let disposed = false;
    let initialRealtimeRefreshStarted = false;
    let notesChannel: ReturnType<typeof supabase.channel> | null = null;
    let foldersChannel: ReturnType<typeof supabase.channel> | null = null;
    let attachmentsChannel: ReturnType<typeof supabase.channel> | null = null;
    const sync = attachmentSync.current;

    const onChannelStatus = (channelName: 'notes' | 'folders') =>
      (status: string, error?: Error) => {
        realtimeDebug(`${channelName} channel ${status}`, error?.message);
        updateRealtimeDiagnostics(channelName === 'notes'
          ? { notesChannelStatus: status, notesChannelError: error?.message ?? null }
          : { foldersChannelStatus: status, foldersChannelError: error?.message ?? null });
        // Loading precedes subscription setup, so one change can otherwise land
        // between the initial query and SUBSCRIBED. Refresh once after the first
        // channel joins; pending drafts remain protected by loadFromCloud.
        if (status === 'SUBSCRIBED' && !initialRealtimeRefreshStarted) {
          initialRealtimeRefreshStarted = true;
          void loadFromCloud();
        }
      };

    const subscribe = async () => {
      updateRealtimeDiagnostics({
        sessionStatus: 'checking',
        sessionError: null,
        notesChannelStatus: 'waiting for session',
        notesChannelError: null,
        foldersChannelStatus: 'waiting for session',
        foldersChannelError: null,
        attachmentsChannelStatus: 'waiting for session',
        attachmentsChannelError: null,
      });

      // Verify the session before opening the socket. realtime-js starts its
      // async token lookup and the channel join concurrently, so a restored
      // session can otherwise join Postgres Changes as `anon`. Set the verified
      // token first; supabase-js continues to propagate later token refreshes.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (disposed) return;
      const session = sessionData.session;
      const expired = Boolean(session?.expires_at && session.expires_at * 1000 <= Date.now());
      let invalidReason: string | null = null;
      if (sessionError) invalidReason = sessionError.message;
      else if (!session?.access_token) invalidReason = 'missing access token';
      else if (session.user.id !== accountId) invalidReason = 'session user does not match active account';
      else if (expired) invalidReason = 'session is expired';

      if (invalidReason) {
        updateRealtimeDiagnostics({
          sessionStatus: 'invalid',
          sessionError: invalidReason,
          notesChannelStatus: 'not subscribed',
          foldersChannelStatus: 'not subscribed',
          attachmentsChannelStatus: 'not subscribed',
        });
        realtimeDebug('realtime subscription skipped: invalid session', invalidReason);
        return;
      }

      updateRealtimeDiagnostics({ sessionStatus: 'valid', sessionError: null });
      if (!session) return;

      try {
        await supabase.realtime.setAuth(session.access_token);
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : 'failed to authenticate Realtime';
        updateRealtimeDiagnostics({
          sessionStatus: 'invalid',
          sessionError: message,
          notesChannelStatus: 'not subscribed',
          foldersChannelStatus: 'not subscribed',
          attachmentsChannelStatus: 'not subscribed',
        });
        realtimeDebug('realtime authentication failed', message);
        return;
      }
      if (disposed) return;

      notesChannel = supabase
        .channel(`notes-sync:${accountId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${accountId}` },
          (payload) => {
          const newRow = payload.new as Partial<NoteRow>;
          const oldRow = payload.old as Partial<NoteRow>;
          const rowId = newRow.id ?? oldRow.id ?? null;
          const receivedRevision = typeof newRow.revision === 'number'
            ? newRow.revision
            : typeof oldRow.revision === 'number' ? oldRow.revision : null;
          const knownLocalRevision = rowId
            ? confirmedRevisions.current.get(rowId) ?? -1
            : null;
          updateRealtimeDiagnostics({
            lastNotesEventAt: new Date().toISOString(),
            lastEventType: payload.eventType,
            lastRowId: rowId,
            receivedRevision,
            knownLocalRevision,
            decision: 'received',
            ignoreReason: null,
          });
          realtimeDebug('notes event received', {
            eventType: payload.eventType,
            id: rowId,
            revision: receivedRevision,
          });
          if (activeAccountId.current !== accountId) {
            updateRealtimeDiagnostics({
              decision: 'ignored',
              ignoreReason: 'subscription account is no longer active',
            });
            realtimeDebug('notes change ignored for inactive account', rowId);
            return;
          }
          if (payload.eventType === 'DELETE') {
            if (!oldRow.id) {
              updateRealtimeDiagnostics({
                decision: 'ignored',
                ignoreReason: 'DELETE payload has no row ID',
              });
              return;
            }
            if (pendingNotes.current.has(oldRow.id)) {
              updateRealtimeDiagnostics({
                decision: 'ignored',
                ignoreReason: 'pending local draft',
              });
              realtimeDebug('notes delete ignored for pending local draft', oldRow.id);
              return;
            }
            confirmedRevisions.current.delete(oldRow.id);
            setNotes((prev) => prev.filter((n) => n.id !== oldRow.id));
            void localDb.deleteNote(accountId, oldRow.id);
            updateRealtimeDiagnostics({ decision: 'accepted', ignoreReason: null });
          } else {
            // RLS is the primary row boundary. Keep this client check for
            // non-delete payloads without filtering the channel, because
            // Postgres DELETE payloads may contain only the primary key.
            if (newRow.user_id && newRow.user_id !== accountId) {
              updateRealtimeDiagnostics({
                decision: 'ignored',
                ignoreReason: 'row belongs to another account',
              });
              realtimeDebug('notes change ignored for another account', newRow.id);
              return;
            }
            const note = mapNote(newRow as NoteRow);
            // Never overwrite an unsynced draft, including the IndexedDB copy.
            // Its conditional write will either succeed or create a conflict copy.
            if (pendingNotes.current.has(note.id)) {
              updateRealtimeDiagnostics({
                decision: 'ignored',
                ignoreReason: 'pending local draft',
              });
              realtimeDebug('notes change ignored for pending local draft', note.id);
              return;
            }
            const knownRevision = confirmedRevisions.current.get(note.id) ?? -1;
            if (note.revision! < knownRevision) {
              updateRealtimeDiagnostics({
                knownLocalRevision: knownRevision,
                decision: 'ignored',
                ignoreReason: `stale revision: received ${note.revision ?? 0}, known ${knownRevision}`,
              });
              realtimeDebug('stale notes revision ignored', {
                id: note.id,
                receivedRevision: note.revision,
                knownRevision,
              });
              return;
            }
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
            updateRealtimeDiagnostics({
              decision: 'accepted',
              ignoreReason: null,
            });
          }
          }
        )
        .subscribe(onChannelStatus('notes'));

      foldersChannel = supabase
        .channel(`folders-sync:${accountId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'folders', filter: `user_id=eq.${accountId}` },
          (payload) => {
          const newRow = payload.new as Partial<FolderRow>;
          const oldRow = payload.old as Partial<FolderRow>;
          const rowId = newRow.id ?? oldRow.id ?? null;
          updateRealtimeDiagnostics({
            lastFoldersEventAt: new Date().toISOString(),
            lastEventType: payload.eventType,
            lastRowId: rowId,
            receivedRevision: null,
            knownLocalRevision: null,
            decision: 'received',
            ignoreReason: null,
          });
          realtimeDebug('folders event received', {
            eventType: payload.eventType,
            id: rowId,
          });
          if (activeAccountId.current !== accountId) {
            updateRealtimeDiagnostics({
              decision: 'ignored',
              ignoreReason: 'subscription account is no longer active',
            });
            return;
          }
          if (disposed) return;
          if (payload.eventType === 'DELETE') {
            if (oldRow.id && (!oldRow.user_id || oldRow.user_id === accountId)) {
              void folderSync.current?.remoteDelete(oldRow.id).catch(() => {});
            }
          } else if (newRow.user_id === accountId && newRow.id) {
            void folderSync.current?.receive(mapRemoteFolder(payload.new)).catch(() => {});
          }
          }
        )
        .subscribe((status, error) => {
          if (disposed || activeAccountId.current !== accountId) return;
          onChannelStatus('folders')(status, error);
          if (status === 'SUBSCRIBED' && !disposed && activeAccountId.current === accountId) {
            void refreshFolders().catch(() => {});
          }
        });

      attachmentsChannel = supabase
        .channel(`attachments-sync:${accountId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attachments', filter: `user_id=eq.${accountId}` },
          (payload) => {
            if (disposed || activeAccountId.current !== accountId || sync?.accountId !== accountId) return;
            if (!sync.receive(payload)) return;
            updateRealtimeDiagnostics({
              lastAttachmentsEventAt: new Date().toISOString(),
              lastAttachmentsEventType: payload.eventType,
            });
          }
        )
        .subscribe((status, error) => {
          if (disposed || activeAccountId.current !== accountId) return;
          updateRealtimeDiagnostics({
            attachmentsChannelStatus: status,
            attachmentsChannelError: error?.message ?? null,
          });
          // Refresh after THIS channel joins, not after notes/folders join.
          // Also reconcile missed deletes on every reconnect, without touching
          // note drafts or restarting the existing note/folder subscriptions.
          if (status === 'SUBSCRIBED') void refreshAttachments();
        });
    };

    void subscribe();

    return () => {
      disposed = true;
      realtimeDebug('removing realtime channels', accountId);
      if (notesChannel) void supabase.removeChannel(notesChannel);
      if (foldersChannel) void supabase.removeChannel(foldersChannel);
      if (attachmentsChannel) void supabase.removeChannel(attachmentsChannel);
    };
  }, [loaded, userId, loadFromCloud, refreshAttachments, refreshFolders, updateRealtimeDiagnostics]);

  // ===== Cloud sync helpers =====
  const syncNoteToCloud = useCallback((note: Note): Promise<void> => {
    const id = note.id;
    const accountId = userId;
    const taskKey = accountId ? `${accountId}:${id}` : id;
    const existingTask = inFlightTasks.current.get(taskKey);
    if (existingTask) return existingTask;
    // A stale debounce callback must NEVER recreate a draft already confirmed.
    if (!accountId || activeAccountId.current !== accountId || !pendingNotes.current.has(id) ||
        deletingNotes.current.has(id) || !navigator.onLine || !cloudReadyRef.current) {
      if (pendingNotes.current.has(id)) {
        realtimeDebug('note sync deferred', {
          id,
          online: navigator.onLine,
          cloudReady: cloudReadyRef.current,
          accountActive: activeAccountId.current === accountId,
        });
      }
      return Promise.resolve();
    }
    const task = (async () => {
      let retryRequired = false;
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
          retryRequired = true;
          break;
        }
        const result = data as { status: string; revision?: number; updated_at?: number } | null;
        if (!result || !['saved', 'conflict'].includes(result.status)) {
          console.warn('Unexpected note sync result; draft remains on this device');
          retryRequired = true;
          break;
        }
        if (result.status === 'saved') {
          const revision = result.revision!;
          confirmedRevisions.current.set(id, revision);
          const newest = pendingNotes.current.get(id);
          if (newest === draft) {
            pendingNotes.current.delete(id);
            const retry = retryTimers.current.get(id);
            if (retry) clearTimeout(retry);
            retryTimers.current.delete(id);
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
      retryRequired = true;
      } finally {
      // Retry only requests that actually started and failed. Offline and
      // cloud-not-ready deferrals wait for their lifecycle event instead.
      if (retryRequired && pendingNotes.current.has(id) && !deletingNotes.current.has(id) &&
          activeAccountId.current === accountId && navigator.onLine) {
        const existing = retryTimers.current.get(id);
        if (!existing) {
          const timer = setTimeout(() => {
            retryTimers.current.delete(id);
            const latest = pendingNotes.current.get(id);
            if (latest) void syncNoteToCloudRef.current(latest);
          }, 5000);
          retryTimers.current.set(id, timer);
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

  // Retry the latest durable draft for each note, one at a time. This path is
  // shared by cloud-ready, network recovery, page visibility, and manual flushes.
  const flushPendingNotesToCloud = useCallback(async (accountId: string) => {
    if (!userId || accountId !== userId || activeAccountId.current !== accountId ||
        !navigator.onLine || !cloudReadyRef.current) {
      realtimeDebug('pending note flush deferred', {
        pending: pendingNotes.current.size,
        online: navigator.onLine,
        cloudReady: cloudReadyRef.current,
        accountActive: !!accountId && activeAccountId.current === accountId,
      });
      return;
    }

    let attempted = 0;
    let deferredForRetry = 0;
    for (const id of Array.from(pendingNotes.current.keys())) {
      if (activeAccountId.current !== accountId || !navigator.onLine || !cloudReadyRef.current) break;
      if (deletingNotes.current.has(id)) continue;
      // A failed request keeps its existing five-second backoff even if another
      // lifecycle event happens during that interval.
      if (retryTimers.current.has(id)) { deferredForRetry += 1; continue; }
      const debounce = saveTimers.current.get(id);
      if (debounce) clearTimeout(debounce);
      saveTimers.current.delete(id);
      const latest = pendingNotes.current.get(id);
      if (!latest) continue;
      attempted += 1;
      await syncNoteToCloudRef.current(latest);
    }
    updateRealtimeDiagnostics({});
    realtimeDebug('pending note flush finished', {
      attempted,
      pending: pendingNotes.current.size,
      deferredForRetry,
      online: navigator.onLine,
      cloudReady: cloudReadyRef.current,
    });
  }, [userId, updateRealtimeDiagnostics]);
  flushPendingNotesToCloudRef.current = flushPendingNotesToCloud;

  // Debounced save: local + cloud
  const saveNote = useCallback(
    (note: Note) => {
      if (!userId || deletingNotes.current.has(note.id)) return;
      // Save to local cache immediately and protect against Realtime overwrites.
      const draft = { ...note, syncPending: true };
      pendingNotes.current.set(note.id, draft);
      void localDb.putNote(userId, draft);
      const retry = retryTimers.current.get(note.id);
      if (retry) clearTimeout(retry);
      retryTimers.current.delete(note.id);
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

  // Persist intent before scheduling any network work. flush always rereads the
  // durable queue, so no captured debounce callback can resurrect a deleted ID.
  const saveFolder = useCallback((folder: Folder) => {
    const session = folderSync.current;
    if (!userId || activeAccountId.current !== userId || session?.accountId !== userId) return;
    void session.save(folder).then(() => { if (navigator.onLine) void session.flush(); }).catch(() => {});
  }, [userId]);

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
      const retryTimer = retryTimers.current.get(id);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimers.current.delete(id);
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
        if (attachmentSync.current?.accountId === userId) attachmentSync.current.removeForNote(id);

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
      if (!userId || activeAccountId.current !== userId) return;
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
      const folder = folders.find((f) => f.id === id);
      const session = folderSync.current;
      if (folder && session) void session.remove(folder).then(() => {
        if (navigator.onLine) void session.flush();
      }).catch(() => {});
    },
    [saveNote, folders, userId]
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
          saveFolder(f);
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
    [saveNote, saveFolder, userId]
  );

  const flushAll = useCallback(async () => {
    const folderTask = folderSync.current?.flush();
    await flushPendingNotesToCloud(userId ?? '');
    await folderTask;
  }, [flushPendingNotesToCloud, userId]);

  // Flush pending changes when the page is hidden or unloaded
  useEffect(() => {
    if (!loaded) return;
    const handler = () => { void flushAll(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handler();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', handler);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', handler);
    };
  }, [loaded, flushAll]);

  // After recovering drafts from IndexedDB, try to upload them now.
  useEffect(() => {
    if (loaded && navigator.onLine && cloudReadyRef.current && pendingNotes.current.size) void flushAll();
  }, [loaded, flushAll]);

  // ===== Attachment operations =====
  const addAttachment = useCallback(
    async (noteId: string, file: File): Promise<Attachment | null> => {
      const sync = attachmentSync.current;
      if (!userId || sync?.accountId !== userId) return null;
      const version = sync.version;
      try {
        const attachment = await uploadAttachment(noteId, file);
        if (activeAccountId.current !== userId || attachmentSync.current !== sync) return null;
        sync.upsert(attachment, version);
        await sync.settled();
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
    const sync = attachmentSync.current;
    if (!userId || sync?.accountId !== userId) return false;
    const version = sync.version;
    const trimmed = name.trim();
    if (!trimmed) return false;
    const { error } = await supabase.from('attachments').update({ name: trimmed }).eq('id', id);
    if (error) {
      console.error('Attachment rename failed:', error);
      return false;
    }
    if (activeAccountId.current !== userId || attachmentSync.current !== sync) return false;
    sync.rename(id, trimmed, version);
    return true;
  }, [userId]);

  const removeAttachment = useCallback(
    async (id: string) => {
      const sync = attachmentSync.current;
      if (!userId || sync?.accountId !== userId) throw new Error('Sign in before deleting an attachment.');
      // Do not report success or erase the offline record until Supabase confirms deletion.
      await deleteAttachment(id);
      if (activeAccountId.current !== userId || attachmentSync.current !== sync) return;
      sync.remove(id);
      await sync.settled();
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
    folderConflicts: loadedAccountId === userId ? folderConflicts : [],
    folderSyncError: loadedAccountId === userId ? folderSyncError : null,
    resolveFolderConflict: async (id: string, choice: 'server' | 'copy' | 'delete') => {
      const session = folderSync.current;
      if (!userId || activeAccountId.current !== userId || session?.accountId !== userId) return;
      const shownRevision = folderConflicts.find((r) => r.id === id)?.remote?.revision;
      await session?.resolve(id, choice, choice === 'copy' ? uid() : undefined, shownRevision);
      if (navigator.onLine) await session?.flush();
    },
    realtimeDiagnostics,
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
