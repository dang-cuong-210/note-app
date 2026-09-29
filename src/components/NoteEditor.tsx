import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pin,
  PinOff,
  Trash2,
  Folder as FolderIcon,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  X,
  Download,
  FileText,
  FileSpreadsheet,
  FileChartColumn,
  FileArchive,
  FileCode,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Move,
  Maximize2,
  Copy,
  ArrowUp,
  ArrowDown,
  Edit3,
} from 'lucide-react';
import type { Note, Folder, Attachment } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { isAcceptedImageType, uploadNoteImage, deleteNoteImage } from '@/lib/images';
import { formatFileSize, getFileIcon, refreshAttachmentUrl } from '@/lib/attachments';

// Attachment display settings travel inside note HTML, so no database migration is needed.
// The marker is a comment, never a visible or editable element.
type AttachmentLayout = { order: string[]; widths: Record<string, number> };
type EditorDragKind = 'image' | 'inline-attachment';
type DropBoundary = {
  parent: Node;
  before: Node | null;
  y: number;
  left: number;
  right: number;
  target: HTMLElement | null;
};
type EditorDragSession = {
  pointerId: number;
  pointerType: string;
  kind: EditorDragKind;
  source: HTMLElement;
  surface: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  moved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  ghost: HTMLElement | null;
  indicator: HTMLElement | null;
  boundary: DropBoundary | null;
  highlighted: HTMLElement | null;
  frame: number | null;
};
const LAYOUT_MARKER = /<!--NOTED_ATTACHMENT_LAYOUT:([^>]*)-->/g;
const EMPTY_LAYOUT: AttachmentLayout = { order: [], widths: {} };
function readLayout(html: string): AttachmentLayout {
  const match = [...html.matchAll(LAYOUT_MARKER)][0];
  if (!match) return EMPTY_LAYOUT;
  try {
    const value = JSON.parse(decodeURIComponent(match[1]));
    return {
      order: Array.isArray(value.order) ? value.order.filter((v: unknown) => typeof v === 'string') : [],
      widths: value.widths && typeof value.widths === 'object' ? value.widths : {},
    };
  } catch { return EMPTY_LAYOUT; }
}
function stripLayout(html: string): string { return html.replace(LAYOUT_MARKER, ''); }
function withLayout(html: string, layout: AttachmentLayout): string {
  if (!layout.order.length && !Object.keys(layout.widths).length) return stripLayout(html);
  return stripLayout(html) + `<!--NOTED_ATTACHMENT_LAYOUT:${encodeURIComponent(JSON.stringify(layout))}-->`;
}

interface NoteEditorProps {
  note: Note | null;
  folders: Folder[];
  attachments: Attachment[];
  onUpdate: (id: string, title: string, content: string) => void;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onArchive: (id: string, archived: boolean) => void;
  onAddAttachment: (noteId: string, file: File) => Promise<Attachment | null>;
  onRemoveAttachment: (id: string) => Promise<void>;
  onRenameAttachment: (id: string, name: string) => Promise<boolean>;
  onBack: () => void;
}

