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
  Video,
  Loader2,
  Move,
  Maximize2,
  Copy,
  ArrowUp,
  ArrowDown,
  Edit3,
  SlidersHorizontal,
  Share2,
  Undo2,
  Redo2,
  ListChecks,
  PenTool,
  SquarePen,
  Search,
  List,
  ListOrdered,
  Quote,
  Code2,
} from 'lucide-react';
import type { Note, Folder, Attachment } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { isAcceptedImageType, uploadNoteImage, deleteNoteImage } from '@/lib/images';
import { formatFileSize, getFileIcon, refreshAttachmentUrl } from '@/lib/attachments';
import { extractTags } from '@/lib/utils';
import { addTagToContent, readManagedTags, removeTagFromContent, writeManagedTags } from '@/lib/tagUtils.js';
import { MobileAttachmentBrowserSheet, MobileEditorMorePopover, MobileEditorToolsSheet, type MobileInlineImage } from '@/components/MobileEditorSheets';
import { MobileFormattingSheet } from '@/components/MobileFormattingSheet';
import { NoteTagManager } from '@/components/NoteTagManager';
import { MOBILE_FORMATTING_GROUPS, setChecklistItemChecked, shouldExitChecklistOnEnter } from '@/lib/mobileFormatting.js';
import { getMobileFormattingTransition } from '@/lib/mobileFormattingState.js';
import { applyInlineFormatToRange, isInlineFormatActiveAtNode, isInlineFormatAppliedToRange, removeEmptyInlineFormats, removeInlineFormatFromRange, toggleCollapsedInlineFormat } from '@/lib/mobileInlineFormatting.js';
import { getBlankLinesToAppend, isMeaningfulNoteContent } from '@/lib/editorBehavior.js';
import { MobileDrawingMarkup } from '@/components/MobileDrawingMarkup';
import { getFolderHierarchy, getFolderOptionLabel } from '@/lib/folderHierarchy.js';
import { shareNoteContent } from '@/lib/shareNote';

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
  priority: number;
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
  boundaryIndex: number;
  boundaries: DropBoundary[];
  highlighted: HTMLElement | null;
  frame: number | null;
  cacheDirty: boolean;
  measuredScrollTop: number;
  measuredWindowScrollY: number;
  scrollerRect: DOMRect | null;
  editorRect: DOMRect | null;
  ghostOffsetX: number;
  ghostOffsetY: number;
  activationX: number;
  activationY: number;
  onScroll: (() => void) | null;
  onResize: (() => void) | null;
  resizeObserver: ResizeObserver | null;
  mutationObserver: MutationObserver | null;
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
  onNoteMeaningful: (id: string) => void;
  onTogglePin: (id: string) => void;
  onTrash: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onArchive: (id: string, archived: boolean) => void;
  onAddAttachment: (noteId: string, file: File) => Promise<Attachment | null>;
  onRemoveAttachment: (id: string) => Promise<void>;
  onRenameAttachment: (id: string, name: string) => Promise<boolean>;
  onDuplicate: (id: string) => void;
  onBack: () => void;
  onCreateNote: () => void;
  onNavigateRecent: () => void;
  desktopPresentation?: boolean;
  startInWritingMode?: boolean;
  breadcrumb?: string;
  mobileBackLabel?: string;
  onToggleToolsPanel?: () => void;
  toolsPanelOpen?: boolean;
  existingTags: string[];
  onOpenTag: (tag: string) => void;
}

