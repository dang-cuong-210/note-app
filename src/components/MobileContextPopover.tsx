import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type { MobileContextTarget } from '@/components/useMobileLongPress';

export function MobileContextPopover({ target, children, onClose, labelledBy }: {
  target: MobileContextTarget | null;
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  useLayoutEffect(() => {
    if (!target || !menuRef.current) return;
    const rect = target.rect;
    const updatePosition = () => {
      if (!menuRef.current) return;
      const menu = menuRef.current.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const safeTop = Number.parseFloat(window.getComputedStyle(layerRef.current!).paddingTop) || 0;
      const safeBottom = Number.parseFloat(window.getComputedStyle(layerRef.current!).paddingBottom) || 0;
      const margin = 12;
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - menu.width - margin));
      const minTop = safeTop + margin;
      const maxTop = Math.max(minTop, viewportHeight - safeBottom - menu.height - margin);
      const below = rect.bottom + 10;
      const preferred = below + menu.height <= viewportHeight - safeBottom - margin
        ? below
        : rect.top - menu.height - 10;
      setPosition({ left, top: Math.max(minTop, Math.min(preferred, maxTop)) });
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
  const { rect } = target;
  return createPortal(<div ref={layerRef} className="tanooki-mobile-context-layer">
    <button type="button" className="tanooki-mobile-context-backdrop" aria-label="Đóng menu thao tác" onClick={onClose} />
    <div className="tanooki-mobile-context-highlight" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} aria-hidden="true">
      <strong>{target.title}</strong>{target.detail && <span>{target.detail}</span>}
    </div>
    <div ref={menuRef} id={labelledBy} className="tanooki-mobile-context-menu" role="menu" aria-label={`Thao tác ${target.kind === 'note' ? 'ghi chú' : 'thư mục'}`} style={position ? { left: position.left, top: position.top } : { left: Math.max(14, rect.left), top: rect.bottom + 10 }} onPointerDown={(event) => event.stopPropagation()}>
      {children}
    </div>
  </div>, document.body);
}
