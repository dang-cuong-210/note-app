import React from 'react';
import { createRoot } from 'react-dom/client';
import { useAppData } from '../../src/hooks/useAppData';
import { NoteEditor } from '../../src/components/NoteEditor';
import { ToastContext } from '../../src/contexts/ToastContext';
import { channels, calls, tables } from './supabase.mock.mjs';
import * as cache from '../../src/lib/db';

const noop = () => {};
window.testHarness = { channels, calls, tables, cache };
function Harness() {
  const data = useAppData('account-a');
  window.testHarness.data = data;
  return React.createElement(ToastContext.Provider, { value: { toast: noop, dismiss: noop } },
    React.createElement(NoteEditor, {
      note: data.notes[0] ?? null, folders: data.folders,
      attachments: data.getAttachmentsForNote('note-1'),
      onUpdate: noop, onTogglePin: noop, onTrash: noop, onMove: noop, onArchive: noop,
      onAddAttachment: async () => null, onRemoveAttachment: async () => {},
      onRenameAttachment: async () => false, onBack: noop,
    }));
}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
