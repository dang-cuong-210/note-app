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
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      .filter((button) => button.getClientRects().length > 0);
    const prepareItems = () => items().forEach((button) => {
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
    });
    prepareItems();
    items()[0]?.focus();
    const observer = new MutationObserver(prepareItems);
    observer.observe(menu, { childList: true, subtree: true });
    const navigate = (event: globalThis.KeyboardEvent) => {
      const buttons = items();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Tab') {
        // Return to the originating control before the browser advances focus.
        trigger?.focus();
        closeRef.current();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !buttons.length) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
    };
    menu.addEventListener('keydown', navigate);
    return () => {
      observer.disconnect();
      menu.removeEventListener('keydown', navigate);
      if (trigger?.isConnected && (menu.contains(document.activeElement) || document.activeElement === document.body)) trigger.focus();
    };
  }, []);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

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
