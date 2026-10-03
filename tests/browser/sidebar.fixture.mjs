import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../../src/components/Sidebar';
import '../../src/index.css';

window.sidebarCalls = { renames: [], deletes: [], navigation: [] };
function Harness() {
  const [folders, setFolders] = React.useState([
    { id: 'inbox', name: 'Inbox', parentId: null, createdAt: 1 },
    { id: 'other', name: 'Other', parentId: null, createdAt: 1 },
  ]);
  return React.createElement(React.Fragment, null,
    React.createElement('div', { style: { width: 260, height: 650 } }, React.createElement(Sidebar, {
      notes: [], folders, currentView: { kind: 'all' }, searchQuery: '',
      onSearchChange() {}, onAddFolder() {},
      onViewChange(view) { window.sidebarCalls.navigation.push(view); },
      onRenameFolder(id, name) {
        window.sidebarCalls.renames.push({ id, name });
        setFolders((rows) => rows.map((f) => f.id === id ? { ...f, name } : f));
      },
      onDeleteFolder(id) { window.sidebarCalls.deletes.push(id); },
    })),
    React.createElement('button', { id: 'outside', style: { position: 'fixed', bottom: 20, right: 20 } }, 'Outside'));
}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
