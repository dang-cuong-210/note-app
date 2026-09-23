import { useState, useEffect } from 'react';
import { Menu, CloudOff, RefreshCw } from 'lucide-react';
import { useAppData } from '@/hooks/useAppData';
import { ToastProvider } from '@/components/ToastProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { AuthScreen } from '@/components/AuthScreen';
import { Sidebar } from '@/components/Sidebar';
import { NoteList } from '@/components/NoteList';
import { NoteEditor } from '@/components/NoteEditor';
import { SettingsView } from '@/components/SettingsView';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ViewType } from '@/lib/navigation';
import { noteHasTag } from '@/lib/utils';

function AppContent() {
  const { user, loading: authLoading, signOut } = useAuth();
  const data = useAppData();
  const [view, setView] = useState<ViewType>({ kind: 'all' });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();

  // Select first note when view changes (desktop only)
  useEffect(() => {
    if (!data.loaded) return;
    if (window.innerWidth >= 1024) {
      if (view.kind !== 'settings' && view.kind !== 'trash') {
        const visibleNotes = getVisibleNotes();
        if (visibleNotes.length > 0 && !visibleNotes.find((n) => n.id === selectedNoteId)) {
          setSelectedNoteId(visibleNotes[0].id);
        }
      }
    }
  }, [view, data.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function getVisibleNotes() {
    return data.notes.filter((n) => {
      switch (view.kind) {
        case 'all': return !n.trashed && !n.archived;
        case 'pinned': return !n.trashed && !n.archived && n.pinned;
        case 'archived': return !n.trashed && n.archived;
        case 'trash': return n.trashed;
        case 'folder': return !n.trashed && !n.archived && n.folderId === view.id;
        case 'tag': return !n.trashed && !n.archived && noteHasTag(n, view.name);
        default: return false;
      }
    });
  }

  const selectedNote = data.notes.find((n) => n.id === selectedNoteId) || null;

  const handleViewChange = (v: ViewType) => {
    setView(v);
    setSearchQuery('');
    if (v.kind === 'settings') setSelectedNoteId(null);
  };

  const handleAddNote = () => {
    const folderId = view.kind === 'folder' ? view.id : null;
    const note = data.addNote(folderId);
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

  const handlePermanentDelete = (id: string) => {
    data.permanentDelete(id);
    if (selectedNoteId === id) setSelectedNoteId(null);
    toast('Note permanently deleted');
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

  // Show auth screen if not signed in
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (!data.loaded) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Syncing your notes…</div>
        </div>
      </div>
    );
  }

  const showEditor = view.kind !== 'settings' && view.kind !== 'trash';
  const showSettings = view.kind === 'settings';

  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 border-r" style={{ borderColor: 'var(--border)' }}>
        <Sidebar
          notes={data.notes}
          folders={data.folders}
          currentView={view}
          onViewChange={handleViewChange}
          onAddFolder={data.addFolder}
          onRenameFolder={data.renameFolder}
          onDeleteFolder={data.removeFolder}
          userEmail={user.email}
          onSignOut={signOut}
        />
      </aside>

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
      <main className="flex-1 flex overflow-hidden relative">
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

        {showSettings ? (
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
              } w-full lg:w-80 xl:w-96 flex-shrink-0 border-r flex-col relative`}
              style={{ borderColor: 'var(--border)' }}
            >
              {/* Mobile menu button */}
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

            {/* Editor panel */}
            <div className={`${selectedNoteId ? 'flex' : 'hidden lg:flex'} flex-1 overflow-hidden`}>
              <NoteEditor
                note={selectedNote}
                folders={data.folders}
                onUpdate={data.updateNoteContent}
                onTogglePin={data.togglePin}
                onTrash={handleTrash}
                onMove={data.moveNote}
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
