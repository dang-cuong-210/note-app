import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MobileContextTarget } from '@/components/useMobileLongPress';

export function MobileContextPopover({ target, children, onClose, labelledBy, closing = false }: {
  target: MobileContextTarget | null;
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  closing?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; previewHeight: number; menuMaxHeight: number } | null>(null);
  const [stage, setStage] = useState<'lifting' | 'backdrop' | 'preview' | 'menu' | 'closing'>('lifting');
  const closingRef = useRef(closing);
  closingRef.current = closing;

  useEffect(() => {
    if (!target) return;
    setStage('lifting');
    const sourceRows = Array.from(document.querySelectorAll<HTMLElement>('[data-mobile-context-kind]'))
      .filter((element) => element.dataset.mobileContextKind === target.kind && element.dataset.mobileContextId === target.id);
    sourceRows.forEach((element) => element.classList.add('is-context-lifting'));
    let backdropTimer: ReturnType<typeof setTimeout> | null = null;
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    let menuTimer: ReturnType<typeof setTimeout> | null = null;
    if (!closingRef.current) {
      backdropTimer = setTimeout(() => setStage('backdrop'), 32);
      previewTimer = setTimeout(() => setStage('preview'), 60);
      menuTimer = setTimeout(() => setStage('menu'), 100);
    }
    return () => {
      if (backdropTimer) clearTimeout(backdropTimer);
      if (previewTimer) clearTimeout(previewTimer);
      if (menuTimer) clearTimeout(menuTimer);
      sourceRows.forEach((element) => element.classList.remove('is-context-lifting'));
    };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    if (closing) {
      setStage('closing');
      document.querySelectorAll<HTMLElement>('[data-mobile-context-kind]')
        .forEach((element) => {
          if (element.dataset.mobileContextKind === target.kind && element.dataset.mobileContextId === target.id) {
            element.classList.remove('is-context-lifting');
          }
        });
    }
  }, [closing, target]);

  useEffect(() => {
    if (!target) return;
    // The preview is a portal rendered after the initiating gesture. Clear any
    // selection iOS retained while React mounted the context layer.
    const frame = window.requestAnimationFrame(() => window.getSelection()?.removeAllRanges());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [target, onClose]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!target || !layer) return;
    const preventSelection = (event: Event) => { event.preventDefault(); };
    layer.addEventListener('selectstart', preventSelection, true);
    return () => layer.removeEventListener('selectstart', preventSelection, true);
  }, [target]);

  useEffect(() => {
    const scrollElement = target?.scrollElement;
    if (!scrollElement) return;
    const previous = ['overflow-y', 'overscroll-behavior-y'].map((property) => ({
      property,
      value: scrollElement.style.getPropertyValue(property),
      priority: scrollElement.style.getPropertyPriority(property),
    }));
    scrollElement.style.setProperty('overflow-y', 'hidden');
    scrollElement.style.setProperty('overscroll-behavior-y', 'contain');
    return () => {
      for (const { property, value, priority } of previous) {
        if (value) scrollElement.style.setProperty(property, value, priority);
        else scrollElement.style.removeProperty(property);
      }
    };
  }, [target]);

  useLayoutEffect(() => {
    if (!target || !menuRef.current || !previewRef.current) return;
    const rect = target.rect;
    const updatePosition = () => {
      if (!menuRef.current || !previewRef.current) return;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const safeTop = Number.parseFloat(window.getComputedStyle(layerRef.current!).paddingTop) || 0;
      const safeBottom = Number.parseFloat(window.getComputedStyle(layerRef.current!).paddingBottom) || 0;
      const margin = 12;
      const minTop = viewportTop + safeTop + margin;
      const maxBottom = viewportTop + viewportHeight - safeBottom - margin;
      const availableHeight = Math.max(220, maxBottom - minTop);
      const width = Math.min(420, viewportWidth * 0.88);
      const gap = 14;
      const previewMin = target.kind === 'note' ? 164 : 62;
      const preferredPreview = target.kind === 'note'
        ? Math.min(420, Math.max(220, availableHeight * 0.44))
        : previewRef.current.getBoundingClientRect().height;
      const menu = menuRef.current;
      const naturalMenuHeight = menu.scrollHeight;
      let menuMaxHeight = Math.max(100, availableHeight - previewMin - gap);
      let menuHeight = Math.min(naturalMenuHeight, menuMaxHeight);
      let previewHeight = Math.min(preferredPreview, Math.max(previewMin, availableHeight - menuHeight - gap));
      menuMaxHeight = Math.max(100, availableHeight - previewHeight - gap);
      menuHeight = Math.min(naturalMenuHeight, menuMaxHeight);
      if (previewHeight + menuHeight + gap > availableHeight) {
        previewHeight = Math.max(previewMin, availableHeight - menuHeight - gap);
      }
      const groupHeight = previewHeight + Math.min(menuHeight, availableHeight - previewHeight - gap) + gap;
      const preferredTop = rect.top + rect.height / 2 - groupHeight / 2;
      const top = Math.max(minTop, Math.min(preferredTop, maxBottom - groupHeight));
      setPosition({ left: (viewportWidth - width) / 2, top, previewHeight, menuMaxHeight });
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(menuRef.current);
    window.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('resize', updatePosition);
    };
  }, [target]);

  if (!target || typeof document === 'undefined') return null;
  const backdropVisible = stage === 'backdrop' || stage === 'preview' || stage === 'menu';
  const previewVisible = stage === 'preview' || stage === 'menu';
  const menuVisible = stage === 'menu';
  return createPortal(<div
    ref={layerRef}
    className={`tanooki-mobile-context-layer${closing ? ' is-closing' : ''}`}
    onContextMenuCapture={(event) => { event.preventDefault(); event.stopPropagation(); }}
  >
    <button type="button" className={`tanooki-mobile-context-backdrop${backdropVisible && !closing ? ' is-visible' : ''}`} aria-label="Đóng menu thao tác" onClick={onClose} />
    <div className={`tanooki-mobile-context-group${target.kind === 'folder' ? ' is-folder' : ' is-note'}${closing ? ' is-closing' : ''}`} style={position ? { left: position.left, top: position.top } : { left: 12, top: 12, visibility: 'hidden' }}>
      <div ref={previewRef} className={`tanooki-mobile-context-highlight${target.kind === 'folder' ? ' is-folder' : ' is-note'}${previewVisible && !closing ? ' is-visible' : ''}`} style={position && target.kind === 'note' ? { height: position.previewHeight } : undefined}>
        {target.kind === 'folder' ? <><Folder size={24} aria-hidden="true" /><strong>{target.title}</strong><span>{target.detail}</span></> : <><strong>{target.title}</strong><div className="tanooki-mobile-context-preview-body">{target.preview || target.detail || 'Chưa có nội dung'}</div></>}
      </div>
      <div ref={menuRef} id={labelledBy} className={`tanooki-mobile-context-menu${menuVisible && !closing ? ' is-visible' : ''}`} role="menu" aria-label={`Thao tác ${target.kind === 'note' ? 'ghi chú' : 'thư mục'}`} style={position ? { maxHeight: position.menuMaxHeight } : { maxHeight: '60dvh' }} onPointerDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  </div>, document.body);
}
