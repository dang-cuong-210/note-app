import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

export interface MobileContextTarget {
  kind: 'note' | 'folder';
  id: string;
  title: string;
  detail?: string;
  rect: DOMRect;
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
      const target: MobileContextTarget = {
        kind,
        id,
        title: element.dataset.mobileContextTitle || '',
        detail: element.dataset.mobileContextDetail || undefined,
        rect: element.getBoundingClientRect(),
      };
      start.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, element, target };
      timer.current = setTimeout(() => {
        const pending = start.current;
        if (!pending) return;
        firedElement.current = pending.element;
        if (suppressClickTimer.current) clearTimeout(suppressClickTimer.current);
        suppressClickTimer.current = setTimeout(() => { firedElement.current = null; }, 1000);
        onOpenRef.current(pending.target);
      }, 500);
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
