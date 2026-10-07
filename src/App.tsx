import { useState, useEffect } from 'react';
import { Menu, CloudOff } from 'lucide-react';
import { useAppData } from '@/hooks/useAppData';
import { ToastProvider } from '@/components/ToastProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { TanookiLoading } from '@/components/TanookiBrand';
import { AuthScreen } from '@/components/AuthScreen';
import { Sidebar } from '@/components/Sidebar';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { TanookiDashboard } from '@/components/TanookiDashboard';
import { NoteList } from '@/components/NoteList';
import { NoteEditor } from '@/components/NoteEditor';
import { SettingsView } from '@/components/SettingsView';
import { RealtimeDiagnosticsPanel } from '@/components/RealtimeDiagnosticsPanel';
import { FolderSyncNotice } from '@/components/FolderSyncNotice';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ViewType } from '@/lib/navigation';
import { getInitialView, getDashboardSearchDestination, getDashboardNoteDestination, shouldAutoSelectNote } from '@/lib/dashboardData.js';
import { noteHasTag, searchNotes } from '@/lib/utils';

function AppContent() {
  const { user, loading: authLoading, signOut } = useAuth();
  const data = useAppData(user?.id ?? null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [view, setView] = useState<ViewType>(() => getInitialView(window.innerWidth >= 1024));
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();
  const diagnosticsPanel = (
    <RealtimeDiagnosticsPanel diagnostics={data.realtimeDiagnostics} />
  );
  useEffect(() => {
    const onResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (!desktop) setView((current) => current.kind === 'home' ? { kind: 'all' } : current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (data.syncConflicts > 0) {
      toast('A sync conflict was detected. Both versions were preserved as separate notes.');
      data.dismissSyncConflicts();
    }
  }, [data.syncConflicts]); // eslint-disable-line react-hooks/exhaustive-deps


  // Select first note when view changes (desktop only)
  useEffect(() => {
    if (!data.loaded) return;
    if (isDesktop) {
      if (shouldAutoSelectNote(view)) {
        const visibleNotes = getVisibleNotes();
        if (visibleNotes.length > 0 && !visibleNotes.find((n) => n.id === selectedNoteId)) {
          setSelectedNoteId(visibleNotes[0].id);
        }
      }
    }
  }, [view, data.loaded, isDesktop]); // eslint-disable-line react-hooks/exhaustive-deps

  function getVisibleNotes() {
    const visible = data.notes.filter((n) => {
      switch (view.kind) {
        case 'all': return !n.trashed && !n.archived;
        case 'recent': return !n.trashed && !n.archived;
        case 'pinned': return !n.trashed && !n.archived && n.pinned;
        case 'archived': return !n.trashed && n.archived;
        case 'trash': return n.trashed;
        case 'folder': return !n.trashed && !n.archived && n.folderId === view.id;
        case 'tag': return !n.trashed && !n.archived && noteHasTag(n, view.name);
        default: return false;
      }
    });
    const queryFiltered = searchQuery ? searchNotes(visible, searchQuery) : visible;
    return view.kind === 'recent' ? queryFiltered.sort((a, b) => b.updatedAt - a.updatedAt) : queryFiltered;
  }

  const selectedNote = data.notes.find((n) => n.id === selectedNoteId) || null;

  const handleViewChange = (v: ViewType) => {
    setView(v);
    setSearchQuery('');
    if (v.kind === 'settings' || v.kind === 'home' || v.kind === 'recent') setSelectedNoteId(null);
  };

  const handleSearchSubmit = (query: string) => {
    const destination = getDashboardSearchDestination(query);
    setSearchQuery(destination.query);
    setView(destination.view);
    setSelectedNoteId(null);
  };

  const handleAddNote = () => {
    const folderId = view.kind === 'folder' ? view.id : null;
    const note = data.addNote(folderId);
    setSelectedNoteId(note.id);
  };

  const handleDashboardAddNote = () => {
    const folderId = view.kind === 'folder' ? view.id : null;
    const note = data.addNote(folderId);
    if (view.kind !== 'folder') setView({ kind: 'all' });
    setSelectedNoteId(note.id);
  };

  const handleTrash = (id: string) => {
    data.trashNote(id);
    if (selectedNoteId === id) {
      const remaining = getVisibleNotes().filter((n) => n.id !== id);
      setSelectedNoteId(remaining[0]?.id || null);
    }
    toast('Note moved to trash', {
      label: 'Undo',
      onClick: () => data.restoreNote(id),
    });
  };

  const handleRestore = (id: string) => {
    data.restoreNote(id);
    toast('Note restored');
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      await data.permanentDelete(id);
      if (selectedNoteId === id) setSelectedNoteId(null);
      toast('Note permanently deleted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Note deletion failed';
      toast(message);
      throw error;
    }
  };

  const handleDuplicate = (id: string) => {
    const copy = data.duplicateNote(id);
    if (copy) {
      setSelectedNoteId(copy.id);
      toast('Note duplicated');
    }
  };

  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
  };

  // Keyboard shortcuts for common note actions.
  const addNoteShortcut = data.addNote;
  const dataLoaded = data.loaded;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target?.isContentEditable ||
          target?.closest('input, textarea, select, [contenteditable="true"]')
      );
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'k') {
        if (isTyping) return;
        const searchInput = Array.from(document.querySelectorAll<HTMLInputElement>('[data-global-search]'))
          .find((input) => input.getClientRects().length > 0);
        if (searchInput) {
          event.preventDefault();
          searchInput.focus();
        }
        return;
      }

      if (modifier && key === 'n') {
        event.preventDefault();
        if (
          isTyping ||
          !user ||
          !dataLoaded ||
          view.kind === 'trash' ||
          view.kind === 'settings' ||
          view.kind === 'archived'
        ) return;
        const folderId = view.kind === 'folder' ? view.id : null;
        const note = addNoteShortcut(folderId);
        if (view.kind === 'home') setView({ kind: 'all' });
        setSelectedNoteId(note.id);
        return;
      }

      if (isTyping) return;

      if (event.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
          return;
        }
        if (sidebarOpen) {
          setSidebarOpen(false);
          return;
        }
        if (window.innerWidth < 1024 && selectedNoteId) setSelectedNoteId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addNoteShortcut, dataLoaded, searchQuery, selectedNoteId, sidebarOpen, user, view]);

  // Show auth screen if not signed in
  if (authLoading) {
    return (
      <>
        <TanookiLoading>Đang mở Tanooki…</TanookiLoading>
        {diagnosticsPanel}
      </>
    );
  }

  if (!user) {
    return <><AuthScreen />{diagnosticsPanel}</>;
  }

  if (!data.loaded) {
    return (
      <>
        <TanookiLoading>Đang đồng bộ ghi chú của bạn…</TanookiLoading>
        {diagnosticsPanel}
      </>
    );
  }

  const showHome = view.kind === 'home' && isDesktop;
  const showEditor = view.kind !== 'settings' && view.kind !== 'trash' && !showHome;
  const showSettings = view.kind === 'settings';

  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      <FolderSyncNotice conflicts={data.folderConflicts} error={data.folderSyncError} onResolve={data.resolveFolderConflict} />
      {/* The note editor already has a Back button on mobile. */}
            {/* Sidebar - desktop */}
      <div className="hidden lg:flex border-r" style={{ borderColor: 'var(--border)' }}>
        <DesktopSidebar
          notes={data.notes}
          folders={data.folders}
          currentView={view}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          onViewChange={handleViewChange}
          onAddNote={handleDashboardAddNote}
          onAddFolder={data.addFolder}
          onRenameFolder={data.renameFolder}
          onDeleteFolder={data.removeFolder}
          onSignOut={signOut}
        />
      </div>

      {/* Sidebar - mobile drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-72 z-40 lg:hidden animate-slide-in shadow-2xl">
            <Sidebar
              notes={data.notes}
              folders={data.folders}
              currentView={view}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
              onViewChange={handleViewChange}
              onAddFolder={data.addFolder}
              onRenameFolder={data.renameFolder}
              onDeleteFolder={data.removeFolder}
              onClose={() => setSidebarOpen(false)}
              userEmail={user.email}
              onSignOut={signOut}
            />
          </aside>
        </>
      )}

      {/* Main area */}
      <main className="max-lg:w-full max-lg:min-w-0 max-lg:max-w-full flex-1 flex overflow-hidden relative">
        {/* Offline indicator */}
        {!data.online && (
          <div
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs"
            style={{ backgroundColor: 'var(--warning)', color: 'white' }}
          >
            <CloudOff size={14} />
            Offline — changes will sync when reconnected
          </div>
        )}

        {showHome ? (
          <TanookiDashboard
            notes={data.notes}
            folders={data.folders}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
            onViewChange={handleViewChange}
            onOpenNote={(id) => { const destination = getDashboardNoteDestination(id); setView(destination.view); setSelectedNoteId(destination.selectedNoteId); }}
          />
        ) : showSettings ? (
          <SettingsView
            settings={data.settings}
            notes={data.notes}
            folders={data.folders}
            onUpdateSettings={data.updateSettings}
            onImport={data.importData}
            onBack={() => handleViewChange({ kind: 'all' })}
          />
        ) : showEditor ? (
          <>
            {/* Notes list panel */}
            <div
              className={`${
                selectedNoteId ? 'hidden lg:flex' : 'flex'
              } w-full max-lg:min-w-0 max-lg:max-w-full lg:w-80 xl:w-96 flex-shrink-0 border-r flex-col relative`}
              style={{ borderColor: 'var(--border)' }}
            >
              {/* Mobile menu button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="hidden"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Menu size={20} />
              </button>
              <NoteList
                notes={data.notes}
                folders={data.folders}
                view={view}
                            onOpenSidebar={() => setSidebarOpen(true)}
                settings={data.settings}
                selectedNoteId={selectedNoteId}
                onSelectNote={handleSelectNote}
                onAddNote={handleAddNote}
                onTogglePin={data.togglePin}
                onTrash={handleTrash}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
                onDuplicate={handleDuplicate}
                onArchive={data.archiveNote}
                onMove={data.moveNote}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>

            {/* Editor panel */}
        <div className={`${selectedNoteId ? 'flex' : 'hidden lg:flex'} max-lg:w-full max-lg:min-w-0 max-lg:max-w-full flex-1 overflow-hidden`}>
              <NoteEditor
                note={selectedNote}
                folders={data.folders}
                attachments={data.getAttachmentsForNote(selectedNote?.id || '')}
                onUpdate={data.updateNoteContent}
                onTogglePin={data.togglePin}
                onTrash={handleTrash}
                onMove={data.moveNote}
                onArchive={data.archiveNote}
                onAddAttachment={data.addAttachment}
                onRemoveAttachment={data.removeAttachment}
                onRenameAttachment={data.renameAttachment}
                onBack={() => setSelectedNoteId(null)}
              />
            </div>
          </>
        ) : (
          /* Trash view - just the list */
          <div className="w-full flex flex-col relative">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden absolute top-3 left-3 z-10 p-2 rounded-lg hover-bg"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Menu size={20} />
            </button>
            <NoteList
              notes={data.notes}
              folders={data.folders}
              view={view}
              settings={data.settings}
              selectedNoteId={selectedNoteId}
              onSelectNote={handleSelectNote}
              onAddNote={handleAddNote}
              onTogglePin={data.togglePin}
              onTrash={handleTrash}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
              onDuplicate={handleDuplicate}
              onArchive={data.archiveNote}
              onMove={data.moveNote}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>
        )}
      </main>
      {diagnosticsPanel}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

