export function announceDesktopContextMenu() {
  window.dispatchEvent(new Event('tanooki:desktop-context-menu-open'));
}

export function openDesktopMenuWithKeyboard(event: import('react').KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  event.preventDefault();
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true, clientX: bounds.left + 12, clientY: bounds.top + 12,
  }));
}
