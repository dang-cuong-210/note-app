import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type DesktopMenuPoint = { x: number; y: number };

export function DesktopContextMenu({ point, onClose, children, label = 'Thao tác' }: {
  point: DesktopMenuPoint;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(point);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const margin = 8;
    setPosition({
      x: Math.max(margin, Math.min(point.x, window.innerWidth - bounds.width - margin)),
      y: Math.max(margin, Math.min(point.y, window.innerHeight - bounds.height - margin)),
    });
  }, [point]);

  useLayoutEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const closeWhenAnotherOpens = () => onClose();
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeEscape);
    window.addEventListener('tanooki:desktop-context-menu-open', closeWhenAnotherOpens);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeEscape);
      window.removeEventListener('tanooki:desktop-context-menu-open', closeWhenAnotherOpens);
    };
  }, [onClose]);

  return <div ref={menuRef} role="menu" aria-label={label} className="tanooki-desktop-context-menu" style={{ left: position.x, top: position.y }}>
    {children}
  </div>;
}