export function NoteEditor({
  note,
  folders,
  attachments,
  onUpdate,
  onNoteMeaningful,
  onTogglePin,
  onTrash,
  onMove,
  onArchive,
  onAddAttachment,
  onRemoveAttachment,
  onRenameAttachment,
  onDuplicate,
  onBack,
  onCreateNote,
  onNavigateRecent,
  desktopPresentation = false,
  startInWritingMode = false,
  breadcrumb = 'Tất cả ghi chú',
  mobileBackLabel: suppliedMobileBackLabel,
  onToggleToolsPanel,
  toolsPanelOpen = false,
  existingTags,
  onOpenTag,
}: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [syncConflict, setSyncConflict] = useState<Note | null>(null);
  const conflictRef = useRef(false);
  const acceptedRef = useRef<{ id: string; title: string; content: string } | null>(null);
  const displayedNoteId = useRef<string | null>(null);
  const [content, setContent] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<'tools' | 'actions' | 'formatting' | 'attachment-browser' | null>(null);
  const [mobileInlineImages, setMobileInlineImages] = useState<MobileInlineImage[]>([]);
  const [activeFormatting, setActiveFormatting] = useState<string[]>([]);
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);
  const [mobileKeyboardViewport, setMobileKeyboardViewport] = useState({ height: 0, offsetTop: 0 });
  const [mobileFindOpen, setMobileFindOpen] = useState(false);
  const [mobileFindQuery, setMobileFindQuery] = useState('');
  const [mobileFindIndex, setMobileFindIndex] = useState(-1);
  const [mobileFindCount, setMobileFindCount] = useState(0);
  const [mobilePaperMode, setMobilePaperMode] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageFrame, setImageFrame] = useState<DOMRect | null>(null);
  const [freeResize, setFreeResize] = useState(false);
  const [moveImageMode, setMoveImageMode] = useState(false);
  const imagePointers = useRef(new Map<number, { x: number; y: number }>());
  const imageGesture = useRef<{ mode: 'resize' | 'pinch'; x: number; y: number; w: number; h: number; distance?: number; target?: HTMLImageElement } | null>(null);
  const [attachmentLayout, setAttachmentLayout] = useState<AttachmentLayout>(EMPTY_LAYOUT);
  const layoutRef = useRef<AttachmentLayout>(EMPTY_LAYOUT);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [selectedInlineAttachment, setSelectedInlineAttachment] = useState<HTMLElement | null>(null);
  const [inlineFrame, setInlineFrame] = useState<DOMRect | null>(null);
  const lastCaretRange = useRef<Range | null>(null);
  const checklistCaretHandoff = useRef<{ row: HTMLLIElement; text: HTMLSpanElement } | null>(null);
  const checklistKeydownEnterPending = useRef<'insertParagraph' | 'insertLineBreak' | null>(null);
  const checklistCompositionActive = useRef(false);
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
  const mobileAttachmentInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const activeNoteId = useRef<string | undefined>(note?.id);
  activeNoteId.current = note?.id;
  const { toast } = useToast();
  const mobileWriting = !desktopPresentation;
  const canEdit = true;
  const currentNoteId = note?.id;

  useEffect(() => {
    setMobileSheet(null);
    setMobileFindOpen(false);
    setMobileFindQuery('');
    setMobileFindIndex(-1);
    setMobileFindCount(0);
    setMobilePaperMode(false);
    setDrawingOpen(false);
  }, [note?.id]);

  useEffect(() => {
    if (desktopPresentation || !startInWritingMode) return;
    const frame = window.requestAnimationFrame(() => editorRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [desktopPresentation, startInWritingMode, note?.id]);

  useEffect(() => {
    if (!mobileFindOpen || !mobileFindQuery.trim() || !editorRef.current) {
      setMobileFindCount(0);
      return;
    }
    const query = mobileFindQuery.trim().toLocaleLowerCase();
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    let count = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || '').toLocaleLowerCase();
      let offset = 0;
      let match = text.indexOf(query, offset);
      while (match >= 0) {
        count += 1;
        offset = match + query.length;
        match = text.indexOf(query, offset);
      }
    }
    setMobileFindCount(count);
    setMobileFindIndex(-1);
  }, [mobileFindOpen, mobileFindQuery, note?.id]);

  useEffect(() => {
    if (currentNoteId) return;
    displayedNoteId.current = null;
  }, [currentNoteId]);

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
  const flushCurrentDraftRef = useRef<() => void>(() => {});
  titleRef.current = title;
  contentRef.current = content;

  const reportMeaningfulContent = (nextTitle = titleRef.current, nextContent = editorRef.current?.innerHTML ?? contentRef.current) => {
    if (note && isMeaningfulNoteContent(nextTitle, nextContent, attachments.length > 0)) onNoteMeaningful(note.id);
  };
  const handleTitleChange = (nextTitle: string) => {
    titleRef.current = nextTitle;
    setTitle(nextTitle);
    reportMeaningfulContent(nextTitle);
  };

  const flushCurrentDraft = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const baseline = acceptedRef.current;
    if (!note || conflictRef.current || baseline?.id !== note.id || displayedNoteId.current !== note.id) return;
    const currentTitle = titleRef.current;
    const currentContent = contentRef.current;
    if (currentTitle === baseline.title && currentContent === baseline.content) return;
    onUpdate(note.id, currentTitle, currentContent);
    acceptedRef.current = { id: note.id, title: currentTitle, content: currentContent };
  };
  flushCurrentDraftRef.current = flushCurrentDraft;

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
  useEffect(() => () => flushCurrentDraftRef.current(), []);

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
    const snapshot = document.createElement('div');
    snapshot.innerHTML = editorRef.current.innerHTML;
    for (const text of Array.from(snapshot.querySelectorAll('.note-checklist-text'))) {
      for (const node of Array.from(text.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const clean = (node.textContent ?? '').replace(/\u200B/g, '');
        if (!clean) node.remove();
        else if (clean !== node.textContent) node.textContent = clean;
      }
      if (!text.textContent && !text.querySelector('img,[data-noted-attachment-id]') && Array.from(text.childNodes).every((node) => node instanceof HTMLBRElement)) text.replaceChildren();
    }
    const serialized = removeEmptyInlineFormats(snapshot);
    const html = withLayout(writeManagedTags(serialized, readManagedTags(contentRef.current)), layout);
    contentRef.current = html;
    setContent(html);
    reportMeaningfulContent(titleRef.current, html);
  };
  const updateNoteTags = (update: (html: string) => { content: string; changed: boolean }) => {
    if (!note || conflictRef.current) return;
    const currentHtml = editorRef.current?.innerHTML ?? stripLayout(contentRef.current);
    const bodyWithManagedTags = writeManagedTags(currentHtml, readManagedTags(contentRef.current));
    const result = update(bodyWithManagedTags);
    if (!result.changed) return;
    const nextContent = withLayout(result.content, layoutRef.current);
    if (editorRef.current) editorRef.current.innerHTML = stripLayout(nextContent);
    contentRef.current = nextContent;
    setContent(nextContent);
    reportMeaningfulContent(titleRef.current, nextContent);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    onUpdate(note.id, titleRef.current, nextContent);
    acceptedRef.current = { id: note.id, title: titleRef.current, content: nextContent };
  };
  const addNoteTag = (tag: string) => updateNoteTags((html) => addTagToContent(html, tag));
  const removeNoteTag = (tag: string) => updateNoteTags((html) => removeTagFromContent(html, tag));
  const noteTags = extractTags(content);
  const commitLayout = (next: AttachmentLayout) => {
    layoutRef.current = next;
    setAttachmentLayout(next);
    commitEditor(next);
  };

  const placeCaretAtBlankTap = (event: React.PointerEvent<HTMLDivElement>) => {
    if (desktopPresentation || !mobileWriting || !canEdit) return false;
    const editor = editorRef.current;
    const target = event.target as HTMLElement;
    if (!editor || (target !== editor && target !== event.currentTarget)) return false;

    const editorRect = editor.getBoundingClientRect();
    const style = window.getComputedStyle(editor);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.65;
    const rangeAtEnd = document.createRange();
    rangeAtEnd.selectNodeContents(editor);
    rangeAtEnd.collapse(false);
    const caretRect = rangeAtEnd.getBoundingClientRect();
    const lastBlockRect = editor.lastElementChild?.getBoundingClientRect();
    const contentRange = document.createRange();
    contentRange.selectNodeContents(editor);
    const contentRects = Array.from(contentRange.getClientRects()).filter((rect) => rect.width || rect.height);
    const lastContentRect = contentRects[contentRects.length - 1];
    const endY = caretRect.bottom > 0
      ? caretRect.bottom
      : (lastBlockRect?.bottom || lastContentRect?.bottom || editorRect.top);
    const blankLines = getBlankLinesToAppend(event.clientY, endY, lineHeight);
    if (!blankLines) return false;

    event.preventDefault();
    editor.focus();
    let targetBlock: HTMLDivElement | null = null;
    for (let index = 0; index < blankLines; index += 1) {
      targetBlock = document.createElement('div');
      targetBlock.appendChild(document.createElement('br'));
      editor.appendChild(targetBlock);
    }
    if (!targetBlock) return true;

    const range = document.createRange();
    range.selectNodeContents(targetBlock);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    lastCaretRange.current = range.cloneRange();
    commitEditor();
    return true;
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

  // Keep the last real editor selection so controls outside contentEditable can restore it.
  const rememberCaret = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
    const pendingChecklistCaret = checklistCaretHandoff.current;
    if (pendingChecklistCaret && !pendingChecklistCaret.row.isConnected) checklistCaretHandoff.current = null;
    else if (pendingChecklistCaret && !pendingChecklistCaret.text.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) return;
    const startElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const endElement = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
    if (startElement?.closest(attachmentSelector) || endElement?.closest(attachmentSelector)) return;
    lastCaretRange.current = range.cloneRange();
  }, []);

  const restoreEditorSelection = (focusEditor = true) => {
    const editor = editorRef.current;
    if (!editor) return null;
    const range = lastCaretRange.current?.cloneRange();
    if (range && range.startContainer.isConnected && range.endContainer.isConnected && editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
      if (focusEditor) {
        try { editor.focus({ preventScroll: true }); }
        catch { editor.focus(); }
      }
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      lastCaretRange.current = range.cloneRange();
      return range;
    }
    return null;
  };

  const getSelectionElement = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    let node = selection?.anchorNode;
    if (!node || !editor?.contains(node)) node = lastCaretRange.current?.startContainer ?? null;
    if (!editor || !node || !editor.contains(node)) return null;
    return node instanceof Element ? node : node.parentElement;
  };

  const readActiveFormatting = () => {
    const editor = editorRef.current;
    const element = getSelectionElement();
    if (!editor || !element) return [] as string[];
    const active = new Set<string>();
    const stateCommands: Record<string, string> = {
      insertUnorderedList: 'insertUnorderedList', insertOrderedList: 'insertOrderedList',
    };
    const selection = window.getSelection();
    const liveRange = selection?.rangeCount && editor.contains(selection.anchorNode) ? selection.getRangeAt(0) : null;
    const savedRange = lastCaretRange.current;
    const range = liveRange ?? (savedRange && editor.contains(savedRange.startContainer) && editor.contains(savedRange.endContainer) ? savedRange : null);
    if (range && selection && !liveRange) {
      selection.removeAllRanges();
      selection.addRange(range.cloneRange());
    }
    if (range) {
      for (const [id, command] of Object.entries(stateCommands)) {
        try { if (document.queryCommandState(command)) active.add(id); } catch { /* unsupported command state */ }
      }
      for (const id of ['bold', 'italic', 'underline', 'strikeThrough']) {
        if (range.collapsed ? isInlineFormatActiveAtNode(editor, range.startContainer, id) : isInlineFormatAppliedToRange(editor, range, id)) active.add(id);
      }
    }
    if (!range || range.collapsed) {
      if (element.closest('b,strong')) active.add('bold');
      if (element.closest('i,em')) active.add('italic');
      if (element.closest('u')) active.add('underline');
      if (element.closest('s,strike,del')) active.add('strikeThrough');
    }
    if (element.closest('ol')) active.add('insertOrderedList');
    if (element.closest('ul') && !element.closest('ul[data-checklist]')) active.add('insertUnorderedList');
    const isChecklist = Boolean(element.closest('ul[data-checklist]'));
    if (isChecklist) active.delete('insertUnorderedList');
    if (element.closest('h1')) active.add('heading1');
    if (element.closest('h2')) active.add('heading2');
    if (element.closest('h3')) active.add('heading3');
    if (isChecklist) active.add('checklist');
    if (element.closest('blockquote')) active.add('quote');
    if (element.closest('pre')) active.add('code');
    return [...active];
  };

  const refreshActiveFormatting = () => {
    setActiveFormatting(readActiveFormatting());
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      if (desktopPresentation) {
        const selection = window.getSelection();
        if (!selection?.anchorNode || !editorRef.current?.contains(selection.anchorNode)) return;
        rememberCaret();
        refreshActiveFormatting();
        return;
      }
      rememberCaret();
      if (mobileSheet === 'formatting') refreshActiveFormatting();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [desktopPresentation, mobileSheet, note?.id, rememberCaret]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (desktopPresentation) return;
    const viewport = window.visualViewport;
    let focusFrame = 0;
    const isEditorFocused = () => {
      const active = document.activeElement;
      return active === editorRef.current || Boolean(active?.classList.contains('tanooki-mobile-editor-document-title'));
    };
    const updateKeyboardState = () => {
      const obscuredHeight = window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0);
      const keyboardOpen = isEditorFocused() && obscuredHeight > 120;
      if (keyboardOpen) {
        const nextViewport = { height: viewport?.height ?? window.innerHeight, offsetTop: viewport?.offsetTop ?? 0 };
        setMobileKeyboardViewport((current) => Math.abs(current.height - nextViewport.height) > 0.5 || Math.abs(current.offsetTop - nextViewport.offsetTop) > 0.5 ? nextViewport : current);
      }
      setMobileKeyboardOpen(keyboardOpen);
    };
    const handleFocusChange = () => {
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(updateKeyboardState);
    };
    updateKeyboardState();
    viewport?.addEventListener('resize', updateKeyboardState);
    viewport?.addEventListener('scroll', updateKeyboardState);
    window.addEventListener('resize', updateKeyboardState);
    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);
    return () => {
      cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener('resize', updateKeyboardState);
      viewport?.removeEventListener('scroll', updateKeyboardState);
      window.removeEventListener('resize', updateKeyboardState);
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
    };
  }, [desktopPresentation, note?.id]);

  const makeChecklistToggle = (checked: boolean) => {
    const box = document.createElement('span');
    box.contentEditable = 'false';
    box.tabIndex = 0;
    box.className = 'note-checklist-box';
    box.dataset.noteChecklistToggle = 'true';
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', String(checked));
    box.setAttribute('aria-label', checked ? 'Bỏ đánh dấu mục' : 'Đánh dấu mục');
    return box;
  };

  const makeChecklistText = () => {
    const text = document.createElement('span');
    text.className = 'note-checklist-text';
    return text;
  };

  const ensureChecklistTextPlaceholder = (text: HTMLSpanElement) => {
    const hasVisibleText = (text.textContent ?? '').replace(/\u200B/g, '').length > 0;
    const hasMedia = Boolean(text.querySelector('img,[data-noted-attachment-id]'));
    if (text.childNodes.length === 1 && text.firstChild?.nodeType === Node.TEXT_NODE && text.textContent === '\u200B') return;
    if (!hasVisibleText && !hasMedia && Array.from(text.childNodes).every((node) => node instanceof HTMLBRElement || (node.nodeType === Node.TEXT_NODE && node.textContent?.replace(/\u200B/g, '') === ''))) {
      text.replaceChildren(document.createTextNode('\u200B'));
    }
  };

  const placeCaretAtEditableElement = (element: HTMLElement, position = 0) => {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.setStart(element, Math.max(0, Math.min(position, element.childNodes.length)));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    try { selection.setBaseAndExtent(element, range.startOffset, element, range.startOffset); } catch { /* Range selection is the Safari fallback. */ }
    lastCaretRange.current = range.cloneRange();
    return selection.anchorNode === element || element.contains(selection.anchorNode);
  };

  const placeCaretInChecklistText = (text: HTMLSpanElement, position = 0) => {
    ensureChecklistTextPlaceholder(text);
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    const anchor = (position >= text.childNodes.length ? textNodes[textNodes.length - 1] : textNodes[0]) ?? document.createTextNode('');
    if (!anchor.parentNode) text.insertBefore(anchor, text.firstChild);
    const caretPosition = position >= text.childNodes.length
      ? anchor.textContent?.length ?? 0
      : Math.max(0, Math.min(position, anchor.textContent?.length ?? 0));
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.setStart(anchor, caretPosition);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    try { selection.setBaseAndExtent(anchor, caretPosition, anchor, caretPosition); } catch { /* Range selection is the Safari fallback. */ }
    lastCaretRange.current = range.cloneRange();
    return selection.anchorNode === anchor && selection.anchorOffset === caretPosition;
  };

  const describeChecklistSelection = (label: string, target?: HTMLSpanElement, contextRow?: HTMLLIElement) => {
    if (!import.meta.env.DEV) return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    console.debug('[Tanooki checklist caret]', label, {
      activeElement: document.activeElement,
      anchorNode: anchor,
      anchorOffset: selection?.anchorOffset,
      activeChecklistRow: anchor instanceof Element ? anchor.closest('li[data-checklist-item]') : anchor?.parentElement?.closest('li[data-checklist-item]'),
      activeChecklistText: anchor instanceof Element ? anchor.closest('.note-checklist-text') : anchor?.parentElement?.closest('.note-checklist-text'),
      contextChecklistRow: contextRow,
      targetText: target,
      targetContainsSelection: Boolean(target && anchor && target.contains(anchor)),
    });
  };

  const focusChecklistTextOnIOS = (text: HTMLSpanElement, row: HTMLLIElement) => {
    const editor = editorRef.current;
    if (!editor || !text.isConnected || !row.isConnected || !row.contains(text)) return false;
    ensureChecklistTextPlaceholder(text);
    const textAnchor = Array.from(text.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE) ?? document.createTextNode('\u200B');
    if (!textAnchor.parentNode) text.insertBefore(textAnchor, text.firstChild);
    checklistCaretHandoff.current = { row, text };
    lastCaretRange.current = null;
    const placeAndVerify = () => {
      if (document.activeElement !== editor) {
        try { editor.focus({ preventScroll: true }); } catch { editor.focus(); }
      }
      const selection = window.getSelection();
      if (!selection) return false;
      const range = document.createRange();
      range.setStart(textAnchor, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      try { selection.collapse(textAnchor, 0); } catch { /* addRange remains the primary selection path. */ }
      const verifiedSelection = window.getSelection();
      const placed = verifiedSelection?.anchorNode === textAnchor && text.contains(verifiedSelection.anchorNode);
      if (placed) lastCaretRange.current = range.cloneRange();
      return placed;
    };
    const placed = placeAndVerify();
    describeChecklistSelection('after immediate handoff', text, row);
    requestAnimationFrame(() => {
      if (!text.isConnected || !row.isConnected) {
        checklistCaretHandoff.current = null;
        return;
      }
      const liveSelection = window.getSelection();
      const alreadyInTarget = liveSelection?.anchorNode === textAnchor;
      const verified = alreadyInTarget || placeAndVerify();
      if (verified && liveSelection?.rangeCount && text.contains(liveSelection.anchorNode)) {
        lastCaretRange.current = liveSelection.getRangeAt(0).cloneRange();
      }
      describeChecklistSelection(verified ? 'verified after one-frame handoff' : 'handoff failed after one-frame retry', text, row);
      if (verified) checklistCaretHandoff.current = null;
    });
    return placed;
  };

  const cleanChecklistCaretAnchors = (editor: HTMLDivElement | null) => {
    if (!editor) return;
    for (const text of Array.from(editor.querySelectorAll('.note-checklist-text'))) {
      for (const node of Array.from(text.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.includes('\u200B')) continue;
        const clean = node.textContent.replace(/\u200B/g, '');
        if (clean) node.textContent = clean;
      }
    }
  };

  // The LI owns the editable text flow. This only runs while hydrating legacy
  // markup or before a structural edit, never on ordinary character input.
  const prepareChecklistItem = (item: HTMLLIElement) => {
    item.dataset.checklistItem = 'true';
    item.dataset.checked = item.dataset.checked === 'true' ? 'true' : 'false';
    const originalChildren = Array.from(item.childNodes);
    const existingBox = originalChildren.find((child) => child instanceof HTMLSpanElement && child.hasAttribute('data-note-checklist-toggle')) as HTMLSpanElement | undefined;
    const box = existingBox ?? makeChecklistToggle(item.dataset.checked === 'true');
    const isControl = (child: Node) => child instanceof Element && child.hasAttribute('data-note-checklist-toggle');
    const isLegacyText = (child: Node) => child instanceof HTMLSpanElement && child.classList.contains('note-checklist-text');
    const appendEditable = (target: Node[], child: Node) => {
      if (isControl(child)) return;
      if (isLegacyText(child)) {
        target.push(...Array.from(child.childNodes));
      } else if (child instanceof HTMLElement && /^(P|DIV)$/.test(child.tagName)) {
        if (target.length && !(target[target.length - 1] instanceof HTMLBRElement)) target.push(document.createElement('br'));
        target.push(...Array.from(child.childNodes));
      } else {
        target.push(child);
      }
    };
    const existingText = originalChildren.find(isLegacyText) as HTMLSpanElement | undefined;
    const canonical = originalChildren[0] === box && existingText instanceof HTMLSpanElement && originalChildren[1] === existingText && originalChildren.length === 2;
    if (!canonical) {
      const editable: Node[] = [];
      originalChildren.forEach((child) => appendEditable(editable, child));
      const text = makeChecklistText();
      text.append(...editable);
      ensureChecklistTextPlaceholder(text);
      item.replaceChildren(box, text);
    } else {
      ensureChecklistTextPlaceholder(existingText);
    }
    setChecklistItemChecked(item, item.dataset.checked === 'true');
    return { toggle: box, text: item.querySelector<HTMLSpanElement>(':scope > .note-checklist-text')! };
  };

  const normalizeChecklistMarkup = (editor: HTMLDivElement) => {
    for (const list of Array.from(editor.querySelectorAll('ul[data-checklist]'))) {
      if (!editor.contains(list)) continue;
      let pendingItem: HTMLLIElement | null = null;
      for (const child of Array.from(list.childNodes)) {
        if (child instanceof HTMLLIElement) {
          if (pendingItem) prepareChecklistItem(pendingItem);
          pendingItem = null;
          prepareChecklistItem(child);
          continue;
        }
        if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) {
          child.remove();
          continue;
        }
        if (!pendingItem) {
          pendingItem = document.createElement('li');
          list.insertBefore(pendingItem, child);
        }
        pendingItem.append(child);
      }
      if (pendingItem) prepareChecklistItem(pendingItem);
    }
    for (const list of Array.from(editor.querySelectorAll('ul[data-checklist]'))) {
      if (!editor.contains(list)) continue;
      const nestedLists = Array.from(list.querySelectorAll('ul[data-checklist]')).reverse();
      for (const nested of nestedLists) {
        if (!editor.contains(nested)) continue;
        const owner = nested.closest('li[data-checked]');
        if (!(owner instanceof HTMLLIElement) || owner.closest('ul[data-checklist]') !== list) continue;
        let insertionPoint: Element = owner;
        for (const nestedRow of Array.from(nested.children)) {
          if (!(nestedRow instanceof HTMLLIElement)) continue;
          insertionPoint.after(nestedRow);
          insertionPoint = nestedRow;
        }
        nested.remove();
      }
    }
    for (const paragraph of Array.from(editor.children).filter((child): child is HTMLParagraphElement => child instanceof HTMLParagraphElement)) {
      if (!paragraph.textContent && !paragraph.querySelector('img,[data-noted-attachment-id]')) continue;
      const previousList = paragraph.previousElementSibling;
      const nextList = paragraph.nextElementSibling;
      const candidates: HTMLLIElement[] = [];
      if (previousList instanceof HTMLUListElement && previousList.hasAttribute('data-checklist')) {
        const lastItem = previousList.lastElementChild;
        if (lastItem instanceof HTMLLIElement) {
          prepareChecklistItem(lastItem);
          if (!lastItem.textContent && !lastItem.querySelector('img,[data-noted-attachment-id]')) candidates.push(lastItem);
        }
      }
      if (nextList instanceof HTMLUListElement && nextList.hasAttribute('data-checklist')) {
        const firstItem = nextList.firstElementChild;
        if (firstItem instanceof HTMLLIElement) {
          prepareChecklistItem(firstItem);
          if (!firstItem.textContent && !firstItem.querySelector('img,[data-noted-attachment-id]')) candidates.push(firstItem);
        }
      }
      if (candidates.length !== 1) continue;
      const target = candidates[0];
      const text = prepareChecklistItem(target).text;
      if (text.childNodes.length === 1 && text.firstChild instanceof HTMLBRElement) text.replaceChildren();
      for (const child of Array.from(paragraph.childNodes)) {
        if (child instanceof HTMLElement && /^(P|DIV)$/.test(child.tagName)) text.append(...Array.from(child.childNodes));
        else text.append(child);
      }
      ensureChecklistTextPlaceholder(text);
      paragraph.remove();
    }
  };

  useEffect(() => {
    if (editorRef.current) normalizeChecklistMarkup(editorRef.current);
  }, [note?.id, note?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeChecklistFromList = (list: HTMLUListElement) => {
    list.removeAttribute('data-checklist');
    for (const item of Array.from(list.children)) {
      if (!(item instanceof HTMLLIElement)) continue;
      item.removeAttribute('data-checked');
      const toggle = Array.from(item.children).find((child) => child instanceof HTMLElement && child.hasAttribute('data-note-checklist-toggle'));
      toggle?.remove();
      item.removeAttribute('data-checklist-item');
      const legacyText = Array.from(item.children).find((child) => child instanceof HTMLSpanElement && child.classList.contains('note-checklist-text'));
      if (legacyText) { while (legacyText.firstChild) legacyText.before(legacyText.firstChild); legacyText.remove(); }
    }
  };

  const replaceCurrentBlockWithParagraph = (block: HTMLElement) => {
    const children = Array.from(block.childNodes);
    if (block.tagName === 'BLOCKQUOTE' && block.children.length > 0 && Array.from(block.children).every((child) => /^(P|DIV|H1|H2|H3)$/.test(child.tagName))) {
      block.replaceWith(...children);
      return;
    }
    const paragraph = document.createElement('p');
    for (const child of children) paragraph.append(child);
    if (!paragraph.childNodes.length) paragraph.append(document.createElement('br'));
    block.replaceWith(paragraph);
  };

  const applyChecklist = () => {
    const editor = editorRef.current;
    const restored = restoreEditorSelection();
    if (!editor) return false;
    const element = getSelectionElement();
    const currentList = element?.closest('ul,ol');
    if (currentList instanceof HTMLUListElement && currentList.hasAttribute('data-checklist')) {
      removeChecklistFromList(currentList);
      try { document.execCommand('insertUnorderedList'); } catch { return false; }
      return true;
    }
    let list = currentList instanceof HTMLUListElement ? currentList : null;
    if (!list) {
      try { document.execCommand('insertUnorderedList'); } catch { return false; }
      const afterElement = getSelectionElement();
      const candidate = afterElement?.closest('ul');
      if (candidate instanceof HTMLUListElement && editor.contains(candidate)) list = candidate;
    }
    if (!list) return false;
    list.dataset.checklist = 'true';
    const selection = window.getSelection();
    let caretTarget: HTMLLIElement | null = null;
    for (const child of Array.from(list.children)) {
      if (!(child instanceof HTMLLIElement)) continue;
      prepareChecklistItem(child);
      if (selection?.anchorNode && child.contains(selection.anchorNode)) caretTarget = child;
    }
    if (restored && !caretTarget) {
      const item = list.querySelector(':scope > li:last-child');
      if (item instanceof HTMLLIElement) { prepareChecklistItem(item); caretTarget = item; }
    }
    if (caretTarget && selection) {
      const activeRange = selection.rangeCount ? selection.getRangeAt(0) : null;
      const text = caretTarget.querySelector<HTMLSpanElement>(':scope > .note-checklist-text');
      if (activeRange && text?.contains(activeRange.startContainer)) lastCaretRange.current = activeRange.cloneRange();
      else {
        if (text) placeCaretInChecklistText(text);
      }
    }
    return true;
  };

  const handleMobileFormat = (actionId: string) => {
    const action = MOBILE_FORMATTING_GROUPS.flatMap((group) => group.actions).find((item) => item.id === actionId);
    if (!action) return;
    const editor = editorRef.current;
    if (!editor) return;
    let savedRange = restoreEditorSelection();
    if (!savedRange) {
      rememberCaret();
      savedRange = restoreEditorSelection();
      if (!savedRange) focusBodyAtEnd();
    }
    const activeBefore = readActiveFormatting();
    const transition = getMobileFormattingTransition(actionId, activeBefore);
    const selection = window.getSelection();
    const selectedRange = savedRange && !savedRange.collapsed ? savedRange.cloneRange() : null;
    const selectedElement = getSelectionElement();
    const currentList = selectedElement?.closest('ul,ol');
    let handled = false;
    let selectionWasReplaced = false;
    if (['bold', 'italic', 'underline', 'strikeThrough'].includes(actionId)) {
      if (selection && transition === 'toggle-off' && selectedRange && isInlineFormatAppliedToRange(editor, selectedRange, actionId)) {
        handled = removeInlineFormatFromRange(editor, selectedRange, actionId, selection);
      } else if (selection && selectedRange) {
        handled = applyInlineFormatToRange(editor, selectedRange, actionId, selection);
      } else if (selection && savedRange?.collapsed) {
        handled = toggleCollapsedInlineFormat(editor, savedRange, actionId, selection);
      }
      selectionWasReplaced = handled;
    }
    if (handled) {
      // The inline helper already restored the selection/caret to the edited range.
    } else if (action.command === 'checklist') {
      if (!applyChecklist()) { toast('Không thể chèn checklist tại vị trí này'); return; }
      handled = true;
    } else if (currentList instanceof HTMLUListElement && currentList.hasAttribute('data-checklist') && (actionId === 'insertUnorderedList' || actionId === 'insertOrderedList')) {
      removeChecklistFromList(currentList);
      if (actionId === 'insertOrderedList') {
        try {
          if (document.execCommand(action.command, false, action.value) === false) { toast('Định dạng này chưa khả dụng trên trình duyệt'); return; }
        } catch { toast('Định dạng này chưa khả dụng trên trình duyệt'); return; }
      }
      handled = true;
    } else if (action.command === 'formatBlock' && transition === 'clear-block') {
      const currentBlock = selectedElement?.closest('h1,h2,h3,blockquote,pre');
      if (currentBlock instanceof HTMLElement && editor.contains(currentBlock)) {
        replaceCurrentBlockWithParagraph(currentBlock);
        handled = true;
      }
    }
    if (!handled) {
      try {
        const result = document.execCommand(action.command, false, action.value);
        if (result === false) { toast('Định dạng này chưa khả dụng trên trình duyệt'); return; }
      } catch { toast('Định dạng này chưa khả dụng trên trình duyệt'); return; }
    }
    if (!selectionWasReplaced && selectedRange && selectedRange.startContainer.isConnected && selectedRange.endContainer.isConnected && editor.contains(selectedRange.startContainer) && editor.contains(selectedRange.endContainer) && selection) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
      lastCaretRange.current = selectedRange.cloneRange();
    } else {
      rememberCaret();
    }
    commitEditor();
    refreshActiveFormatting();
  };

  const getChecklistCaretContext = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const liveRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let range = liveRange && editor?.contains(liveRange.startContainer) && editor.contains(liveRange.endContainer)
      ? liveRange
      : lastCaretRange.current && editor?.contains(lastCaretRange.current.startContainer) && editor.contains(lastCaretRange.current.endContainer)
        ? lastCaretRange.current.cloneRange()
        : null;
    const node = range?.startContainer;
    const element = node instanceof Element ? node : node?.parentElement;
    const item = element?.closest('li[data-checklist-item],li[data-checked]');
    const list = item?.parentElement;
    if (!(editor && selection && range && item instanceof HTMLLIElement && list instanceof HTMLUListElement && list.hasAttribute('data-checklist'))) return null;
    prepareChecklistItem(item);
    const text = item.querySelector<HTMLSpanElement>(':scope > .note-checklist-text');
    if (!(text instanceof HTMLSpanElement)) return null;
    const currentSelection = window.getSelection();
    const currentRange = currentSelection?.rangeCount ? currentSelection.getRangeAt(0) : null;
    range = currentRange && text.contains(currentRange.startContainer) && text.contains(currentRange.endContainer)
      ? currentRange
      : null;
    if (!range) {
      placeCaretInChecklistText(text);
      range = currentSelection?.rangeCount ? currentSelection.getRangeAt(0) : null;
    }
    if (!range) return null;
    return { editor, selection: currentSelection ?? selection, range, item, list, text };
  };

  const performChecklistEnter = (context: NonNullable<ReturnType<typeof getChecklistCaretContext>>) => {
    const { range, item, list, text } = context;
    describeChecklistSelection('before Enter', text, item);
    const shouldExit = shouldExitChecklistOnEnter({
      text: item.textContent,
      hasMedia: Boolean(item.querySelector('img,[data-noted-attachment-id]')),
      selectionCollapsed: range.collapsed,
    });
    if (shouldExit) {
      item.remove();
      const paragraph = document.createElement('p');
      paragraph.append(document.createElement('br'));
      if (!list.querySelector(':scope > li')) list.replaceWith(paragraph);
      else list.after(paragraph);
      placeCaretAtEditableElement(paragraph);
    } else {
      const splitPoint = range.cloneRange();
      if (!splitPoint.collapsed) splitPoint.deleteContents();
      const rightSide = document.createRange();
      rightSide.setStart(splitPoint.startContainer, splitPoint.startOffset);
      rightSide.setEnd(text, text.childNodes.length);
      const remainder = rightSide.extractContents();
      const nextItem = document.createElement('li');
      nextItem.dataset.checklistItem = 'true';
      nextItem.dataset.checked = 'false';
      nextItem.append(makeChecklistToggle(false));
      const nextText = makeChecklistText();
      nextText.append(remainder);
      ensureChecklistTextPlaceholder(nextText);
      nextItem.append(nextText);
      ensureChecklistTextPlaceholder(text);
      item.after(nextItem);
      lastCaretRange.current = null;
      describeChecklistSelection('after row insert before caret handoff', nextText, nextItem);
      focusChecklistTextOnIOS(nextText, nextItem);
    }
    commitEditor();
    refreshActiveFormatting();
  };

  const performChecklistLineBreak = (context: NonNullable<ReturnType<typeof getChecklistCaretContext>>) => {
    const { selection, range } = context;
    range.deleteContents();
    const lineBreak = document.createElement('br');
    range.insertNode(lineBreak);
    range.setStartAfter(lineBreak);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    lastCaretRange.current = range.cloneRange();
    commitEditor();
    rememberCaret();
    refreshActiveFormatting();
  };

  const isChecklistCaretAtStart = (item: HTMLLIElement, range: Range) => {
    if (!range.collapsed || !item.contains(range.startContainer)) return false;
    const prefix = document.createRange();
    prefix.setStart(item, 1);
    prefix.setEnd(range.startContainer, range.startOffset);
    const fragment = prefix.cloneContents();
    const hasMedia = Boolean(fragment.querySelector('img,[data-noted-attachment-id]'));
    const emptyPlaceholder = !item.textContent && !item.querySelector('img,[data-noted-attachment-id]') && item.querySelectorAll('br').length === 1;
    return fragment.textContent === '' && !hasMedia && (!fragment.querySelector('br') || emptyPlaceholder);
  };

  const performChecklistBackspace = (context: NonNullable<ReturnType<typeof getChecklistCaretContext>>) => {
    const { range, item, list } = context;
    if (!isChecklistCaretAtStart(item, range)) return false;
    const previousItem = item.previousElementSibling;
    if (previousItem instanceof HTMLLIElement) {
      prepareChecklistItem(previousItem);
      const previousText = prepareChecklistItem(previousItem).text;
      const currentText = prepareChecklistItem(item).text;
      const currentHasVisibleText = (currentText.textContent ?? '').replace(/\u200B/g, '').length > 0;
      if (currentHasVisibleText || currentText.querySelector('img,[data-noted-attachment-id]')) {
        if ((previousText.textContent ?? '').replace(/\u200B/g, '') === '' && !previousText.querySelector('img,[data-noted-attachment-id]')) previousText.replaceChildren();
        while (currentText.firstChild) previousText.append(currentText.firstChild);
      } else {
        currentText.replaceChildren();
      }
      ensureChecklistTextPlaceholder(previousText);
      const caretOffset = previousText.childNodes.length;
      placeCaretInChecklistText(previousText, caretOffset);
      item.remove();
    } else {
      const paragraph = document.createElement('p');
      const text = prepareChecklistItem(item).text;
      while (text.firstChild) paragraph.append(text.firstChild);
      if (!paragraph.textContent && !paragraph.querySelector('img,[data-noted-attachment-id]')) paragraph.replaceChildren(document.createElement('br'));
      else if (paragraph.querySelectorAll('br').length === 1 && paragraph.childNodes.length === 1) paragraph.replaceChildren(document.createElement('br'));
      item.remove();
      if (list.querySelector(':scope > li')) list.before(paragraph);
      else list.replaceWith(paragraph);
      placeCaretAtEditableElement(paragraph);
    }
    commitEditor();
    rememberCaret();
    refreshActiveFormatting();
    return true;
  };

  const handleChecklistBeforeInput: React.FormEventHandler<HTMLDivElement> = (event) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (nativeEvent.isComposing || checklistCompositionActive.current) return;
    const inputType = nativeEvent.inputType;
    if (inputType !== 'insertParagraph' && inputType !== 'insertLineBreak' && inputType !== 'deleteContentBackward') return;
    if (checklistKeydownEnterPending.current && (inputType === 'insertParagraph' || inputType === 'insertLineBreak')) {
      event.preventDefault();
      checklistKeydownEnterPending.current = null;
      return;
    }
    const context = getChecklistCaretContext();
    if (!context) return;
    if (inputType === 'deleteContentBackward' && !isChecklistCaretAtStart(context.item, context.range)) return;
    event.preventDefault();
    if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      checklistKeydownEnterPending.current = inputType;
      const pendingType = inputType;
      requestAnimationFrame(() => {
        if (checklistKeydownEnterPending.current === pendingType) checklistKeydownEnterPending.current = null;
      });
    }
    if (inputType === 'deleteContentBackward') performChecklistBackspace(context);
    else if (inputType === 'insertLineBreak') performChecklistLineBreak(context);
    else performChecklistEnter(context);
  };

  const handleChecklistEnter: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.nativeEvent.isComposing || checklistCompositionActive.current || event.nativeEvent.keyCode === 229) return;
    const checkbox = (event.target as HTMLElement).closest<HTMLElement>('[data-note-checklist-toggle]');
    if (checkbox) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        const item = checkbox.closest('li[data-checklist-item]');
        if (item instanceof HTMLLIElement) {
          setChecklistItemChecked(item, item.dataset.checked !== 'true');
          commitEditor();
        }
      }
      return;
    }
    if (event.key === 'Enter') {
      if (checklistKeydownEnterPending.current) {
        event.preventDefault();
        checklistKeydownEnterPending.current = null;
        return;
      }
    }
    if (event.key !== 'Enter' && event.key !== 'Backspace') return;
    const context = getChecklistCaretContext();
    if (!context) return;
    if (event.key === 'Backspace' && !isChecklistCaretAtStart(context.item, context.range)) return;
    event.preventDefault();
    if (event.key === 'Backspace') performChecklistBackspace(context);
    else {
      const inputType = event.shiftKey ? 'insertLineBreak' : 'insertParagraph';
      checklistKeydownEnterPending.current = inputType;
      const pendingType = inputType;
      requestAnimationFrame(() => {
        if (checklistKeydownEnterPending.current === pendingType) checklistKeydownEnterPending.current = null;
      });
      if (event.shiftKey) performChecklistLineBreak(context);
      else performChecklistEnter(context);
    }
  };

  const handleChecklistCompositionStart = () => { checklistCompositionActive.current = true; };
  const handleChecklistCompositionEnd = () => { checklistCompositionActive.current = false; };

  const handleChecklistClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    const control = (event.target as HTMLElement).closest<HTMLElement>('[data-note-checklist-toggle]');
    if (!control || !editorRef.current?.contains(control)) return;
    event.preventDefault();
    event.stopPropagation();
    const item = control.closest('li[data-checklist-item]');
    if (!(item instanceof HTMLLIElement)) return;
    setChecklistItemChecked(item, item.dataset.checked !== 'true');
    commitEditor();
  };

  const focusBodyAtEnd = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    rememberCaret();
  };

  const handleMobileTitleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    const nativeEvent = event.nativeEvent;
    if ((event.key !== 'Enter' && event.code !== 'NumpadEnter') || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    event.preventDefault();
    focusBodyAtEnd();
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
    if (session.onScroll) editorScrollRef.current?.removeEventListener('scroll', session.onScroll);
    if (session.onResize) {
      window.removeEventListener('resize', session.onResize);
      window.removeEventListener('orientationchange', session.onResize);
    }
    session.resizeObserver?.disconnect();
    session.mutationObserver?.disconnect();
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

  // Measure the editor once when dragging starts. Pointer frames only search this
  // compact cache; DOM traversal, Range creation and layout reads stay off the hot path.
  const collectDropBoundaries = (source: HTMLElement, touchOptimized: boolean): DropBoundary[] => {
    const editor = editorRef.current;
    if (!editor) return [];
    const candidates: DropBoundary[] = [];
    const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    const addNode = (node: Node, target: HTMLElement | null, priority: number) => {
      if (node === source || (node instanceof Element && node.contains(source))) return;
      const rect = nodeRect(node);
      if (!rect) return;
      const parent = node.parentNode;
      if (!parent || !editor.contains(parent) && parent !== editor) return;
      candidates.push({ parent, before: node, y: rect.top, left: rect.left, right: rect.right, target, priority });
      candidates.push({ parent, before: node.nextSibling, y: rect.bottom, left: rect.left, right: rect.right, target, priority });
    };
    const visit = (parent: Node, insideBlock = false) => {
      parent.childNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          if (node.matches(`img, ${attachmentSelector}`)) {
            addNode(node, node, 0);
            return;
          }
          if (node.tagName === 'BR') {
            addNode(node, node.parentElement, 1);
            return;
          }
          const isBlock = blockTags.has(node.tagName);
          if (isBlock) addNode(node, node, 0);
          // Atomic media and BR-separated runs inside a block are also useful targets.
          visit(node, insideBlock || isBlock);
        } else if ((!insideBlock || !touchOptimized) && node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          addNode(node, node.parentElement, 2);
        }
      });
    };
    visit(editor);
    candidates.sort((a, b) => a.y - b.y || a.priority - b.priority);
    // Nested blocks can expose the same visual line. Keep the block-level target
    // so a tiny touch movement cannot alternate between equivalent DOM positions.
    if (!touchOptimized) return candidates;
    return candidates.filter((candidate, index, all) => {
      const previous = all[index - 1];
      return !previous || Math.abs(previous.y - candidate.y) > 2 || previous.priority > candidate.priority;
    });
  };

  const scheduleEditorDragFrame = (session: EditorDragSession) => {
    if (editorDrag.current === session && session.active && session.frame == null) {
      session.frame = requestAnimationFrame(renderEditorDragFrame);
    }
  };

  const rebuildDropBoundaryCache = (session: EditorDragSession) => {
    const scroller = editorScrollRef.current;
    const touchOptimized = session.pointerType === 'touch' || session.pointerType === 'pen';
    session.boundaries = collectDropBoundaries(session.source, touchOptimized);
    session.boundaryIndex = -1;
    session.boundary = null;
    session.measuredScrollTop = scroller?.scrollTop || 0;
    session.measuredWindowScrollY = window.scrollY;
    session.scrollerRect = scroller?.getBoundingClientRect() || null;
    session.editorRect = editorRef.current?.getBoundingClientRect() || null;
    session.cacheDirty = false;
  };

  const syncCachedBoundaryScroll = (session: EditorDragSession) => {
    const scroller = editorScrollRef.current;
    const scrollTop = scroller?.scrollTop || 0;
    const delta = scrollTop - session.measuredScrollTop + window.scrollY - session.measuredWindowScrollY;
    if (delta) session.boundaries.forEach(boundary => { boundary.y -= delta; });
    session.measuredScrollTop = scrollTop;
    session.measuredWindowScrollY = window.scrollY;
  };

  const findCachedDropBoundary = (session: EditorDragSession): DropBoundary | null => {
    if (session.cacheDirty) rebuildDropBoundaryCache(session);
    else syncCachedBoundaryScroll(session);
    if (!session.boundaries.length) return null;
    const nearestIndex = session.boundaries.reduce((bestIndex, candidate, index, all) => {
      const best = all[bestIndex];
      if (session.pointerType === 'touch' || session.pointerType === 'pen') {
        return Math.abs(candidate.y - session.y) < Math.abs(best.y - session.y) ? index : bestIndex;
      }
      const x = session.x;
      const vertical = Math.abs(candidate.y - session.y);
      const horizontal = x < candidate.left ? candidate.left - x : x > candidate.right ? x - candidate.right : 0;
      const score = vertical + horizontal * 0.12;
      const bestVertical = Math.abs(best.y - session.y);
      const bestHorizontal = x < best.left ? best.left - x : x > best.right ? x - best.right : 0;
      return score < bestVertical + bestHorizontal * 0.12 ? index : bestIndex;
    }, 0);
    if ((session.pointerType === 'touch' || session.pointerType === 'pen') && session.boundaryIndex >= 0 && nearestIndex !== session.boundaryIndex) {
      const current = session.boundaries[session.boundaryIndex];
      const nearest = session.boundaries[nearestIndex];
      const midpoint = (current.y + nearest.y) / 2;
      const deadband = 8;
      const crossed = nearest.y > current.y ? session.y > midpoint + deadband : session.y < midpoint - deadband;
      if (!crossed) return current;
    }
    session.boundaryIndex = nearestIndex;
    return session.boundaries[nearestIndex];
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
        priority: 0,
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
    const editorRect = editor.getBoundingClientRect();
    return { parent, before, y, left: editorRect.left, right: editorRect.right, target: containerElement instanceof HTMLElement ? containerElement : null, priority: 3 };
  };

  const renderEditorDragFrame = () => {
    const session = editorDrag.current;
    if (!session?.active) return;
    session.frame = null;
    session.ghost!.style.transform = `translate3d(${Math.round(session.x + session.ghostOffsetX)}px, ${Math.round(session.y + session.ghostOffsetY)}px, 0)`;

    const scroller = editorScrollRef.current;
    let autoScrollSpeed = 0;
    if (scroller && session.scrollerRect) {
      const rect = session.scrollerRect;
      const edge = 60;
      const topDistance = session.y - Math.max(0, rect.top);
      const bottomDistance = Math.min(window.innerHeight, rect.bottom) - session.y;
      const touchScroll = session.pointerType === 'touch' || session.pointerType === 'pen';
      if (topDistance >= 0 && topDistance < edge) {
        const intensity = 1 - topDistance / edge;
        autoScrollSpeed = -(touchScroll ? intensity * intensity * 10 : Math.ceil(intensity * 18));
      } else if (bottomDistance >= 0 && bottomDistance < edge) {
        const intensity = 1 - bottomDistance / edge;
        autoScrollSpeed = touchScroll ? intensity * intensity * 10 : Math.ceil(intensity * 18);
      }
      if (Math.abs(autoScrollSpeed) >= .15) scroller.scrollTop += autoScrollSpeed;
    }

    const boundary = findCachedDropBoundary(session) || caretFallbackBoundary(session.source, session.x, session.y);
    session.boundary = boundary;
    if (session.highlighted !== boundary?.target) {
      session.highlighted?.classList.remove('noted-active-drop-target');
      session.highlighted = boundary?.target || editorRef.current;
      session.highlighted?.classList.add('noted-active-drop-target');
    }
    if (boundary && session.indicator) {
      const editorRect = session.editorRect;
      const left = Math.max(editorRect?.left || 0, boundary.left || 0) + 2;
      const right = Math.min(editorRect?.right || window.innerWidth, boundary.right || window.innerWidth) - 2;
      session.indicator.style.display = 'block';
      session.indicator.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(boundary.y)}px, 0)`;
      session.indicator.style.width = `${Math.max(32, right - left)}px`;
    } else if (session.indicator) session.indicator.style.display = 'none';

    if (Math.abs(autoScrollSpeed) >= .15) scheduleEditorDragFrame(session);
  };

  const activateEditorDrag = (session: EditorDragSession) => {
    if (editorDrag.current !== session || session.active || !session.source.isConnected) return;
    session.active = true;
    session.timer = null;
    session.activationX = session.x;
    session.activationY = session.y;
    if (session.kind === 'image') { selectImage(session.source as HTMLImageElement); setMoveImageMode(true); }
    else selectInlineAttachment(session.source);
    const rect = session.source.getBoundingClientRect();
    const ghost = session.source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.contentEditable = 'false';
    ghost.className = `noted-drag-ghost noted-drag-ghost-${session.kind}`;
    const ghostWidth = Math.min(rect.width, 280);
    const ghostHeight = rect.width > 0 ? Math.min(rect.height, 280 * rect.height / rect.width) : rect.height;
    ghost.style.width = `${ghostWidth}px`;
    if (rect.width > 0) ghost.style.height = `${ghostHeight}px`;
    const isTouch = session.pointerType === 'touch' || session.pointerType === 'pen';
    session.ghostOffsetX = isTouch ? -Math.min(ghostWidth * .5, 120) : 12;
    session.ghostOffsetY = isTouch ? -Math.min(110, ghostHeight * .55 + 42) : 12;
    const indicator = document.createElement('div');
    indicator.className = 'noted-drop-indicator';
    document.body.append(ghost, indicator);
    session.ghost = ghost;
    session.indicator = indicator;
    session.source.classList.add('noted-dragging-source');
    editorRef.current?.classList.add('noted-active-drop-target');
    rebuildDropBoundaryCache(session);
    session.onScroll = () => scheduleEditorDragFrame(session);
    session.onResize = () => {
      session.cacheDirty = true;
      scheduleEditorDragFrame(session);
    };
    editorScrollRef.current?.addEventListener('scroll', session.onScroll, { passive: true });
    window.addEventListener('resize', session.onResize, { passive: true });
    window.addEventListener('orientationchange', session.onResize, { passive: true });
    if (typeof ResizeObserver !== 'undefined' && editorRef.current) {
      session.resizeObserver = new ResizeObserver(session.onResize);
      session.resizeObserver.observe(editorRef.current);
    }
    if (typeof MutationObserver !== 'undefined' && editorRef.current) {
      session.mutationObserver = new MutationObserver(session.onResize);
      session.mutationObserver.observe(editorRef.current, { childList: true, characterData: true, subtree: true });
    }
    try { session.surface.setPointerCapture(session.pointerId); } catch { /* pointer may have been cancelled */ }
    if (isTouch) navigator.vibrate?.(10);
    scheduleEditorDragFrame(session);
  };

  const armEditorDrag = (e: React.PointerEvent<HTMLDivElement>, source: HTMLElement, kind: EditorDragKind) => {
    cancelEditorDrag();
    const session: EditorDragSession = {
      pointerId: e.pointerId, pointerType: e.pointerType, kind, source, surface: e.currentTarget,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      active: false, moved: false, timer: null, ghost: null, indicator: null,
      boundary: null, boundaryIndex: -1, boundaries: [], highlighted: null, frame: null,
      cacheDirty: false, measuredScrollTop: 0, measuredWindowScrollY: window.scrollY,
      scrollerRect: null, editorRect: null, ghostOffsetX: 12, ghostOffsetY: 12,
      activationX: e.clientX, activationY: e.clientY, onScroll: null, onResize: null,
      resizeObserver: null, mutationObserver: null,
    };
    editorDrag.current = session;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      session.timer = setTimeout(() => activateEditorDrag(session), 290);
    }
  };

  const updateEditorDrag = (e: React.PointerEvent<HTMLDivElement>): boolean => {
    const session = editorDrag.current;
    if (!session || session.pointerId !== e.pointerId) return false;
    session.x = e.clientX;
    session.y = e.clientY;
    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    const distance = Math.hypot(dx, dy);
    if (!session.active) {
      if (session.pointerType === 'mouse' && distance >= 4) activateEditorDrag(session);
      else if ((session.pointerType === 'touch' || session.pointerType === 'pen') &&
          (Math.abs(dy) > 12 || Math.abs(dx) > 10)) { cancelEditorDrag(); return false; }
    }
    if (session.active) {
      const activeDistance = Math.hypot(e.clientX - session.activationX, e.clientY - session.activationY);
      session.moved ||= session.pointerType === 'mouse' ? distance >= 4 : activeDistance >= 1;
      e.preventDefault();
      scheduleEditorDragFrame(session);
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
        node.title = 'Tệp không khả dụng';
        return;
      }
      node.classList.remove('noted-attachment-missing');
      node.title = 'Tap to open · Long press to move or resize';
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
      toast('Chỉ hỗ trợ ảnh JPG, PNG, GIF và WEBP');
      return;
    }
    onNoteMeaningful(note.id);
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
      toast('Đã thêm hình ảnh');
    } catch (err) {
      toast('Không thể tải hình ảnh lên');
      console.error(err);
    } finally {
      setUploadsInProgress((count) => Math.max(0, count - 1));
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!note) return;
    onNoteMeaningful(note.id);
    setUploadsInProgress((count) => count + 1);
    try {
      const uploadNoteId = note.id;
      const result = await onAddAttachment(uploadNoteId, file);
      if (result) {
        // Uploads can finish after the user opens a different note.
        if (activeNoteId.current === uploadNoteId) insertAttachmentAtCaret(result);
        toast(`Đã đính kèm ${file.name}`);
      } else {
        toast('Không thể đính kèm tệp');
      }
    } catch (err) {
      toast('Không thể đính kèm tệp');
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
    toast('Đã xóa hình ảnh');
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
      toast(`Đã xóa ${attachment.name}`);
    } catch (err) {
      toast('Không thể xóa tệp đính kèm');
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
      toast('Không thể mở tệp');
    }
  };

  const handleShareAttachment = async (attachment: Attachment) => {
    const url = attachment.url || await refreshAttachmentUrl(attachment.storagePath);
    if (!url) { toast('Không thể mở tệp'); return; }
    try {
      if (navigator.share && navigator.canShare) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Unable to download attachment for sharing');
        const file = new File([await response.blob()], attachment.name, { type: attachment.type || 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: attachment.name });
          return;
        }
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      // Signed URLs remain a safe browser-native fallback when file sharing is unavailable.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShareInlineImage = async (image: MobileInlineImage) => {
    try {
      if (navigator.share && navigator.canShare) {
        const response = await fetch(image.src);
        if (!response.ok) throw new Error('Unable to download image for sharing');
        const file = new File([await response.blob()], image.name || 'hinh-anh', { type: response.headers.get('content-type') || 'image/*' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: image.name || 'Hình ảnh' });
          return;
        }
      }
      const link = document.createElement('a');
      link.href = image.src;
      link.download = image.name || 'hinh-anh';
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      window.open(image.src, '_blank', 'noopener,noreferrer');
    }
  };

  const renameAttachment = (attachment: Attachment) => {
    const name = window.prompt('Đổi tên tệp đính kèm', attachment.name);
    if (!name?.trim() || name.trim() === attachment.name) return;
    void onRenameAttachment(attachment.id, name.trim()).then(ok => toast(ok ? 'Đã đổi tên' : 'Không thể đổi tên'));
  };

  const openMobileFind = () => {
    setMobileSheet(null);
    setMobileFindQuery('');
    setMobileFindIndex(-1);
    setMobileFindCount(0);
    setMobileFindOpen(true);
    window.requestAnimationFrame(() => document.getElementById('tanooki-mobile-find-input')?.focus());
  };

  const findInNote = (direction: -1 | 1) => {
    const root = editorRef.current;
    const query = mobileFindQuery.trim().toLocaleLowerCase();
    if (!root || !query) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const ranges: Range[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      const normalized = text.toLocaleLowerCase();
      let offset = 0;
      let match = normalized.indexOf(query, offset);
      while (match >= 0) {
        const range = document.createRange();
        range.setStart(node, match);
        range.setEnd(node, match + query.length);
        ranges.push(range);
        offset = match + query.length;
        match = normalized.indexOf(query, offset);
      }
    }
    setMobileFindCount(ranges.length);
    if (!ranges.length) { setMobileFindIndex(-1); return; }
    const nextIndex = mobileFindIndex < 0
      ? direction > 0 ? 0 : ranges.length - 1
      : (mobileFindIndex + direction + ranges.length) % ranges.length;
    const range = ranges[nextIndex];
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setMobileFindIndex(nextIndex);
  };

  const handleShareNote = async () => {
    const shareData = { title: title.trim() || 'Ghi chú', text: editorRef.current?.innerText || '' };
    try {
      const result = await shareNoteContent(shareData.title, shareData.text);
      if (result === 'copied') toast('Đã sao chép nội dung ghi chú');
      if (result === 'unsupported') toast('Thiết bị này không hỗ trợ chia sẻ trực tiếp.');
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') toast('Không thể chia sẻ ghi chú');
    }
  };

  const handleShowAttachments = () => {
    const images = [...(editorRef.current?.querySelectorAll<HTMLImageElement>('img') || [])]
      .map((image) => ({ src: image.currentSrc || image.src, name: image.alt || 'Hình ảnh' }));
    setMobileInlineImages(images);
    setMobileSheet('attachment-browser');
  };

  if (!note) {
    return (
      <div className={`h-full flex items-center justify-center bg-app ${desktopPresentation ? 'tanooki-desktop-empty-editor' : ''}`} style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 text-tertiary" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm text-secondary" style={{ color: 'var(--text-secondary)' }}>
            Chọn một ghi chú hoặc tạo ghi chú mới
          </p>
        </div>
      </div>
    );
  }

  const folderName = folders.find((f) => f.id === note.folderId)?.name || null;
  const desktopTags = desktopPresentation ? noteTags : [];
  const runEditorHistory = (command: 'undo' | 'redo') => {
    restoreEditorSelection();
    editorRef.current?.focus();
    document.execCommand(command);
    commitEditor();
    rememberCaret();
    refreshActiveFormatting();
  };
  const mobileBackLabel = suppliedMobileBackLabel || (breadcrumb === 'Tất cả ghi chú'
    ? breadcrumb
    : folders.some((folder) => folder.name === breadcrumb) ? breadcrumb : 'Ghi chú');

  return (
    <div className={`${desktopPresentation ? 'h-full' : 'h-[100dvh] tanooki-mobile-editor'} min-h-0 min-w-0 flex flex-col bg-app ${desktopPresentation ? 'tanooki-desktop-editor' : `is-writing ${mobileKeyboardOpen ? 'is-keyboard-open' : ''}`} ${!desktopPresentation && mobilePaperMode ? 'is-light-paper' : ''}`} style={{ backgroundColor: 'var(--bg)', ...(!desktopPresentation && mobileKeyboardOpen && mobileKeyboardViewport.height > 0 ? { position: 'fixed', top: `${mobileKeyboardViewport.offsetTop}px`, right: 0, left: 0, height: `${mobileKeyboardViewport.height}px` } : {}) }}>
      {/* Toolbar */}
      <div
        className={`${desktopPresentation ? 'flex items-center justify-between gap-3 px-3 py-2 border-b flex-shrink-0 tanooki-editor-topbar' : 'hidden'}`}
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            className="lg:hidden p-2 rounded-lg hover-bg text-secondary"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Quay lại"
          >
            <ChevronLeft size={20} />
          </button>
          {folderName && !desktopPresentation && (
            <span className="text-xs text-tertiary px-2 hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
              {folderName}
            </span>
          )}
          {desktopPresentation && <div className="tanooki-editor-breadcrumb"><span>{breadcrumb}</span><span aria-hidden="true">/</span><strong>{title.trim() || 'Chưa có tiêu đề'}</strong></div>}
        </div>

        <div className="flex items-center gap-1">
          {desktopPresentation && note.syncPending === true && <span className="tanooki-editor-sync-status" role="status">Đang chờ đồng bộ</span>}
          {desktopPresentation && onToggleToolsPanel && <button type="button" onClick={onToggleToolsPanel} aria-label="Công cụ chỉnh sửa" aria-controls="tanooki-desktop-editor-tools" aria-expanded={toolsPanelOpen} className="tanooki-editor-action tanooki-info-toggle" title="Công cụ chỉnh sửa"><SlidersHorizontal size={18} /></button>}
          {desktopPresentation && <>
            <button type="button" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => runEditorHistory('undo')} className="tanooki-editor-action" aria-label="Hoàn tác" title="Hoàn tác"><Undo2 size={18} aria-hidden="true" /></button>
            <button type="button" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => runEditorHistory('redo')} className="tanooki-editor-action" aria-label="Làm lại" title="Làm lại"><Redo2 size={18} aria-hidden="true" /></button>
            <button type="button" onClick={() => { void handleShareNote(); }} className="tanooki-editor-action" aria-label="Chia sẻ ghi chú" title="Chia sẻ"><Share2 size={18} aria-hidden="true" /></button>
          </>}
          <button
            onClick={() => onTogglePin(note.id)}
            className={`p-2 rounded-lg hover-bg text-secondary transition-colors ${desktopPresentation ? 'tanooki-editor-action' : ''}`}
            style={{ color: note.pinned ? 'var(--accent)' : 'var(--text-secondary)' }}
            aria-label={note.pinned ? 'Bỏ ghim' : 'Ghim'}
            title={note.pinned ? 'Bỏ ghim' : 'Ghim'}
          >
            {note.pinned ? <Pin size={18} fill="currentColor" /> : <Pin size={18} />}
          </button>

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setMenuOpen(!menuOpen); setMoveOpen(false); }}
              className="p-2 rounded-lg hover-bg text-secondary transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Tùy chọn ghi chú"
              title="Tùy chọn ghi chú"
            >
              <MoreHorizontal size={18} />
            </button>

            {desktopPresentation && menuOpen && (
              <div
                className="absolute right-0 top-10 z-50 w-48 rounded-xl shadow-xl border py-1 animate-scale-in"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <MenuBtn
                  icon={note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  label={note.pinned ? 'Bỏ ghim' : 'Ghim'}
                  onClick={() => { onTogglePin(note.id); setMenuOpen(false); }}
                />
                <MenuBtn
                  icon={note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  label={note.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
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
                    <span className="flex-1">Chuyển đến...</span>
                    <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  {moveOpen && (
                    <div
                      className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl shadow-xl border py-1 animate-scale-in"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuBtn
                        label="Không có thư mục"
                        onClick={() => { onMove(note.id, null); setMenuOpen(false); setMoveOpen(false); }}
                      />
                      {getFolderHierarchy(folders).map(({ folder: f, depth }) => (
                        <MenuBtn
                          key={f.id}
                          icon={<FolderIcon size={14} />}
                          label={getFolderOptionLabel(f, depth)}
                          onClick={() => { onMove(note.id, f.id); setMenuOpen(false); setMoveOpen(false); }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                <MenuBtn
                  icon={<Trash2 size={15} />}
                  label="Chuyển vào thùng rác"
                  danger
                  onClick={() => { onTrash(note.id); setMenuOpen(false); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {!desktopPresentation && <header className="tanooki-mobile-editor-header">
        <button type="button" onClick={() => {
          flushCurrentDraft();
          clearSelection();
          onBack();
        }} className="tanooki-mobile-editor-back" aria-label={`Quay lại ${mobileBackLabel}`} title={`Quay lại ${mobileBackLabel}`}><ChevronLeft size={21} /><span>{mobileBackLabel}</span></button>
        <div className="tanooki-mobile-editor-header-actions">
          <button type="button" className="tanooki-mobile-editor-icon" onClick={() => { editorRef.current?.focus(); document.execCommand('undo'); commitEditor(); }} aria-label="Hoàn tác" title="Hoàn tác"><Undo2 size={19} /></button>
          <button type="button" className="tanooki-mobile-editor-icon" onClick={() => { editorRef.current?.focus(); document.execCommand('redo'); commitEditor(); }} aria-label="Làm lại" title="Làm lại"><Redo2 size={19} /></button>
          <button type="button" className="tanooki-mobile-editor-icon" onClick={() => { void handleShareNote(); }} aria-label="Chia sẻ ghi chú" title="Chia sẻ"><Share2 size={19} /></button>
          <button type="button" className="tanooki-mobile-editor-icon" onClick={() => setMobileSheet('actions')} aria-label="Tùy chọn ghi chú" aria-haspopup="dialog" aria-controls="tanooki-mobile-editor-more-popover" aria-expanded={mobileSheet === 'actions'} title="Tùy chọn"><MoreHorizontal size={21} /></button>
        </div>
      </header>}

      {!desktopPresentation && mobileFindOpen && <div className="tanooki-mobile-note-find">
        <Search size={18} aria-hidden="true" />
        <input id="tanooki-mobile-find-input" value={mobileFindQuery} onChange={(event) => { setMobileFindQuery(event.target.value); setMobileFindIndex(-1); }} placeholder="Tìm trong ghi chú" aria-label="Tìm trong ghi chú" />
        <span aria-live="polite">{mobileFindCount ? `${mobileFindIndex + 1}/${mobileFindCount}` : '0/0'}</span>
        <button type="button" aria-label="Kết quả trước" onClick={() => findInNote(-1)}><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Kết quả tiếp theo" onClick={() => findInNote(1)}><ChevronRight size={18} /></button>
        <button type="button" aria-label="Đóng tìm trong ghi chú" onClick={() => { setMobileFindOpen(false); setMobileFindQuery(''); setMobileFindIndex(-1); setMobileFindCount(0); }}><X size={18} /></button>
      </div>}

      {!desktopPresentation && (noteTags.length > 0 || mobileWriting) && <div className="tanooki-mobile-visible-tags" aria-label="Thẻ của ghi chú">
        <div className="tanooki-tag-chips">
          {noteTags.map((tag) => <span className="tanooki-tag-chip" key={tag}>
            <button
              type="button"
              className="tanooki-tag-open"
              onClick={() => { flushCurrentDraft(); clearSelection(); onOpenTag(tag); }}
              aria-label={`Lọc theo thẻ ${tag}`}
            >#{tag}</button>
          </span>)}
        </div>
        {mobileWriting && <button type="button" className="tanooki-mobile-tag-add" onClick={() => setMobileSheet('tools')}>
          <span aria-hidden="true">+</span> Thêm thẻ
        </button>}
      </div>}

      {desktopPresentation && <section className="tanooki-editor-document-header">
        <div className="tanooki-editor-document-title-row">
          <input value={title} onChange={(e) => handleTitleChange(e.target.value)} onPaste={handlePaste} placeholder="Chưa có tiêu đề" aria-label="Tiêu đề ghi chú" className="tanooki-editor-title" style={{ color: 'var(--text)' }} />
        </div>
        <NoteTagManager className="tanooki-editor-tags" tags={desktopTags} existingTags={existingTags} onAddTag={addNoteTag} onRemoveTag={removeNoteTag} onOpenTag={onOpenTag} />
      </section>}

      <div className="hidden" aria-hidden="true">
        <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} />
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={handleFileSelect} />
        <input ref={mobileAttachmentInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.rtf,.csv,.json,.zip,.7z,.pages,.numbers,.key" multiple onChange={handleFileSelect} />
      </div>

      {desktopPresentation && <nav className="tanooki-editor-format-toolbar" aria-label="Định dạng và chèn nội dung">
        <div className="tanooki-editor-format-toolbar-inner">
          {MOBILE_FORMATTING_GROUPS.map((group) => <div key={group.label} className="tanooki-editor-format-group" role="group" aria-label={group.label}>
            {group.actions.map((action) => <button key={action.id} type="button" className={`tanooki-editor-format-button format-${action.id}${action.id === 'quote' || action.id === 'code' ? ' format-overflow-action' : ''}`} aria-label={action.name} title={action.name} aria-pressed={activeFormatting.includes(action.id)} onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => handleMobileFormat(action.id)}><span aria-hidden="true">{action.id === 'insertUnorderedList' ? <List size={17} /> : action.id === 'insertOrderedList' ? <ListOrdered size={17} /> : action.id === 'checklist' ? <ListChecks size={17} /> : action.id === 'quote' ? <Quote size={17} /> : action.id === 'code' ? <Code2 size={17} /> : action.label}</span></button>)}
          </div>)}
          <div className="tanooki-editor-format-group tanooki-editor-media-group" role="group" aria-label="Tệp và hình ảnh">
            <button type="button" className="tanooki-editor-format-button" aria-label="Đính kèm tệp" title="Đính kèm tệp" disabled={uploading} onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => fileInputRef.current?.click()}>{uploading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Paperclip size={17} aria-hidden="true" />}</button>
            <button type="button" className="tanooki-editor-format-button" aria-label="Thêm hình ảnh" title="Thêm hình ảnh" disabled={uploading} onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => imageInputRef.current?.click()}><ImageIcon size={17} aria-hidden="true" /></button>
            <button type="button" className="tanooki-editor-format-button" aria-label="Vẽ / Markup" title="Vẽ / Markup" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => { rememberCaret(); setDrawingOpen(true); }}><PenTool size={17} aria-hidden="true" /></button>
          </div>
          <details className="tanooki-editor-format-overflow">
            <summary className="tanooki-editor-format-button" aria-label="Thêm công cụ định dạng" title="Thêm công cụ định dạng"><MoreHorizontal size={18} aria-hidden="true" /></summary>
            <div className="tanooki-editor-format-overflow-menu" role="group" aria-label="Công cụ định dạng bổ sung">
              <button type="button" className="tanooki-editor-format-button" aria-label="Trích dẫn" title="Trích dẫn" aria-pressed={activeFormatting.includes('quote')} onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={(event) => { handleMobileFormat('quote'); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Quote size={17} aria-hidden="true" /></button>
              <button type="button" className="tanooki-editor-format-button" aria-label="Khối mã" title="Khối mã" aria-pressed={activeFormatting.includes('code')} onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={(event) => { handleMobileFormat('code'); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Code2 size={17} aria-hidden="true" /></button>
              <button type="button" className="tanooki-editor-format-button" aria-label="Đính kèm tệp" title="Đính kèm tệp" disabled={uploading} onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={(event) => { fileInputRef.current?.click(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{uploading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Paperclip size={17} aria-hidden="true" />}</button>
              <button type="button" className="tanooki-editor-format-button" aria-label="Thêm hình ảnh" title="Thêm hình ảnh" disabled={uploading} onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={(event) => { imageInputRef.current?.click(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><ImageIcon size={17} aria-hidden="true" /></button>
              <button type="button" className="tanooki-editor-format-button" aria-label="Vẽ / Markup" title="Vẽ / Markup" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={(event) => { rememberCaret(); setDrawingOpen(true); event.currentTarget.closest('details')?.removeAttribute('open'); }}><PenTool size={17} aria-hidden="true" /></button>
            </div>
          </details>
          {uploading && <span className="tanooki-editor-upload-status" role="status" aria-live="polite"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Đang tải {uploadsInProgress} tệp lên…</span>}
        </div>
      </nav>}

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
          }}>Dùng phiên bản trên thiết bị khác</button>
          <button type="button" className="rounded border px-3 py-1" onClick={() => {
            const incoming = syncConflict;
            setSyncConflict(null); conflictRef.current = false;
            acceptedRef.current = {id: incoming.id,title:incoming.title,content:incoming.content};
            onUpdate(incoming.id, titleRef.current, contentRef.current);
          }}>Giữ lại chỉnh sửa của tôi</button>
        </div>
      </div>}

      {/* Editor area */}
      <div ref={editorScrollRef} className={`flex-1 overflow-y-auto ${desktopPresentation ? 'tanooki-editor-scroll' : 'tanooki-mobile-editor-scroll'}`} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <div className={desktopPresentation ? 'tanooki-editor-canvas' : 'tanooki-mobile-editor-canvas'} onPointerDown={placeCaretAtBlankTap}>
          {!desktopPresentation && <input value={title} onChange={(event) => handleTitleChange(event.target.value)} onKeyDown={handleMobileTitleKeyDown} onPaste={handlePaste} placeholder="Chưa có tiêu đề" aria-label="Tiêu đề ghi chú" className="tanooki-mobile-editor-document-title" />}
          <div
            ref={editorRef}
            contentEditable={canEdit}
            suppressContentEditableWarning
            aria-readonly={!canEdit}
            onInput={() => {
              const pending = checklistCaretHandoff.current;
              const selection = window.getSelection();
              if (pending && selection?.anchorNode && pending.text.contains(selection.anchorNode)) checklistCaretHandoff.current = null;
              else if (pending) describeChecklistSelection('typed input landed outside pending checklist row', pending.text, pending.row);
              cleanChecklistCaretAnchors(editorRef.current);
              commitEditor();

            }}
            onPaste={handlePaste}
            onKeyUp={rememberCaret}
            onMouseUp={rememberCaret}
            onTouchEnd={rememberCaret}
            onPointerDown={e => { const target = e.target as HTMLElement; const pending = checklistCaretHandoff.current; if (pending && !pending.text.contains(target)) checklistCaretHandoff.current = null; if (target.closest('[data-note-checklist-toggle]')) { rememberCaret(); return; } if (e.target === e.currentTarget && placeCaretAtBlankTap(e)) return; if (!canEdit) return; if (!onInlinePointerDown(e)) onImagePointerDown(e); }}
            onPointerMove={e => { if (!canEdit) return; if (!onInlinePointerMove(e)) onImagePointerMove(e); }}
            onPointerUp={e => { if (!canEdit) return; if (!onInlinePointerEnd(e)) onImagePointerUp(e); rememberCaret(); }}
            onPointerCancel={(e) => {
              if (!canEdit) return;
              onInlinePointerEnd(e, true);
              onImagePointerUp(e, true);
            }}
            onContextMenu={(e) => {
              if (!canEdit) return;
              const inlineNode = (e.target as HTMLElement).closest<HTMLElement>(attachmentSelector);
              if (inlineNode) { e.preventDefault(); selectInlineAttachment(inlineNode); }
              else if (e.target instanceof HTMLImageElement) { e.preventDefault(); selectImage(e.target); }
            }}
            onClick={(e) => {
              const checklistToggle = (e.target as HTMLElement).closest('[data-note-checklist-toggle]');
              if (checklistToggle) { handleChecklistClick(e); return; }
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
                if (!canEdit) { setImageViewer(e.target.src); setViewerScale(1); }
                else if (selectedImage !== e.target) selectImage(e.target);
              } else { clearSelection(); rememberCaret(); }
            }}
            onBeforeInput={handleChecklistBeforeInput}
            onKeyDown={handleChecklistEnter}
            onCompositionStart={handleChecklistCompositionStart}
            onCompositionEnd={handleChecklistCompositionEnd}
            data-placeholder="Bắt đầu viết ghi chú của bạn..."
            className={`note-content editor-content w-full outline-none text-app leading-relaxed ${desktopPresentation ? '' : 'text-sm'}`}
            style={{ color: 'var(--text)' }}
          />

          {/* Attachments section */}
          {unplacedAttachments.length > 0 && (
            <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                Tệp chưa được chèn vào nội dung ({unplacedAttachments.length})
              </h3>
              <div className="space-y-2" onPointerMove={(e) => {
                if (!canEdit) return;
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
                if (!canEdit) return;
                const g = attachmentGesture.current;
                if (g?.mode === 'drag') {
                  const card = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-attachment-id]')].find(el => el.dataset.attachmentId === g.id);
                  if (card) card.style.pointerEvents = 'none';
                  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-attachment-id]')?.getAttribute('data-attachment-id');
                  if (card) { card.style.transform = ''; card.style.position = ''; card.style.zIndex = ''; card.style.pointerEvents = ''; }
                  if (target && target !== g.id) moveAttachment(g.id, target);
                }
                attachmentGesture.current = null;
              }} onPointerCancel={() => { if (canEdit) attachmentGesture.current = null; }}>
                {unplacedAttachments.map((att, index) => (
                  <div key={att.id} data-attachment-id={att.id} className="relative" style={{ width: `${attachmentLayout.widths[att.id] || 100}%`, maxWidth: '100%', touchAction: selectedAttachmentId === att.id ? 'none' : 'auto' }}
                    onPointerDown={(e) => {
                      if (!canEdit) return;
                      if ((e.target as HTMLElement).closest('.noted-attachment-toolbar, .noted-attachment-resize-handle, [data-note-attachment-action]')) return;
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
                      if (!canEdit) return;
                      const start = attachmentPressStart.current;
                      if (attachmentLongPress.current && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 9) {
                        clearTimeout(attachmentLongPress.current); attachmentLongPress.current = null;
                      }
                    }}
                    onPointerUp={() => {
                      if (!canEdit) return;
                      if (attachmentLongPress.current) clearTimeout(attachmentLongPress.current);
                      attachmentLongPress.current = null;
                      attachmentPressStart.current = null;
                    }}
                    onPointerCancel={() => {
                      if (!canEdit) return;
                      if (attachmentLongPress.current) clearTimeout(attachmentLongPress.current);
                      attachmentLongPress.current = null;
                      attachmentPressStart.current = null;
                      attachmentGesture.current = null;
                    }}
                    onContextMenu={(e) => { if (!canEdit) return; e.preventDefault(); setSelectedAttachmentId(att.id); }}>
                    {canEdit && <div className="mb-1 flex justify-end"><button type="button" className="text-xs px-2 py-1 rounded-lg border" onClick={() => insertAttachmentAtCaret(att)}>Chèn tại vị trí con trỏ ↑</button></div>}
                    <AttachmentItem attachment={att} selected={selectedAttachmentId === att.id} actionsEnabled={canEdit} mobilePreview={!desktopPresentation}
                      onSelect={() => { setSelectedImage(null); setSelectedAttachmentId(att.id); }}
                      onOpen={() => { if (selectedAttachmentId !== att.id) void handleOpenAttachment(att); }}
                      onDelete={() => handleDeleteAttachment(att)} />
                    {selectedAttachmentId === att.id && <button className="noted-attachment-resize-handle" title="Kéo để đổi kích thước thẻ tệp" aria-label="Kéo để đổi kích thước thẻ tệp" onPointerDown={e => {
                      e.preventDefault(); e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      attachmentGesture.current = { id: att.id, x: e.clientX, y: e.clientY, width: attachmentLayout.widths[att.id] || 100, mode: 'resize' };
                    }} onPointerUp={() => { attachmentGesture.current = null; }}><Maximize2 size={14}/></button>}
                    {selectedAttachmentId === att.id && <div className="noted-attachment-toolbar" onPointerDown={e => e.stopPropagation()}>
                      <button onClick={() => handleOpenAttachment(att)}>Mở</button>
                      <button onClick={() => renameAttachment(att)}><Edit3 size={14} /> Đổi tên</button>
                      {!desktopPresentation && <button onClick={() => void handleShareAttachment(att)}><Share2 size={14} /> Chia sẻ / Xuất</button>}
                      <button aria-label="Di chuyển tệp đính kèm lên" disabled={index === 0} onClick={() => moveAttachment(att.id, unplacedAttachments[index-1].id)}><ArrowUp size={15}/></button>
                      <button aria-label="Di chuyển tệp đính kèm xuống" disabled={index === unplacedAttachments.length-1} onClick={() => {
                        const ids = orderedAttachments.map(a => a.id);
                        const nextId = unplacedAttachments[index+1].id;
                        const from = ids.indexOf(att.id), to = ids.indexOf(nextId);
                        ids.splice(from, 1); ids.splice(to, 0, att.id);
                        commitLayout({ ...layoutRef.current, order: ids });
                      }}><ArrowDown size={15}/></button>
                      <button aria-label="Thu hẹp thẻ tệp" title="Thu hẹp thẻ tệp" onClick={() => setAttachmentWidth(att.id, (attachmentLayout.widths[att.id] || 100)-10)}>−</button>
                      <button aria-label="Mở rộng thẻ tệp" title="Mở rộng thẻ tệp" onClick={() => setAttachmentWidth(att.id, (attachmentLayout.widths[att.id] || 100)+10)}>+</button>
                      <button className="noted-danger" onClick={() => handleDeleteAttachment(att)}><Trash2 size={14}/> Xóa</button>
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
            <button onClick={() => void handleOpenAttachment(att)}>Mở</button>
            <button title="Đổi tên hiển thị của tệp" onClick={async () => {
              const name = window.prompt('Đổi tên tệp đính kèm', att.name);
              if (!name?.trim() || name.trim() === att.name) return;
              const ok = await onRenameAttachment(att.id, name.trim());
              if (ok) {
                const nameNode = selectedInlineAttachment.querySelector<HTMLElement>('.noted-inline-attachment-name');
                if (nameNode) nameNode.textContent = name.trim();
                commitEditor();
              }
              toast(ok ? 'Đã đổi tên' : 'Không thể đổi tên');
            }}><Edit3 size={14} /> Đổi tên</button>
            {!desktopPresentation && <button onClick={() => void handleShareAttachment(att)}><Share2 size={14} /> Chia sẻ / Xuất</button>}
            <button title="Thu hẹp thẻ" aria-label="Thu hẹp thẻ" onClick={() => resizeInlineAttachment(selectedInlineAttachment, widthPct - 10)}>−</button>
            <button title="Mở rộng thẻ" aria-label="Mở rộng thẻ" onClick={() => resizeInlineAttachment(selectedInlineAttachment, widthPct + 10)}>+</button>
            <button title="Gỡ khỏi nội dung mà không xóa tệp" onClick={() => unlinkInlineAttachment(selectedInlineAttachment)}>Gỡ khỏi ghi chú</button>
            <button className="noted-danger" onClick={() => void handleDeleteAttachment(att)}><Trash2 size={14} /> Xóa</button>
            <button onClick={() => { setSelectedInlineAttachment(null); setInlineFrame(null); }} title="Bỏ chọn" aria-label="Bỏ chọn"><X size={15}/></button>
          </div>
          <button aria-label="Kéo để đổi kích thước tệp đính kèm" className="noted-image-handle" style={{left:inlineFrame.right,top:inlineFrame.bottom,cursor:'ew-resize'}}
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
          <button onClick={() => setMoveImageMode(v => !v)} aria-pressed={moveImageMode} title="Kéo để di chuyển"> <Move size={16}/> {moveImageMode ? 'Đang di chuyển' : 'Di chuyển'}</button>
          <button onClick={() => {setFreeResize(v=>!v);}} aria-pressed={freeResize} title="Bật hoặc tắt đổi kích thước tự do"><Maximize2 size={16}/> {freeResize ? 'Tự do' : 'Giữ tỷ lệ'}</button>
          <button onClick={() => {setImageViewer(selectedImage.src);setViewerScale(1);}}>Xem trước</button>
          <button onClick={() => duplicateImage(selectedImage)} title="Nhân bản hình ảnh" aria-label="Nhân bản hình ảnh"><Copy size={16}/></button>
          <button className="noted-danger" onClick={() => handleRemoveImage(selectedImage.src)} title="Xóa hình ảnh" aria-label="Xóa hình ảnh"><Trash2 size={16}/></button>
          <button onClick={clearSelection} title="Bỏ chọn" aria-label="Bỏ chọn"><X size={16}/></button>
        </div>
        {(['nw','n','ne','e','se','s','sw','w'] as const).map(handle => {
          const left = handle.includes('w') ? imageFrame.left : handle.includes('e') ? imageFrame.right : (imageFrame.left + imageFrame.right) / 2;
          const top = handle.includes('n') ? imageFrame.top : handle.includes('s') ? imageFrame.bottom : (imageFrame.top + imageFrame.bottom) / 2;
          return <button key={handle} className="noted-image-handle" aria-label={`Đổi kích thước ${handle}`} style={{left,top,cursor:`${handle}-resize`}}
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

      {!desktopPresentation && uploading && <div className="tanooki-mobile-upload-status" role="status" aria-live="polite"><Loader2 size={15} className="animate-spin" />Đang tải {uploadsInProgress} tệp lên…</div>}
      {!desktopPresentation && <MobileFormattingSheet open={mobileSheet === 'formatting'} activeActions={activeFormatting} onBeforeFormat={rememberCaret} onClose={() => {
        setMobileSheet(null);
        window.requestAnimationFrame(() => restoreEditorSelection());
      }} onFormat={handleMobileFormat} />}
      {!desktopPresentation && <nav className="tanooki-mobile-editor-bottom-bar" aria-label="Công cụ ghi chú">
        <button type="button" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => { rememberCaret(); refreshActiveFormatting(); setMobileSheet((current) => current === 'formatting' ? null : 'formatting'); }} aria-label="Định dạng (Aa)" aria-pressed={mobileSheet === 'formatting'} title="Định dạng"><span className="tanooki-mobile-format-aa">Aa</span></button>
        {mobileKeyboardOpen && <button type="button" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => handleMobileFormat('checklist')} aria-label="Checklist" aria-pressed={activeFormatting.includes('checklist')} title="Checklist"><ListChecks size={23} /></button>}
        <button type="button" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => mobileAttachmentInputRef.current?.click()} aria-label="Đính kèm" title="Đính kèm"><Paperclip size={25} /></button>
        <button type="button" onPointerDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => { rememberCaret(); setDrawingOpen(true); }} aria-label="Vẽ và đánh dấu" title="Vẽ và đánh dấu"><PenTool size={25} /></button>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={onCreateNote} aria-label="Tạo ghi chú mới" title="Tạo ghi chú mới"><SquarePen size={25} /></button>
      </nav>}

      {!desktopPresentation && <>
        <MobileEditorToolsSheet note={note} folders={folders} attachments={attachments} tags={noteTags} existingTags={existingTags} onAddTag={addNoteTag} onRemoveTag={removeNoteTag} onOpenTag={onOpenTag} open={mobileSheet === 'tools'} onClose={() => setMobileSheet(null)} />
        <MobileAttachmentBrowserSheet open={mobileSheet === 'attachment-browser'} onClose={() => setMobileSheet(null)} attachments={attachments} images={mobileInlineImages} onOpen={(attachment) => void handleOpenAttachment(attachment)} onRename={renameAttachment} onShare={(attachment) => void handleShareAttachment(attachment)} onDelete={(attachment) => void handleDeleteAttachment(attachment)} onOpenImage={(image) => { setImageViewer(image.src); setViewerScale(1); }} onShareImage={(image) => void handleShareInlineImage(image)} onDeleteImage={(image) => handleRemoveImage(image.src)} />
        <MobileEditorMorePopover note={note} folders={folders} open={mobileSheet === 'actions'} onClose={() => setMobileSheet(null)} onTogglePin={onTogglePin} onArchive={onArchive} onMove={onMove} onDuplicate={onDuplicate} onTrash={onTrash} onFind={openMobileFind} onNavigateRecent={() => { flushCurrentDraft(); onNavigateRecent(); }} onTogglePaper={() => { setMobileSheet(null); setMobilePaperMode((value) => !value); }} onShowAttachments={handleShowAttachments} paperMode={mobilePaperMode} />
      </>}

      {drawingOpen && <MobileDrawingMarkup
        onCancel={() => setDrawingOpen(false)}
        onBlankDone={() => { setDrawingOpen(false); toast('Chưa có nét vẽ để thêm'); }}
        onDone={(image) => { setDrawingOpen(false); void handleImageUpload(image); }}
      />}

      {/* Image viewer modal */}
      {imageViewer && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setImageViewer(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setImageViewer(null)}
            aria-label="Đóng xem trước hình ảnh"
            title="Đóng"
          >
            <X size={24} />
          </button>
          {canEdit && <button type="button" className="absolute top-4 left-4 rounded bg-black/70 px-3 py-2 text-white" onClick={() => { handleRemoveImage(imageViewer); setImageViewer(null); }}>Xóa hình ảnh</button>}
          <img
            src={imageViewer}
            alt="Xem trước hình ảnh"
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
  actionsEnabled,
  mobilePreview,
  onSelect,
  onOpen,
  onDelete,
}: {
  attachment: Attachment;
  selected: boolean;
  actionsEnabled: boolean;
  mobilePreview: boolean;
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
      default: return attachment.type.startsWith('video/') ? <Video size={20} /> : <FileIcon size={20} />;
    }
  })();

  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-lg border transition-colors hover-bg"
      style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className={`flex-shrink-0${mobilePreview ? ' tanooki-mobile-attachment-icon' : ''}`} style={{ color: 'var(--text-tertiary)' }}>
        {mobilePreview && attachment.type.startsWith('image/') && attachment.url
          ? <img src={attachment.url} alt="" loading="lazy" />
          : icon}
      </div>
      <button
        onClick={onOpen}
        onContextMenu={e => { if (!actionsEnabled) return; e.preventDefault(); onSelect(); }}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium truncate text-app" style={{ color: 'var(--text)' }}>
          {attachment.name}
        </div>
        <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
          {fileType} · {formatFileSize(attachment.size)} · Đã tải lên
        </div>
      </button>
      <button
        onClick={onOpen}
        className="flex-shrink-0 p-1.5 rounded-lg hover-bg text-tertiary transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Mở tệp"
        data-note-attachment-action="open"
      >
        <Download size={16} />
      </button>
      {actionsEnabled && <button
        onClick={onDelete}
        className="flex-shrink-0 p-1.5 rounded-lg hover-bg text-tertiary transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Xóa tệp đính kèm"
        data-note-attachment-action="remove"
      >
        <X size={16} />
      </button>}
    </div>
  );
}
