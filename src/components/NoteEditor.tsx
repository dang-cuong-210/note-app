import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  ChevronDown,
  ArrowLeft,
  Pin,
  PinOff,
  Trash2,
  MoreHorizontal,
  ToggleRight,
} from 'lucide-react';
import type { Note, Folder } from '@/types';
import { formatTime } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';

interface NoteEditorProps {
  note: Note | null;
  folders: Folder[];
  onUpdate: (id: string, title: string, content: string) => void;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onBack: () => void;
}

export function NoteEditor({
  note,
  folders,
  onUpdate,
  onTogglePin,
  onTrash,
  onMove,
  onBack,
}: NoteEditorProps) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [saved, setSaved] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load note into editor
  useEffect(() => {
    if (note && editorRef.current) {
      if (editorRef.current.innerHTML !== note.content) {
        editorRef.current.innerHTML = note.content;
      }
    }
    if (note && titleRef.current) {
      titleRef.current.value = note.title;
      autoResize(titleRef.current);
    }
    setSaved(true);
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize title
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  // Detect selection in editor to show/hide toolbar
  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current) {
      const range = sel.getRangeAt(0);
      if (!range.collapsed && editorRef.current.contains(range.commonAncestorContainer)) {
        setShowToolbar(true);
        return;
      }
    }
    setShowToolbar(false);
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', checkSelection);
    return () => document.removeEventListener('selectionchange', checkSelection);
  }, [checkSelection]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowMoveMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const triggerSave = useCallback(
    (title: string, content: string) => {
      if (!note) return;
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onUpdate(note.id, title, content);
        setSaved(true);
      }, 600);
    },
    [note, onUpdate]
  );

  const handleInput = () => {
    if (!note || !editorRef.current || !titleRef.current) return;
    // Highlight tags
    highlightTags(editorRef.current);
    triggerSave(titleRef.current.value, editorRef.current.innerHTML);
  };

  const handleTitleInput = () => {
    if (!titleRef.current || !note) return;
    autoResize(titleRef.current);
    triggerSave(titleRef.current.value, editorRef.current?.innerHTML || '');
  };

  // ===== Format commands =====
  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const formatBlock = (tag: string) => {
    document.execCommand('formatBlock', false, tag);
    editorRef.current?.focus();
    handleInput();
  };

  const insertLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      exec('createLink', url);
      // Make links open in new tab
      const sel = window.getSelection();
      if (sel && sel.anchorNode) {
        const anchor = sel.anchorNode.parentElement;
        if (anchor && anchor.tagName === 'A') {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }
  };

  const insertImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('Image too large (max 2MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      document.execCommand('insertImage', false, dataUrl);
      handleInput();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertChecklist = () => {
    document.execCommand('insertUnorderedList', false);
    // Mark the list as checklist
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      let el: Node | null = sel.anchorNode;
      while (el && el.nodeType !== 1) el = el.parentNode;
      if (el) {
        const ul = (el as Element).closest('ul');
        if (ul) ul.setAttribute('data-checklist', 'true');
      }
    }
    editorRef.current?.focus();
    handleInput();
  };

  const insertTable = () => {
    const rows = 2;
    const cols = 2;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.textContent = c === 0 ? 'Column' : '';
      th.setAttribute('contenteditable', 'true');
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        td.textContent = '';
        td.setAttribute('contenteditable', 'true');
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    document.execCommand('insertHTML', false, table.outerHTML + '<p><br></p>');
    editorRef.current?.focus();
    handleInput();
  };

  const insertToggle = () => {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Toggle title';
    const div = document.createElement('div');
    div.innerHTML = '<p>Hidden content...</p>';
    details.appendChild(summary);
    details.appendChild(div);
    document.execCommand('insertHTML', false, details.outerHTML + '<p><br></p>');
    editorRef.current?.focus();
    handleInput();
  };

  // Handle clicks in editor (checklist toggles, tag clicks)
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Checklist toggle
    if (target.tagName === 'LI') {
      const ul = target.closest('ul[data-checklist]');
      if (ul) {
        const isChecked = target.getAttribute('data-checked') === 'true';
        target.setAttribute('data-checked', isChecked ? 'false' : 'true');
        handleInput();
      }
    }
  };

  // Handle Enter key in title to focus editor
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      // Move cursor to start
      const sel = window.getSelection();
      const range = document.createRange();
      if (editor.firstChild) {
        range.setStart(editor, 0);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } else {
        editor.focus();
      }
    }
  };

  // Handle Tab key in editor for indentation
  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      exec('indent');
    }
  };

  if (!note) {
    return (
      <div className="h-full flex items-center justify-center bg-app" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center px-8">
          <p className="text-secondary text-sm" style={{ color: 'var(--text-secondary)' }}>
            Select a note to start reading
          </p>
        </div>
      </div>
    );
  }

  const folderName = folders.find((f) => f.id === note.folderId)?.name;

  return (
    <div className="h-full flex flex-col bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Hidden file input for images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-app" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            className="lg:hidden p-2 rounded-lg hover-bg text-secondary"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-tertiary px-2" style={{ color: 'var(--text-tertiary)' }}>
            {folderName && (
              <span className="flex items-center gap-1">
                {folderName}
                <span>·</span>
              </span>
            )}
            <span>{saved ? 'Saved' : 'Saving…'}</span>
            <span>·</span>
            <span>{formatTime(note.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="sm:hidden text-xs text-tertiary mr-1" style={{ color: 'var(--text-tertiary)' }}>
            {saved ? '' : 'Saving…'}
          </span>
          <button
            onClick={() => onTogglePin(note.id)}
            className="p-2 rounded-lg hover-bg text-secondary"
            style={{ color: note.pinned ? 'var(--accent)' : 'var(--text-secondary)' }}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            {note.pinned ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
          <div className="relative" ref={showMenu ? menuRef : undefined}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-2 rounded-lg hover-bg text-secondary"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MoreHorizontal size={20} />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-10 z-50 w-48 rounded-xl shadow-xl border border-app py-1 animate-scale-in"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
              >
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 hover-bg text-left"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => { setShowMoveMenu(!showMoveMenu); }}
                >
                  <ChevronDown size={15} />
                  Move to folder
                  {showMoveMenu && (
                    <div
                      className="absolute left-full top-0 ml-1 w-44 rounded-xl shadow-xl border border-app py-1 animate-scale-in"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                    >
                      <button className="w-full px-3 py-2 text-sm hover-bg text-left rounded-lg mx-1" style={{ color: 'var(--text-secondary)' }} onClick={() => { onMove(note.id, null); setShowMenu(false); setShowMoveMenu(false); }}>
                        No folder
                      </button>
                      {folders.map((f) => (
                        <button key={f.id} className="w-full px-3 py-2 text-sm hover-bg text-left rounded-lg mx-1" style={{ color: 'var(--text-secondary)' }} onClick={() => { onMove(note.id, f.id); setShowMenu(false); setShowMoveMenu(false); }}>
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </button>
                <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 hover-bg text-left"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => { onTrash(note.id); setShowMenu(false); }}
                >
                  <Trash2 size={15} />
                  Move to trash
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-app overflow-x-auto animate-fade-in" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <ToolbarBtn icon={<Bold size={16} />} onClick={() => exec('bold')} />
          <ToolbarBtn icon={<Italic size={16} />} onClick={() => exec('italic')} />
          <ToolbarBtn icon={<Underline size={16} />} onClick={() => exec('underline')} />
          <ToolbarBtn icon={<Strikethrough size={16} />} onClick={() => exec('strikeThrough')} />
          <Divider />
          <ToolbarBtn icon={<Heading1 size={16} />} onClick={() => formatBlock('<h1>')} />
          <ToolbarBtn icon={<Heading2 size={16} />} onClick={() => formatBlock('<h2>')} />
          <ToolbarBtn icon={<Heading3 size={16} />} onClick={() => formatBlock('<h3>')} />
          <Divider />
          <ToolbarBtn icon={<List size={16} />} onClick={() => exec('insertUnorderedList')} />
          <ToolbarBtn icon={<ListOrdered size={16} />} onClick={() => exec('insertOrderedList')} />
          <ToolbarBtn icon={<CheckSquare size={16} />} onClick={insertChecklist} />
          <Divider />
          <ToolbarBtn icon={<Quote size={16} />} onClick={() => formatBlock('<blockquote>')} />
          <ToolbarBtn icon={<Code size={16} />} onClick={() => formatBlock('<pre>')} />
          <ToolbarBtn icon={<ToggleRight size={16} />} onClick={insertToggle} />
          <Divider />
          <ToolbarBtn icon={<LinkIcon size={16} />} onClick={insertLink} />
          <ToolbarBtn icon={<ImageIcon size={16} />} onClick={insertImage} />
          <ToolbarBtn icon={<TableIcon size={16} />} onClick={insertTable} />
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 sm:px-8 sm:py-8">
          <textarea
            ref={titleRef}
            onInput={handleTitleInput}
            onKeyDown={handleTitleKeyDown}
            placeholder="Title"
            rows={1}
            className="w-full text-2xl sm:text-3xl font-bold bg-transparent outline-none resize-none text-app placeholder:text-tertiary mb-3 leading-tight"
            style={{ color: 'var(--text)' }}
          />
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onClick={handleEditorClick}
            onKeyDown={handleEditorKeyDown}
            data-placeholder="Start writing…"
            className="editor-content text-app"
            style={{ color: 'var(--text)' }}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg hover-bg text-secondary flex-shrink-0"
      style={{ color: 'var(--text-secondary)' }}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 mx-1 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />;
}

// Highlight #tags in editor content
function highlightTags(editor: HTMLElement) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent && /#[\p{L}\p{N}_]+/u.test(node.textContent)) {
      // Skip if parent is already a tag-link or inside a link/pre
      const parent = node.parentElement;
      if (parent && (parent.classList.contains('tag-link') || parent.tagName === 'A' || parent.tagName === 'PRE' || parent.tagName === 'CODE')) {
        continue;
      }
      textNodes.push(node as Text);
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent!;
    const regex = /#[\p{L}\p{N}_]+/gu;
    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      if (match.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
      }
      const span = document.createElement('span');
      span.className = 'tag-link';
      span.textContent = match[0];
      frag.appendChild(span);
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    if (frag.childNodes.length > 0) {
      textNode.parentNode?.replaceChild(frag, textNode);
    }
  }
}
