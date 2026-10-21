import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';
const CONTEXT_SURFACE_SELECTOR = '[data-mobile-context-kind="note"], [data-mobile-context-kind="folder"]';

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR));
}

function preventContextSelection(event: Event) {
  const hit = event.target instanceof Element ? event.target : null;
  if (!hit?.closest(CONTEXT_SURFACE_SELECTOR) || isEditableTarget(hit)) return;
  event.preventDefault();
}

export interface MobileContextTarget {
  kind: 'note' | 'folder';
  id: string;
  title: string;
  detail?: string;
  preview?: string;
  rect: DOMRect;
  scrollElement: HTMLElement | null;
}

export function useMobileLongPress(onOpen: (target: MobileContextTarget) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number; pointerId: number; element: HTMLElement; target: MobileContextTarget } | null>(null);
  const firedElement = useRef<HTMLElement | null>(null);
  const suppressClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  useEffect(() => () => {
    cancel();
    if (suppressClickTimer.current) clearTimeout(suppressClickTimer.current);
  }, []);

  useEffect(() => {
    // Native selectstart is not exposed by React's DOM event types. Keep a
    // capture listener scoped to marked rows, and remove it with this hook.
    document.addEventListener('selectstart', preventContextSelection, true);
    return () => document.removeEventListener('selectstart', preventContextSelection, true);
  }, []);

  return {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' || event.button !== 0) return;
      const hit = event.target instanceof Element ? event.target : null;
      if (!hit || hit.closest('[data-context-ignore]')) return;
      const element = hit.closest<HTMLElement>('[data-mobile-context-kind]');
      if (!element) return;
      const kind = element.dataset.mobileContextKind;
      const id = element.dataset.mobileContextId;
      if ((kind !== 'note' && kind !== 'folder') || !id) return;
      let scrollElement: HTMLElement | null = element.parentElement;
      while (scrollElement && scrollElement !== document.body) {
        const overflowY = window.getComputedStyle(scrollElement).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && scrollElement.scrollHeight > scrollElement.clientHeight) break;
        scrollElement = scrollElement.parentElement;
      }
      const target: MobileContextTarget = {
        kind,
        id,
        title: element.dataset.mobileContextTitle || '',
        detail: element.dataset.mobileContextDetail || undefined,
        preview: element.dataset.mobileContextPreview || undefined,
        rect: element.getBoundingClientRect(),
        scrollElement: scrollElement === document.body ? null : scrollElement,
      };
      start.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, element, target };
      timer.current = setTimeout(() => {
        const pending = start.current;
        if (!pending) return;
        pending.target.rect = pending.element.getBoundingClientRect();
        firedElement.current = pending.element;
        if (suppressClickTimer.current) clearTimeout(suppressClickTimer.current);
        suppressClickTimer.current = setTimeout(() => { firedElement.current = null; }, 1000);
        // iOS may have started selecting the row before the custom overlay is mounted.
        window.getSelection()?.removeAllRanges();
        onOpenRef.current(pending.target);
      }, 450);
    },
    onPointerMoveCapture: (event: ReactPointerEvent<HTMLElement>) => {
      const pending = start.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10) cancel();
    },
    onPointerUpCapture: (event: ReactPointerEvent<HTMLElement>) => {
      if (start.current?.pointerId === event.pointerId) cancel();
    },
    onPointerCancelCapture: cancel,
    onContextMenuCapture: (event: ReactMouseEvent<HTMLElement>) => {
      const hit = event.target instanceof Element ? event.target : null;
      if (!hit?.closest(CONTEXT_SURFACE_SELECTOR) || isEditableTarget(hit)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      if (firedElement.current && target && firedElement.current.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
        firedElement.current = null;
        if (suppressClickTimer.current) clearTimeout(suppressClickTimer.current);
        suppressClickTimer.current = null;
      }
    },
  };
}
