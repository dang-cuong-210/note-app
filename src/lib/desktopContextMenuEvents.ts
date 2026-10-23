export function announceDesktopContextMenu() {
  window.dispatchEvent(new Event('tanooki:desktop-context-menu-open'));
}
