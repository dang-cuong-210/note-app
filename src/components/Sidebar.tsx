import { useState, useEffect } from 'react';
import {
  FileText,
  Pin,
  Folder as FolderIcon,
  Tag as TagIcon,
  Trash2,
  Settings as SettingsIcon,
  Plus,
  ChevronRight,
  Archive,
  X,
  LogOut,
  MoreHorizontal,
  Search,
} from 'lucide-react';
import type { Folder, Note } from '@/types';
import type { ViewType } from '@/lib/navigation';
import { getAllTags } from '@/lib/utils';

interface SidebarProps {
  notes: Note[];
  folders: Folder[];
  currentView: ViewType;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onViewChange: (view: ViewType) => void;
  onAddFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onClose?: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export function Sidebar({
  notes,
  folders,
  currentView,
  searchQuery,
  onSearchChange,
  onViewChange,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onClose,
  userEmail,
  onSignOut,
}: SidebarProps) {
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);

  const activeNotes = notes.filter((n) => !n.trashed);
  const tags = getAllTags(activeNotes);
  const pinnedCount = activeNotes.filter((n) => n.pinned).length;
  const archivedCount = activeNotes.filter((n) => n.archived).length;
  const trashCount = notes.filter((n) => n.trashed).length;

  useEffect(() => {
    if (!folderMenuFor) return;
    const handler = () => setFolderMenuFor(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [folderMenuFor]);

  const handleAddFolder = () => {
    if (folderName.trim()) {
      onAddFolder(folderName);
      setFolderName('');
      setShowFolderInput(false);
    }
  };

  const handleDeleteFolder = (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"? Notes inside will be moved to All Notes.`)) {
      onDeleteFolder(id);
    }
    setFolderMenuFor(null);
  };

  const isActive = (view: ViewType): boolean => {
    return JSON.stringify(view) === JSON.stringify(currentView);
  };

  const navItem = (
    icon: React.ReactNode,
    label: string,
    view: ViewType,
    count?: number,
    active?: boolean
  ) => (
    <button
      key={typeof view === 'object' ? JSON.stringify(view) : view}
      onClick={() => {
        onViewChange(view);
        onClose?.();
        onClose?.();
      }}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
        active ? 'bg-accent-light text-accent' : 'text-secondary hover-bg'
      }`}
      style={active ? { backgroundColor: 'var(--accent-light)', color: 'var(--accent)' } : undefined}
    >
      <span className="flex-shrink-0" style={active ? { color: 'var(--accent)' } : undefined}>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-tertiary">{count}</span>
      )}
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-secondary" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <h1 className="text-lg font-bold text-app" style={{ color: 'var(--text)' }}>
          Noted
        </h1>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-secondary hover-text-app p-1 -mr-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="px-3 pb-3"><label htmlFor={onClose ? "mobile-sidebar-search" : "desktop-sidebar-search"} className="sr-only">Search notes</label><div className="relative"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} /><input id={onClose ? "mobile-sidebar-search" : "desktop-sidebar-search"} type="search" value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search" className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text)" }} /></div></div>
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="space-y-0.5">
          {navItem(<FileText size={18} />, 'All Notes', { kind: 'all' }, activeNotes.filter((n) => !n.archived).length, isActive({ kind: 'all' }))}
          {navItem(<Pin size={18} />, 'Pinned', { kind: 'pinned' }, pinnedCount, isActive({ kind: 'pinned' }))}
          {navItem(<Archive size={18} />, 'Archived', { kind: 'archived' }, archivedCount, isActive({ kind: 'archived' }))}
        </div>

        {/* Folders */}
        <div className="mt-5">
          <div className="flex items-center justify-between px-3 mb-1">
            <button
              onClick={() => setFoldersExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-tertiary uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <ChevronRight
                size={14}
                className="transition-transform"
                style={{ transform: foldersExpanded ? 'rotate(90deg)' : 'none' }}
              />
              Folders
            </button>
            <button
              onClick={() => setShowFolderInput(true)}
              className="text-tertiary hover-text-app p-0.5"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Plus size={15} />
            </button>
          </div>

          {foldersExpanded && (
            <div className="space-y-0.5">
              {showFolderInput && (
                <div className="px-3 py-1">
                  <input
                    autoFocus
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddFolder();
                      if (e.key === 'Escape') {
                        setShowFolderInput(false);
                        setFolderName('');
                      }
                    }}
                    onBlur={() => {
                      if (folderName.trim()) handleAddFolder();
                      else setShowFolderInput(false);
                    }}
                    placeholder="Folder name"
                    className="w-full text-sm bg-transparent border-b border-app pb-1 outline-none text-app"
                    style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
                  />
                </div>
              )}
              {folders.length === 0 && !showFolderInput && (
                <p className="px-3 py-1.5 text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
                  No folders yet
                </p>
              )}
              {folders.map((folder) => {
                const count = activeNotes.filter((n) => n.folderId === folder.id && !n.archived).length;
                const active = isActive({ kind: 'folder', id: folder.id });
                return (
                  <div key={folder.id} className="group relative">
                    {editingFolder === folder.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onRenameFolder(folder.id, editName);
                            setEditingFolder(null);
                          }
                          if (e.key === 'Escape') setEditingFolder(null);
                        }}
                        onBlur={() => {
                          if (editName.trim()) onRenameFolder(folder.id, editName);
                          setEditingFolder(null);
                        }}
                        className="w-full text-sm bg-transparent border-b border-app mx-3 py-2 outline-none text-app"
                        style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    ) : (
                      <div className="relative group/folder">
                        <button
                          onClick={() => {
                            onViewChange({ kind: 'folder', id: folder.id });
                            onClose?.();
                          }}
                          onDoubleClick={() => {
                            setEditingFolder(folder.id);
                            setEditName(folder.name);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                            active ? 'bg-accent-light' : 'hover-bg'
                          }`}
                          style={active ? { backgroundColor: 'var(--accent-light)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}
                        >
                          <FolderIcon size={16} style={active ? { color: 'var(--accent)' } : undefined} />
                          <span className="flex-1 truncate text-left">{folder.name}</span>
                          {count > 0 && <span className="text-xs text-tertiary">{count}</span>}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderMenuFor(folderMenuFor === folder.id ? null : folder.id);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/folder:opacity-100 transition-opacity"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {folderMenuFor === folder.id && (
                          <div
                            className="absolute right-0 top-8 z-50 w-36 rounded-lg shadow-xl border py-1 animate-scale-in"
                            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => { setEditingFolder(folder.id); setEditName(folder.name); setFolderMenuFor(null); }}
                              className="w-full px-3 py-2 text-sm text-left hover-bg rounded-lg mx-1"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => handleDeleteFolder(folder.id, folder.name)}
                              className="w-full px-3 py-2 text-sm text-left hover-bg rounded-lg mx-1"
                              style={{ color: 'var(--danger)' }}
                            >
                              Delete folder
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-5">
            <button
              onClick={() => setTagsExpanded((v) => !v)}
              className="flex items-center gap-1 px-3 mb-1 text-xs font-semibold text-tertiary uppercase tracking-wider w-full"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <ChevronRight
                size={14}
                className="transition-transform"
                style={{ transform: tagsExpanded ? 'rotate(90deg)' : 'none' }}
              />
              Tags
            </button>
            {tagsExpanded && (
              <div className="space-y-0.5">
                {tags.map((tag) => {
                  const active = isActive({ kind: 'tag', name: tag.name });
                  return (
                    <button
                      key={tag.name}
                      onClick={() => {
                        onViewChange({ kind: 'tag', name: tag.name });
                        onClose?.();
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                        active ? 'bg-accent-light' : 'hover-bg'
                      }`}
                      style={active ? { backgroundColor: 'var(--accent-light)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}
                    >
                      <TagIcon size={16} style={active ? { color: 'var(--accent)' } : undefined} />
                      <span className="flex-1 truncate text-left">#{tag.name}</span>
                      <span className="text-xs text-tertiary">{tag.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Trash + Settings */}
        <div className="mt-5 space-y-0.5">
          {navItem(<Trash2 size={18} />, 'Recently Deleted', { kind: 'trash' }, trashCount, isActive({ kind: 'trash' }))}
          {navItem(<SettingsIcon size={18} />, 'Settings', { kind: 'settings' }, undefined, isActive({ kind: 'settings' }))}
        </div>
      </nav>

      {/* User account footer */}
      {userEmail && onSignOut && (
        <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs truncate flex-1" style={{ color: 'var(--text-tertiary)' }}>
              {userEmail}
            </span>
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg hover-bg flex-shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