export function NoteEditor({
  note,
  folders,
  attachments,
  onUpdate,
  onTogglePin,
  onTrash,
  onMove,
  onArchive,
  onAddAttachment,
  onRemoveAttachment,
  onRenameAttachment,
  onBack,
}: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [syncConflict, setSyncConflict] = useState<Note | null>(null);
  const conflictRef = useRef(false);
  const acceptedRef = useRef<{ id: string; title: string; content: string } | null>(null);
  const displayedNoteId = useRef<string | null>(null);
  const [content, setContent] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageFrame, setImageFrame] = useState<DOMRect | null>(null);
  const [freeResize, setFreeResize] = useState(false);
  const [moveImageMode, setMoveImageMode] = useState(false);
  const imagePointers = useRef(new Map<number, { x: number; y: number }>());
  const imageGesture = useRef<{ mode: 'drag' | 'resize' | 'pinch'; x: number; y: number; w: number; h: number; distance?: number; dx?: number; dy?: number; target?: HTMLImageElement } | null>(null);
  const [attachmentLayout, setAttachmentLayout] = useState<AttachmentLayout>(EMPTY_LAYOUT);
  const layoutRef = useRef<AttachmentLayout>(EMPTY_LAYOUT);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [selectedInlineAttachment, setSelectedInlineAttachment] = useState<HTMLElement | null>(null);
  const [inlineFrame, setInlineFrame] = useState<DOMRect | null>(null);
  const lastCaretRange = useRef<Range | null>(null);
  const inlineDrag = useRef<{ element: HTMLElement; x: number; y: number; moved: boolean } | null>(null);
  const editorDrag = useRef<EditorDragSession | null>(null);
  const suppressMediaClick = useRef<{ source: HTMLElement; until: number } | null>(null);
  const attachmentLongPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentPressStart = useRef<{x: number; y: number} | null>(null);
  const attachmentGesture = useRef<{ id: string; y: number; x: number; width: number; mode: 'drag' | 'resize' } | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  const viewerTouchDistance = useRef<number | null>(null);
  const viewerStartScale = useRef(1);
  const uploading = uploadsInProgress > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const activeNoteId = useRef<string | undefined>(note?.id);
  activeNoteId.current = note?.id;
  const { toast } = useToast();

  // Reconcile remote updates without resetting the caret or overwriting unsaved typing.
  // This prevents a second device's changes from silently replacing local edits.
  useEffect(() => {
    if (!note) return;
    if (displayedNoteId.current !== note.id) cancelEditorDrag();
    const idChanged = displayedNoteId.current !== note.id;
    const baseline = acceptedRef.current;
    const localMatchesIncoming = titleRef.current === note.title && contentRef.current === note.content;
    const remoteContentChanged = !baseline || baseline.title !== note.title || baseline.content !== note.content;
    const localDirty = !!baseline && (titleRef.current !== baseline.title || contentRef.current !== baseline.content);
    if (idChanged && baseline?.id === displayedNoteId.current && !conflictRef.current &&
        (titleRef.current !== baseline.title || contentRef.current !== baseline.content)) {
      // Finish local edits on the previous note before changing editors.
      onUpdate(baseline.id, titleRef.current, contentRef.current);
    }
    if (!idChanged && !remoteContentChanged) return;
    if (!idChanged && localMatchesIncoming) {
      // Our optimistic save has reached app state (possibly via Realtime).
      acceptedRef.current = { id: note.id, title: note.title, content: note.content };
      return;
    }
    if (!idChanged && localDirty && remoteContentChanged) {
      conflictRef.current = true;
      setSyncConflict(note);
      return;
    }
    displayedNoteId.current = note.id;
    acceptedRef.current = { id: note.id, title: note.title, content: note.content };
    conflictRef.current = false;
    setSyncConflict(null);
    setTitle(note.title);
    setContent(note.content);
    titleRef.current = note.title;
    contentRef.current = note.content;
    if (editorRef.current) editorRef.current.innerHTML = stripLayout(note.content ?? '');
    const layout = readLayout(note.content);
    layoutRef.current = layout;
    setAttachmentLayout(layout);
    setSelectedImage(null);
    setSelectedAttachmentId(null);
    setSelectedInlineAttachment(null);
    setInlineFrame(null);
    lastCaretRange.current = null;
  }, [note?.id, note?.title, note?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  titleRef.current = title;
  contentRef.current = content;

  useEffect(() => {
    if (!note || conflictRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!conflictRef.current && (titleRef.current !== note.title || contentRef.current !== note.content)) {
        onUpdate(note.id, titleRef.current, contentRef.current);
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps


  // Flush the current note's unsaved changes when the editor unmounts.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const baseline = acceptedRef.current;
    if (baseline?.id === displayedNoteId.current && !conflictRef.current &&
        (titleRef.current !== baseline.title || contentRef.current !== baseline.content)) {
      onUpdate(baseline.id, titleRef.current, contentRef.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close menu on outside click/touch
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);

  const refreshImageFrame = useCallback((img: HTMLImageElement | null = selectedImage) => {
    if (img?.isConnected) setImageFrame(img.getBoundingClientRect());
    else setImageFrame(null);
  }, [selectedImage]);

  useEffect(() => {
    if (!selectedImage) return;
    const refresh = () => refreshImageFrame(selectedImage);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    refresh();
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [selectedImage, refreshImageFrame]);

  useEffect(() => () => {
    cancelEditorDrag();
    if (attachmentLongPress.current) clearTimeout(attachmentLongPress.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // No rerender of the contentEditable DOM: this preserves the typing caret.
  const commitEditor = (layout = layoutRef.current) => {
    if (!editorRef.current) return;
    const html = withLayout(editorRef.current.innerHTML, layout);
    contentRef.current = html;
    setContent(html);
  };
  const commitLayout = (next: AttachmentLayout) => {
    layoutRef.current = next;
    setAttachmentLayout(next);
    commitEditor(next);
  };
  // An attachment is a non-editable inline node in note HTML, not a file URL.
  // Its ID refers to the existing Supabase attachment row; dragging never moves file bytes.
  const embeddedIds = new Set(Array.from(content.matchAll(/data-noted-attachment-id=["']([^"']+)["']/g), match => match[1]));
  const attachmentSelector = '[data-noted-attachment-id]';

  const makeAttachmentNode = (att: Attachment): HTMLSpanElement => {
    const node = document.createElement('span');
    node.className = 'noted-inline-attachment';
    node.contentEditable = 'false';
    node.dataset.notedAttachmentId = att.id;
    node.style.width = `${layoutRef.current.widths[att.id] || 100}%`;
    node.style.maxWidth = '100%';
    const glyph = document.createElement('span');
    glyph.className = 'noted-inline-attachment-icon';
    glyph.textContent = '📎';
    const detail = document.createElement('span');
    detail.className = 'noted-inline-attachment-detail';
    const name = document.createElement('span');
    name.className = 'noted-inline-attachment-name';
    name.textContent = att.name;
    const size = document.createElement('span');
    size.className = 'noted-inline-attachment-size';
    size.textContent = formatFileSize(att.size);
    detail.append(name, size);
    node.append(glyph, detail);
    node.setAttribute('aria-label', `Attachment: ${att.name}`);
    node.title = 'Tap to open · Long press to move or resize';
    return node;
  };

  // Remember a real editing selection before opening the native file picker.
  const rememberCaret = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    if (!range.startContainer.parentElement?.closest(attachmentSelector)) lastCaretRange.current = range.cloneRange();
  };

  const insertAttachmentAtCaret = (att: Attachment) => {
    const editor = editorRef.current;
    if (!editor) return;
    const node = makeAttachmentNode(att);
    const range = lastCaretRange.current?.cloneRange();
    if (range && editor.contains(range.startContainer) && !range.startContainer.parentElement?.closest(attachmentSelector)) {
      range.collapse(true);
      range.insertNode(node);
    } else {
      editor.append(node);
    }
    // A br after the atomic node lets the user continue typing below it.
    const br = document.createElement('br');
    node.after(br);
    const after = document.createRange();
    after.setStartAfter(br);
    after.collapse(true);
    lastCaretRange.current = after.cloneRange();
    commitEditor();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(after);
    setSelectedAttachmentId(null);
    setSelectedInlineAttachment(node);
    setInlineFrame(node.getBoundingClientRect());
  };

  const selectInlineAttachment = (node: HTMLElement) => {
    setSelectedImage(null);
    setSelectedAttachmentId(null);
    setSelectedInlineAttachment(node);
    setInlineFrame(node.getBoundingClientRect());
  };

  const unlinkInlineAttachment = (node: HTMLElement) => {
    // Unlink is non-destructive: the file returns to the attachment tray.
    node.remove();
    setSelectedInlineAttachment(null);
    setInlineFrame(null);
    commitEditor();
  };

  const clearEditorDragVisuals = (session: EditorDragSession) => {
    if (session.timer) clearTimeout(session.timer);
    if (session.frame != null) cancelAnimationFrame(session.frame);
    session.ghost?.remove();
    session.indicator?.remove();
    session.source.classList.remove('noted-dragging-source');
    session.highlighted?.classList.remove('noted-active-drop-target');
    editorRef.current?.classList.remove('noted-active-drop-target');
    try {
      if (session.surface.hasPointerCapture(session.pointerId)) session.surface.releasePointerCapture(session.pointerId);
    } catch { /* the browser may already have cancelled the pointer */ }
  };

  const cancelEditorDrag = () => {
    const session = editorDrag.current;
    if (!session) return;
    clearEditorDragVisuals(session);
    editorDrag.current = null;
  };

  const nodeRect = (node: Node): DOMRect | null => {
    if (node instanceof Element) {
      const rect = node.getBoundingClientRect();
      return rect.height || rect.width ? rect : null;
    }
    const range = document.createRange();
    range.selectNode(node);
    const rect = range.getBoundingClientRect();
    return rect.height || rect.width ? rect : null;
  };

  // Prefer stable DOM boundaries over a precise text caret. This makes the whole
  // gap above/below paragraphs, line breaks, images and file cards a drop target.
  const findNearestDropBoundary = (source: HTMLElement, x: number, y: number): DropBoundary | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const candidates: DropBoundary[] = [];
    const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    const addNode = (node: Node, target: HTMLElement | null) => {
      if (node === source || (node instanceof Element && node.contains(source))) return;
      const rect = nodeRect(node);
      if (!rect) return;
      const parent = node.parentNode;
      if (!parent || !editor.contains(parent) && parent !== editor) return;
      candidates.push({ parent, before: node, y: rect.top, left: rect.left, right: rect.right, target });
      candidates.push({ parent, before: node.nextSibling, y: rect.bottom, left: rect.left, right: rect.right, target });
    };
    const visit = (parent: Node) => {
      parent.childNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          if (node.matches(`img, ${attachmentSelector}`)) {
            addNode(node, node);
            return;
          }
          if (node.tagName === 'BR') {
            addNode(node, node.parentElement);
            return;
          }
          if (blockTags.has(node.tagName)) addNode(node, node);
          // Atomic media and BR-separated runs inside a block are also useful targets.
          visit(node);
        } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          addNode(node, node.parentElement);
        }
      });
    };
    visit(editor);
    if (!candidates.length) return null;
    return candidates.reduce((best, candidate) => {
      const vertical = Math.abs(candidate.y - y);
      const horizontal = x < candidate.left ? candidate.left - x : x > candidate.right ? x - candidate.right : 0;
      const score = vertical + horizontal * 0.12;
      const bestVertical = Math.abs(best.y - y);
      const bestHorizontal = x < best.left ? best.left - x : x > best.right ? x - best.right : 0;
      return score < bestVertical + bestHorizontal * 0.12 ? candidate : best;
    });
  };

  const caretFallbackBoundary = (source: HTMLElement, x: number, y: number): DropBoundary | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range = doc.caretRangeFromPoint?.(x, y) || null;
    if (!range) {
      const pos = doc.caretPositionFromPoint?.(x, y);
      if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
    }
    if (!range || !editor.contains(range.startContainer) || source.contains(range.startContainer)) return null;
    const containerElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const atomic = containerElement?.closest<HTMLElement>(`img, ${attachmentSelector}`);
    if (atomic && atomic !== source && editor.contains(atomic)) {
      const rect = atomic.getBoundingClientRect();
      return {
        parent: atomic.parentNode || editor,
        before: y < rect.top + rect.height / 2 ? atomic : atomic.nextSibling,
        y: y < rect.top + rect.height / 2 ? rect.top : rect.bottom,
        left: rect.left,
        right: rect.right,
        target: atomic,
      };
    }
    const rangeContainer = range.startContainer;
    if (rangeContainer instanceof HTMLImageElement || rangeContainer instanceof HTMLElement && rangeContainer.closest(attachmentSelector)) return null;
    let parent: Node = rangeContainer;
    let before: Node | null = rangeContainer.childNodes[range.startOffset] || null;
    if (rangeContainer.nodeType === Node.TEXT_NODE) {
      const textRect = nodeRect(rangeContainer);
      parent = rangeContainer.parentNode || editor;
      before = textRect && x < textRect.left + textRect.width / 2 ? rangeContainer : rangeContainer.nextSibling;
    }
    return { parent, before, y, left: editor.getBoundingClientRect().left, right: editor.getBoundingClientRect().right, target: containerElement instanceof HTMLElement ? containerElement : null };
  };

  const renderEditorDragFrame = () => {
    const session = editorDrag.current;
    if (!session?.active) return;
    session.frame = null;
    session.ghost!.style.transform = `translate3d(${Math.round(session.x + 12)}px, ${Math.round(session.y + 12)}px, 0)`;

    const scroller = editorScrollRef.current;
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const edge = 60;
      const topDistance = session.y - Math.max(0, rect.top);
      const bottomDistance = Math.min(window.innerHeight, rect.bottom) - session.y;
      let speed = 0;
      if (topDistance >= 0 && topDistance < edge) speed = -Math.ceil((1 - topDistance / edge) * 18);
      else if (bottomDistance >= 0 && bottomDistance < edge) speed = Math.ceil((1 - bottomDistance / edge) * 18);
      if (speed) scroller.scrollTop += speed;
    }

    const boundary = findNearestDropBoundary(session.source, session.x, session.y) || caretFallbackBoundary(session.source, session.x, session.y);
    session.boundary = boundary;
    if (session.highlighted !== boundary?.target) {
      session.highlighted?.classList.remove('noted-active-drop-target');
      session.highlighted = boundary?.target || editorRef.current;
      session.highlighted?.classList.add('noted-active-drop-target');
    }
    if (boundary && session.indicator) {
      const editorRect = editorRef.current?.getBoundingClientRect();
      const left = Math.max(editorRect?.left || 0, boundary.left || 0) + 2;
      const right = Math.min(editorRect?.right || window.innerWidth, boundary.right || window.innerWidth) - 2;
      session.indicator.style.display = 'block';
      session.indicator.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(boundary.y)}px, 0)`;
      session.indicator.style.width = `${Math.max(32, right - left)}px`;
    } else if (session.indicator) session.indicator.style.display = 'none';

    const rect = scroller?.getBoundingClientRect();
    if (rect && (session.y - Math.max(0, rect.top) < 60 || Math.min(window.innerHeight, rect.bottom) - session.y < 60)) {
      session.frame = requestAnimationFrame(renderEditorDragFrame);
    }
  };

  const activateEditorDrag = (session: EditorDragSession) => {
    if (editorDrag.current !== session || session.active || !session.source.isConnected) return;
    session.active = true;
    session.timer = null;
    if (session.kind === 'image') { selectImage(session.source as HTMLImageElement); setMoveImageMode(true); }
    else selectInlineAttachment(session.source);
    const rect = session.source.getBoundingClientRect();
    const ghost = session.source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.contentEditable = 'false';
    ghost.className = `noted-drag-ghost noted-drag-ghost-${session.kind}`;
    ghost.style.width = `${Math.min(rect.width, 280)}px`;
    if (rect.width > 0) ghost.style.height = `${Math.min(rect.height, 280 * rect.height / rect.width)}px`;
    const indicator = document.createElement('div');
    indicator.className = 'noted-drop-indicator';
    document.body.append(ghost, indicator);
    session.ghost = ghost;
    session.indicator = indicator;
    session.source.classList.add('noted-dragging-source');
    editorRef.current?.classList.add('noted-active-drop-target');
    try { session.surface.setPointerCapture(session.pointerId); } catch { /* pointer may have been cancelled */ }
    navigator.vibrate?.(12);
    session.frame = requestAnimationFrame(renderEditorDragFrame);
  };

  const armEditorDrag = (e: React.PointerEvent<HTMLDivElement>, source: HTMLElement, kind: EditorDragKind) => {
    cancelEditorDrag();
    const session: EditorDragSession = {
      pointerId: e.pointerId, pointerType: e.pointerType, kind, source, surface: e.currentTarget,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      active: false, moved: false, timer: null, ghost: null, indicator: null,
      boundary: null, highlighted: null, frame: null,
    };
    editorDrag.current = session;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      session.timer = setTimeout(() => activateEditorDrag(session), 340);
    }
  };

  const updateEditorDrag = (e: React.PointerEvent<HTMLDivElement>): boolean => {
    const session = editorDrag.current;
    if (!session || session.pointerId !== e.pointerId) return false;
    session.x = e.clientX;
    session.y = e.clientY;
    const distance = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
    if (!session.active) {
      if (session.pointerType === 'mouse' && distance >= 4) activateEditorDrag(session);
      else if (distance > 10) { cancelEditorDrag(); return false; }
    }
    if (session.active) {
      session.moved ||= distance >= 4;
      e.preventDefault();
      if (session.frame == null) session.frame = requestAnimationFrame(renderEditorDragFrame);
    }
    return true;
  };

  const finishEditorDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled = false): boolean => {
    const session = editorDrag.current;
    if (!session || session.pointerId !== e.pointerId) return false;
    const handled = session.active;
    const boundary = session.boundary;
    const source = session.source;
    const moved = session.moved;
    if (session.active) suppressMediaClick.current = { source, until: performance.now() + 500 };
    clearEditorDragVisuals(session);
    editorDrag.current = null;
    if (!cancelled && moved && boundary && !source.contains(boundary.parent)) {
      const oldParent = source.parentNode;
      const oldNext = source.nextSibling;
      const noOp = boundary.parent === oldParent && (boundary.before === source || boundary.before === oldNext);
      if (!noOp) {
        boundary.parent.insertBefore(source, boundary.before);
        commitEditor();
      }
    }
    if (source instanceof HTMLImageElement) refreshImageFrame(source);
    else if (source.isConnected) setInlineFrame(source.getBoundingClientRect());
    return handled;
  };

  const resizeInlineAttachment = (node: HTMLElement, width: number) => {
    const bounded = Math.max(40, Math.min(100, Math.round(width)));
    node.style.width = `${bounded}%`;
    setInlineFrame(node.getBoundingClientRect());
    commitEditor();
  };

  const inlineAttachmentById = (id: string) => attachments.find(att => att.id === id);

  // Keep names/sizes in old embedded notes up to date after Supabase loads/renames.
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.querySelectorAll<HTMLElement>(attachmentSelector).forEach(node => {
      const att = attachments.find(item => item.id === node.dataset.notedAttachmentId);
      if (!att) {
        node.classList.add('noted-attachment-missing');
        node.title = 'File unavailable';
        return;
      }
      node.classList.remove('noted-attachment-missing');
      const name = node.querySelector<HTMLElement>('.noted-inline-attachment-name');
      if (name) name.textContent = att.name;
      const size = node.querySelector<HTMLElement>('.noted-inline-attachment-size');
      if (size) size.textContent = formatFileSize(att.size);
      node.setAttribute('aria-label', `Attachment: ${att.name}`);
    });
  }, [attachments, note?.id]);

  useEffect(() => {
    if (!selectedInlineAttachment) return;
    const refresh = () => {
      if (selectedInlineAttachment.isConnected) setInlineFrame(selectedInlineAttachment.getBoundingClientRect());
      else { setSelectedInlineAttachment(null); setInlineFrame(null); }
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    refresh();
    return () => { window.removeEventListener('resize', refresh); window.removeEventListener('scroll', refresh, true); };
  }, [selectedInlineAttachment]);

  const onInlinePointerDown = (e: React.PointerEvent<HTMLDivElement>): boolean => {
    const node = (e.target as HTMLElement).closest<HTMLElement>(attachmentSelector);
    if (!node || !editorRef.current?.contains(node)) return false;
    if (e.pointerType === 'mouse' && selectedInlineAttachment !== node) {
      suppressMediaClick.current = { source: node, until: performance.now() + 500 };
      selectInlineAttachment(node);
      return true;
    }
    armEditorDrag(e, node, 'inline-attachment');
    return true;
  };
  const onInlinePointerMove = (e: React.PointerEvent<HTMLDivElement>): boolean => {
    return editorDrag.current?.kind === 'inline-attachment' ? updateEditorDrag(e) : false;
  };
  const onInlinePointerEnd = (e: React.PointerEvent<HTMLDivElement>, cancelled = false): boolean => {
    return editorDrag.current?.kind === 'inline-attachment' ? finishEditorDrag(e, cancelled) : false;
  };

  const selectImage = (img: HTMLImageElement) => {
    setSelectedAttachmentId(null);
    setSelectedInlineAttachment(null);
    setSelectedImage(img);
    setImageFrame(img.getBoundingClientRect());
  };
  const clearSelection = () => {
    setSelectedImage(null);
    setImageFrame(null);
    setSelectedAttachmentId(null);
    setSelectedInlineAttachment(null);
    setInlineFrame(null);
    setMoveImageMode(false);
    imagePointers.current.clear();
    imageGesture.current = null;
  };
  const resizeImage = (img: HTMLImageElement, width: number, height?: number) => {
    const maxWidth = editorRef.current?.clientWidth || 900;
    img.style.width = `${Math.round(Math.min(maxWidth, Math.max(72, width)))}px`;
    img.style.maxWidth = '100%';
    if (freeResize && height != null) img.style.height = `${Math.round(Math.max(48, height))}px`;
    else img.style.height = 'auto';
    refreshImageFrame(img);
  };
  const onImagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.target instanceof HTMLImageElement)) return;
    const img = e.target;
    imagePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (selectedImage === img && imagePointers.current.size >= 2) {
      cancelEditorDrag();
      e.currentTarget.setPointerCapture(e.pointerId);
      const w = img.getBoundingClientRect().width;
      const h = img.getBoundingClientRect().height;
      const [a, b] = [...imagePointers.current.values()];
      imageGesture.current = { mode: 'pinch', x: e.clientX, y: e.clientY, w, h, distance: Math.hypot(a.x-b.x, a.y-b.y), target: img };
      return;
    }
    if (e.pointerType === 'mouse' && selectedImage !== img) {
      suppressMediaClick.current = { source: img, until: performance.now() + 500 };
      selectImage(img);
      return;
    }
    armEditorDrag(e, img, 'image');
  };
  const onImagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imagePointers.current.has(e.pointerId)) return;
    imagePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = imageGesture.current;
    const resizedImage = g?.target || selectedImage;
    if (g && resizedImage && imagePointers.current.size >= 2 && g.mode === 'pinch') {
      const [a, b] = [...imagePointers.current.values()];
      const ratio = Math.hypot(a.x-b.x, a.y-b.y) / (g.distance || 1);
      resizeImage(resizedImage, g.w * ratio);
      e.preventDefault();
      return;
    }
    if (editorDrag.current?.kind === 'image') updateEditorDrag(e);
  };
  const onImagePointerUp = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    imagePointers.current.delete(e.pointerId);
    if (editorDrag.current?.kind === 'image') finishEditorDrag(e, cancelled);
    if (selectedImage && imageGesture.current?.mode === 'pinch' && imagePointers.current.size < 2) {
      commitEditor();
      imageGesture.current = null;
    } else if (imagePointers.current.size === 0) imageGesture.current = null;
  };
  const orderedAttachments = [...attachments].sort((a, b) => {
    const ai = attachmentLayout.order.indexOf(a.id), bi = attachmentLayout.order.indexOf(b.id);
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
  });
  const moveAttachment = (id: string, target: string) => {
    const ids = orderedAttachments.map(a => a.id).filter(x => x !== id);
    const index = ids.indexOf(target);
    if (index < 0) return;
    ids.splice(index, 0, id);
    commitLayout({ ...layoutRef.current, order: ids });
  };
  const setAttachmentWidth = (id: string, width: number) => {
    commitLayout({ ...layoutRef.current, widths: { ...layoutRef.current.widths, [id]: Math.max(55, Math.min(100, width)) } });
  };

  const unplacedAttachments = orderedAttachments.filter(att => !embeddedIds.has(att.id));

  // Handle image paste and drop
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!note) return;
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageUpload(file);
          return;
        }
      }
    },
    [note] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!note) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          handleImageUpload(file);
        } else {
          handleFileUpload(file);
        }
      }
    },
    [note] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleImageUpload = async (file: File) => {
    if (!note) return;
    if (!isAcceptedImageType(file)) {
      toast('Only JPG, PNG, GIF, and WEBP images are supported');
      return;
    }
    setUploadsInProgress((count) => count + 1);
    try {
      const uploadNoteId = note.id;
      const { url, path } = await uploadNoteImage(uploadNoteId, file);
      // An abandoned upload should not leave an orphaned storage object.
      if (activeNoteId.current !== uploadNoteId) {
        await deleteNoteImage(path);
        return;
      }
      const img = document.createElement('img');
      img.src = url;
      img.alt = file.name;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '8px';
      img.style.margin = '8px 0';
      const editor = editorRef.current;
      if (editor) {
        const range = lastCaretRange.current?.cloneRange();
        if (range && editor.contains(range.startContainer) &&
            !range.startContainer.parentElement?.closest(attachmentSelector)) {
          range.collapse(true);
          range.insertNode(img);
        } else editor.append(img);
        const after = document.createRange();
        after.setStartAfter(img);
        after.collapse(true);
        lastCaretRange.current = after.cloneRange();
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(after);
        commitEditor();
      }
      toast('Image added');
    } catch (err) {
      toast('Failed to upload image');
      console.error(err);
    } finally {
      setUploadsInProgress((count) => Math.max(0, count - 1));
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!note) return;
    setUploadsInProgress((count) => count + 1);
    try {
      const uploadNoteId = note.id;
      const result = await onAddAttachment(uploadNoteId, file);
      if (result) {
        // Uploads can finish after the user opens a different note.
        if (activeNoteId.current === uploadNoteId) insertAttachmentAtCaret(result);
        toast(`${file.name} attached`);
      } else {
        toast('Failed to attach file');
      }
    } catch (err) {
      toast('Failed to attach file');
      console.error(err);
    } finally {
      setUploadsInProgress((count) => Math.max(0, count - 1));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      } else {
        handleFileUpload(file);
      }
    }
    e.target.value = '';
  };

  // Never delete image bytes during contentEditable input: browser Undo and remote
  // revisions can reintroduce an image. Storage cleanup happens on permanent note delete.

  const handleRemoveImage = (src: string) => {
    if (!window.confirm('Delete this image from the note?')) return;
    const img = [...(editorRef.current?.querySelectorAll('img') || [])]
      .find(candidate => candidate.getAttribute('src') === src || candidate.src === src);
    if (!img) return;
    img.remove();
    commitEditor();

    clearSelection();
    setImageViewer(null);
    toast('Image removed');
  };
  const duplicateImage = (img: HTMLImageElement) => {
    const copy = img.cloneNode(true) as HTMLImageElement;
    img.after(copy);
    commitEditor();
    selectImage(copy);
  };

  const handleDeleteAttachment = async (attachment: Attachment) => {
    if (!window.confirm(`Delete "${attachment.name}"? This also removes the stored file.`)) return;
    try {
      await onRemoveAttachment(attachment.id);
      editorRef.current?.querySelectorAll<HTMLElement>(attachmentSelector).forEach(node => {
        if (node.dataset.notedAttachmentId === attachment.id) node.remove();
      });
      commitEditor();
      setSelectedInlineAttachment(null);
      setInlineFrame(null);
      setSelectedAttachmentId(null);
      toast(`${attachment.name} removed`);
    } catch (err) {
      toast('Failed to remove attachment');
      console.error(err);
    }
  };

  const handleOpenAttachment = async (attachment: Attachment) => {
    let url = attachment.url;
    if (!url) {
      url = await refreshAttachmentUrl(attachment.storagePath);
    }
    if (url) {
      window.open(url, '_blank');
    } else {
      toast('Failed to open file');
    }
  };

  if (!note) {
    return (
      <div className="h-full flex items-center justify-center bg-app" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 text-tertiary" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm text-secondary" style={{ color: 'var(--text-secondary)' }}>
            Select a note or create a new one
          </p>
        </div>
      </div>
    );
  }

  const folderName = folders.find((f) => f.id === note.folderId)?.name || null;

  return (
    <div className="h-full flex flex-col bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            className="lg:hidden p-2 rounded-lg hover-bg text-secondary"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
          {folderName && (
            <span className="text-xs text-tertiary px-2 hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
              {folderName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onTogglePin(note.id)}
            className="p-2 rounded-lg hover-bg text-secondary transition-colors"
            style={{ color: note.pinned ? 'var(--accent)' : 'var(--text-secondary)' }}
            aria-label={note.pinned ? 'Unpin' : 'Pin'}
          >
            {note.pinned ? <Pin size={18} fill="currentColor" /> : <Pin size={18} />}
          </button>

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setMenuOpen(!menuOpen); setMoveOpen(false); }}
              className="p-2 rounded-lg hover-bg text-secondary transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="More options"
            >
              <MoreHorizontal size={18} />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-10 z-50 w-48 rounded-xl shadow-xl border py-1 animate-scale-in"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <MenuBtn
                  icon={note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  label={note.pinned ? 'Unpin' : 'Pin'}
                  onClick={() => { onTogglePin(note.id); setMenuOpen(false); }}
                />
                <MenuBtn
                  icon={note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  label={note.archived ? 'Unarchive' : 'Archive'}
                  onClick={() => { onArchive(note.id, !note.archived); setMenuOpen(false); }}
                />

                {/* Move to folder — flat submenu, NO nested buttons */}
                <div className="relative">
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 transition-colors text-left hover-bg"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setMoveOpen(!moveOpen)}
                  >
                    <FolderIcon size={15} />
                    <span className="flex-1">Move to...</span>
                    <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  {moveOpen && (
                    <div
                      className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl shadow-xl border py-1 animate-scale-in"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuBtn
                        label="No folder"
                        onClick={() => { onMove(note.id, null); setMenuOpen(false); setMoveOpen(false); }}
                      />
                      {folders.map((f) => (
                        <MenuBtn
                          key={f.id}
                          icon={<FolderIcon size={14} />}
                          label={f.name}
                          onClick={() => { onMove(note.id, f.id); setMenuOpen(false); setMoveOpen(false); }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                <MenuBtn
                  icon={<Trash2 size={15} />}
                  label="Move to trash"
                  danger
                  onClick={() => { onTrash(note.id); setMenuOpen(false); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {syncConflict && <div role="alert" className="mx-3 my-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        This note also changed on another device. Autosave is paused to protect your edits.
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="rounded border px-3 py-1" onClick={() => {
            const incoming = syncConflict;
            setSyncConflict(null); conflictRef.current = false;
            acceptedRef.current = {id: incoming.id,title:incoming.title,content:incoming.content};
            setTitle(incoming.title); setContent(incoming.content);
            titleRef.current = incoming.title; contentRef.current = incoming.content;
            if (editorRef.current) editorRef.current.innerHTML = stripLayout(incoming.content);
            const layout = readLayout(incoming.content); layoutRef.current = layout; setAttachmentLayout(layout);
            clearSelection();
          }}>Use other device's version</button>
          <button type="button" className="rounded border px-3 py-1" onClick={() => {
            const incoming = syncConflict;
            setSyncConflict(null); conflictRef.current = false;
            acceptedRef.current = {id: incoming.id,title:incoming.title,content:incoming.content};
            onUpdate(incoming.id, titleRef.current, contentRef.current);
          }}>Keep my edits</button>
        </div>
      </div>}

      {/* Editor area */}
      <div ref={editorScrollRef} className="flex-1 overflow-y-auto" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-32">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onPaste={handlePaste}
            placeholder="Title"
            className="w-full text-2xl font-bold bg-transparent outline-none text-app mb-3 placeholder:text-tertiary"
            style={{ color: 'var(--text)' }}
          />
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              commitEditor();

            }}
            onPaste={handlePaste}
            onKeyUp={rememberCaret}
            onMouseUp={rememberCaret}
            onTouchEnd={rememberCaret}
            onPointerDown={e => { if (!onInlinePointerDown(e)) onImagePointerDown(e); }}
            onPointerMove={e => { if (!onInlinePointerMove(e)) onImagePointerMove(e); }}
            onPointerUp={e => { if (!onInlinePointerEnd(e)) onImagePointerUp(e); rememberCaret(); }}
            onPointerCancel={(e) => {
              onInlinePointerEnd(e, true);
              onImagePointerUp(e, true);
            }}
            onContextMenu={(e) => {
              const inlineNode = (e.target as HTMLElement).closest<HTMLElement>(attachmentSelector);
              if (inlineNode) { e.preventDefault(); selectInlineAttachment(inlineNode); }
              else if (e.target instanceof HTMLImageElement) { e.preventDefault(); selectImage(e.target); }
            }}
            onClick={(e) => {
              const suppressed = suppressMediaClick.current;
              if (suppressed && performance.now() <= suppressed.until &&
                  (e.target === suppressed.source || suppressed.source.contains(e.target as Node))) {
                e.preventDefault();
                e.stopPropagation();
                suppressMediaClick.current = null;
                return;
              }
              if (suppressed && performance.now() > suppressed.until) suppressMediaClick.current = null;
              const inlineNode = (e.target as HTMLElement).closest<HTMLElement>(attachmentSelector);
              if (inlineNode) {
                if (selectedInlineAttachment !== inlineNode) {
                  const att = inlineAttachmentById(inlineNode.dataset.notedAttachmentId || '');
                  if (att) void handleOpenAttachment(att);
                }
              } else if (e.target instanceof HTMLImageElement) {
                if (selectedImage !== e.target) selectImage(e.target);
              } else { clearSelection(); rememberCaret(); }
            }}
            data-placeholder="Start writing..."
            className="note-content w-full min-h-[200px] outline-none text-app text-sm leading-relaxed"
            style={{ color: 'var(--text)' }}
          />

          {/* Attachments section */}
          {unplacedAttachments.length > 0 && (
            <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                Files not placed in text ({unplacedAttachments.length})
              </h3>
              <div className="space-y-2" onPointerMove={(e) => {
                const g = attachmentGesture.current;
                if (!g || selectedAttachmentId !== g.id) return;
                if (g.mode === 'resize') {
                  const containerWidth = (e.currentTarget as HTMLElement).clientWidth;
                  setAttachmentWidth(g.id, g.width + (e.clientX - g.x) / containerWidth * 100);
                } else {
                  const card = e.currentTarget.querySelector<HTMLElement>(`[data-attachment-id="${g.id}"]`);
                  if (card) { card.style.transform = `translateY(${e.clientY - g.y}px)`; card.style.position = 'relative'; card.style.zIndex = '5'; }
                }
              }} onPointerUp={(e) => {
                const g = attachmentGesture.current;
                if (g?.mode === 'drag') {
                  const card = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-attachment-id]')].find(el => el.dataset.attachmentId === g.id);
                  if (card) card.style.pointerEvents = 'none';
                  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-attachment-id]')?.getAttribute('data-attachment-id');
                  if (card) { card.style.transform = ''; card.style.position = ''; card.style.zIndex = ''; card.style.pointerEvents = ''; }
                  if (target && target !== g.id) moveAttachment(g.id, target);
                }
                attachmentGesture.current = null;
              }} onPointerCancel={() => { attachmentGesture.current = null; }}>
                {unplacedAttachments.map((att, index) => (
                  <div key={att.id} data-attachment-id={att.id} className="relative" style={{ width: `${attachmentLayout.widths[att.id] || 100}%`, maxWidth: '100%', touchAction: selectedAttachmentId === att.id ? 'none' : 'auto' }}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('.noted-attachment-toolbar, .noted-attachment-resize-handle, button[aria-label="Remove attachment"], button[aria-label="Open file"]')) return;
                      if (selectedAttachmentId === att.id) {
                        attachmentGesture.current = { id: att.id, x: e.clientX, y: e.clientY, width: attachmentLayout.widths[att.id] || 100, mode: 'drag' };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } else {
                        attachmentPressStart.current = { x: e.clientX, y: e.clientY };
                        const surface = e.currentTarget, pointerId = e.pointerId;
                        attachmentLongPress.current = setTimeout(() => {
                          attachmentLongPress.current = null;
                          setSelectedAttachmentId(att.id);
                          attachmentGesture.current = { id: att.id, x: e.clientX, y: e.clientY, width: attachmentLayout.widths[att.id] || 100, mode: 'drag' };
                          if (surface.isConnected) {
                            try { surface.setPointerCapture(pointerId); } catch { /* cancelled by browser */ }
                          }
                          if (navigator.vibrate) navigator.vibrate(10);
                        }, 440);
                      }
                    }}
                    onPointerMove={(e) => {
                      const start = attachmentPressStart.current;
                      if (attachmentLongPress.current && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 9) {
                        clearTimeout(attachmentLongPress.current); attachmentLongPress.current = null;
                      }
                    }}
                    onPointerUp={() => {
                      if (attachmentLongPress.current) clearTimeout(attachmentLongPress.current);
                      attachmentLongPress.current = null;
                      attachmentPressStart.current = null;
                    }}
                    onPointerCancel={() => {
                      if (attachmentLongPress.current) clearTimeout(attachmentLongPress.current);
                      attachmentLongPress.current = null;
                      attachmentPressStart.current = null;
                      attachmentGesture.current = null;
                    }}
                    onContextMenu={(e) => { e.preventDefault(); setSelectedAttachmentId(att.id); }}>
                    <div className="mb-1 flex justify-end"><button type="button" className="text-xs px-2 py-1 rounded-lg border" onClick={() => insertAttachmentAtCaret(att)}>Insert at cursor ↑</button></div>
                    <AttachmentItem attachment={att} selected={selectedAttachmentId === att.id}
                      onSelect={() => { setSelectedImage(null); setSelectedAttachmentId(att.id); }}
                      onOpen={() => { if (selectedAttachmentId !== att.id) void handleOpenAttachment(att); }}
                      onDelete={() => handleDeleteAttachment(att)} />
                    {selectedAttachmentId === att.id && <button className="noted-attachment-resize-handle" title="Drag to resize file card" aria-label="Drag to resize file card" onPointerDown={e => {
                      e.preventDefault(); e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      attachmentGesture.current = { id: att.id, x: e.clientX, y: e.clientY, width: attachmentLayout.widths[att.id] || 100, mode: 'resize' };
                    }} onPointerUp={() => { attachmentGesture.current = null; }}><Maximize2 size={14}/></button>}
                    {selectedAttachmentId === att.id && <div className="noted-attachment-toolbar" onPointerDown={e => e.stopPropagation()}>
                      <button onClick={() => handleOpenAttachment(att)}>Open</button>
                      <button onClick={() => {
                        const name = window.prompt('Rename attachment', att.name);
                        if (name?.trim() && name.trim() !== att.name) void onRenameAttachment(att.id, name.trim()).then(ok => toast(ok ? 'Renamed' : 'Rename failed'));
                      }}><Edit3 size={14} /> Rename</button>
                      <button aria-label="Move attachment up" disabled={index === 0} onClick={() => moveAttachment(att.id, unplacedAttachments[index-1].id)}><ArrowUp size={15}/></button>
                      <button aria-label="Move attachment down" disabled={index === unplacedAttachments.length-1} onClick={() => {
                        const ids = orderedAttachments.map(a => a.id);
                        const nextId = unplacedAttachments[index+1].id;
                        const from = ids.indexOf(att.id), to = ids.indexOf(nextId);
                        ids.splice(from, 1); ids.splice(to, 0, att.id);
                        commitLayout({ ...layoutRef.current, order: ids });
                      }}><ArrowDown size={15}/></button>
                      <button onClick={() => setAttachmentWidth(att.id, (attachmentLayout.widths[att.id] || 100)-10)}>−</button>
                      <button onClick={() => setAttachmentWidth(att.id, (attachmentLayout.widths[att.id] || 100)+10)}>+</button>
                      <button className="noted-danger" onClick={() => handleDeleteAttachment(att)}><Trash2 size={14}/> Delete</button>
                    </div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inline attachment controls: the toolbar/resize handle are NOT serialized into the note. */}
      {selectedInlineAttachment && inlineFrame && (() => {
        const att = inlineAttachmentById(selectedInlineAttachment.dataset.notedAttachmentId || '');
        if (!att) return null;
        const widthPct = Math.round(selectedInlineAttachment.getBoundingClientRect().width / (editorRef.current?.clientWidth || 1) * 100);
        return <>
          <div className="noted-image-outline" style={{ left: inlineFrame.left, top: inlineFrame.top, width: inlineFrame.width, height: inlineFrame.height }} />
          <div className="noted-media-toolbar" style={{ left: Math.max(8, Math.min(window.innerWidth - 310, inlineFrame.left)), top: Math.max(8, inlineFrame.top > 65 ? inlineFrame.top - 52 : inlineFrame.bottom + 9) }}>
            <button onClick={() => void handleOpenAttachment(att)}>Open</button>
            <button title="Change file display name" onClick={async () => {
              const name = window.prompt('Rename attachment', att.name);
              if (!name?.trim() || name.trim() === att.name) return;
              const ok = await onRenameAttachment(att.id, name.trim());
              if (ok) {
                const nameNode = selectedInlineAttachment.querySelector<HTMLElement>('.noted-inline-attachment-name');
                if (nameNode) nameNode.textContent = name.trim();
                commitEditor();
              }
              toast(ok ? 'Renamed' : 'Rename failed');
            }}><Edit3 size={14} /> Rename</button>
            <button title="Make card narrower" onClick={() => resizeInlineAttachment(selectedInlineAttachment, widthPct - 10)}>−</button>
            <button title="Make card wider" onClick={() => resizeInlineAttachment(selectedInlineAttachment, widthPct + 10)}>+</button>
            <button title="Remove from text without deleting file" onClick={() => unlinkInlineAttachment(selectedInlineAttachment)}>Unlink</button>
            <button className="noted-danger" onClick={() => void handleDeleteAttachment(att)}><Trash2 size={14} /> Delete</button>
            <button onClick={() => { setSelectedInlineAttachment(null); setInlineFrame(null); }} title="Deselect"><X size={15}/></button>
          </div>
          <button aria-label="Drag to resize attachment" className="noted-image-handle" style={{left:inlineFrame.right,top:inlineFrame.bottom,cursor:'ew-resize'}}
            onPointerDown={e => {
              e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
              inlineDrag.current = { element: selectedInlineAttachment, x: e.clientX, y: widthPct, moved: false };
            }}
            onPointerMove={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId) || !inlineDrag.current) return;
              const drag = inlineDrag.current;
              resizeInlineAttachment(selectedInlineAttachment, drag.y + (e.clientX-drag.x) / (editorRef.current?.clientWidth || 1)*100);
            }}
            onPointerUp={() => { inlineDrag.current = null; commitEditor(); }}
            onPointerCancel={() => { inlineDrag.current = null; }}><Maximize2 size={12}/></button>
        </>;
      })()}

      {/* Selection UI lives outside contentEditable so it cannot pollute saved HTML. */}
      {selectedImage && imageFrame && <>
        <div className="noted-image-outline" style={{ left: imageFrame.left, top: imageFrame.top, width: imageFrame.width, height: imageFrame.height }} />
        <div className="noted-media-toolbar" style={{ left: Math.max(8, Math.min(window.innerWidth - 310, imageFrame.left)), top: Math.max(8, imageFrame.top > 65 ? imageFrame.top - 52 : imageFrame.bottom + 9) }}>
          <button onClick={() => setMoveImageMode(v => !v)} aria-pressed={moveImageMode} title="Drag to move"><Move size={16}/> {moveImageMode ? 'Moving' : 'Move'}</button>
          <button onClick={() => {setFreeResize(v=>!v);}} aria-pressed={freeResize} title="Toggle free resize"><Maximize2 size={16}/> {freeResize ? 'Free' : 'Ratio'}</button>
          <button onClick={() => {setImageViewer(selectedImage.src);setViewerScale(1);}}>Preview</button>
          <button onClick={() => duplicateImage(selectedImage)} title="Duplicate image"><Copy size={16}/></button>
          <button className="noted-danger" onClick={() => handleRemoveImage(selectedImage.src)} title="Delete image"><Trash2 size={16}/></button>
          <button onClick={clearSelection} title="Deselect"><X size={16}/></button>
        </div>
        {(['nw','n','ne','e','se','s','sw','w'] as const).map(handle => {
          const left = handle.includes('w') ? imageFrame.left : handle.includes('e') ? imageFrame.right : (imageFrame.left + imageFrame.right) / 2;
          const top = handle.includes('n') ? imageFrame.top : handle.includes('s') ? imageFrame.bottom : (imageFrame.top + imageFrame.bottom) / 2;
          return <button key={handle} className="noted-image-handle" aria-label={`Resize ${handle}`} style={{left,top,cursor:`${handle}-resize`}}
            onPointerDown={e => {
              e.preventDefault(); e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              imageGesture.current = { mode:'resize', x:e.clientX, y:e.clientY, w:imageFrame.width,h:imageFrame.height };
            }}
            onPointerMove={e => {
              const g = imageGesture.current;
              if (!g || g.mode !== 'resize' || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const dx = handle.includes('e') ? e.clientX-g.x : handle.includes('w') ? g.x-e.clientX : 0;
              const dy = handle.includes('s') ? e.clientY-g.y : handle.includes('n') ? g.y-e.clientY : 0;
              if (handle === 'n' || handle === 's') {
                if (freeResize) resizeImage(selectedImage, g.w, g.h+dy);
                else resizeImage(selectedImage, g.w*(1+dy/Math.max(1,g.h)));
              } else if (handle === 'e' || handle === 'w') {
                resizeImage(selectedImage, g.w+dx, g.h);
              } else resizeImage(selectedImage, g.w+dx, g.h+dy);
            }}
            onPointerUp={() => { if (imageGesture.current?.mode === 'resize') {commitEditor();imageGesture.current=null;} }}
            onPointerCancel={() => { imageGesture.current=null; }} />;
        })}
      </>}

      {/* Bottom attachment bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-t flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onPointerDown={rememberCaret}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover-bg text-secondary text-sm transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          <span className="hidden sm:inline">Attach file</span>
        </button>
        <button
          onPointerDown={rememberCaret}
          onClick={() => imageInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover-bg text-secondary text-sm transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ImageIcon size={15} />
          <span className="hidden sm:inline">Add image</span>
        </button>
        {uploading && (
          <span className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
            Uploading {uploadsInProgress} file{uploadsInProgress === 1 ? '' : 's'}...
          </span>
        )}
      </div>

      {/* Image viewer modal */}
      {imageViewer && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setImageViewer(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setImageViewer(null)}
          >
            <X size={24} />
          </button>
          <button type="button" className="absolute top-4 left-4 rounded bg-black/70 px-3 py-2 text-white" onClick={() => { handleRemoveImage(imageViewer); setImageViewer(null); }}>Remove image</button>
          <img
            src={imageViewer}
            alt="Viewer"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            style={{ transform: `scale(${viewerScale})`, touchAction: 'none' }}
            onTouchStart={e => {
              if (e.touches.length === 2) {
                viewerTouchDistance.current = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
                viewerStartScale.current = viewerScale;
              }
            }}
            onTouchMove={e => {
              if (e.touches.length === 2 && viewerTouchDistance.current) {
                const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
                setViewerScale(Math.max(1,Math.min(5,viewerStartScale.current*d/viewerTouchDistance.current)));
              }
            }}
            onTouchEnd={() => { viewerTouchDistance.current=null; }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function MenuBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg mx-1 transition-colors text-left hover-bg"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-secondary)' }}
    >
      {icon}
      {label}
    </button>
  );
}

function AttachmentItem({
  attachment,
  selected,
  onSelect,
  onOpen,
  onDelete,
}: {
  attachment: Attachment;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const fileType = attachment.name.split('.').pop()?.toUpperCase() || 'FILE';
  const iconType = getFileIcon(attachment.type, attachment.name);

  const icon = (() => {
    switch (iconType) {
      case 'image': return <ImageIcon size={20} />;
      case 'pdf': return <FileText size={20} />;
      case 'doc': return <FileText size={20} />;
      case 'xls': return <FileSpreadsheet size={20} />;
      case 'ppt': return <FileChartColumn size={20} />;
      case 'zip': return <FileArchive size={20} />;
      case 'txt': return <FileCode size={20} />;
      default: return <FileIcon size={20} />;
    }
  })();

  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-lg border transition-colors hover-bg"
      style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
        {icon}
      </div>
      <button
        onClick={onOpen}
        onContextMenu={e => {e.preventDefault(); onSelect();}}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium truncate text-app" style={{ color: 'var(--text)' }}>
          {attachment.name}
        </div>
        <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
          {fileType} · {formatFileSize(attachment.size)} · Uploaded
        </div>
      </button>
      <button
        onClick={onOpen}
        className="flex-shrink-0 p-1.5 rounded-lg hover-bg text-tertiary transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Open file"
      >
        <Download size={16} />
      </button>
      <button
        onClick={onDelete}
        className="flex-shrink-0 p-1.5 rounded-lg hover-bg text-tertiary transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Remove attachment"
      >
        <X size={16} />
      </button>
    </div>
  );
}
