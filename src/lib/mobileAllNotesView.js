export const MOBILE_ALL_NOTES_GALLERY_KEY = 'tanooki:mobile-all-notes-gallery';

export function readMobileAllNotesGallery(storage = safeLocalStorage()) {
  try {
    return storage?.getItem(MOBILE_ALL_NOTES_GALLERY_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeMobileAllNotesGallery(enabled, storage = safeLocalStorage()) {
  try {
    storage?.setItem(MOBILE_ALL_NOTES_GALLERY_KEY, String(Boolean(enabled)));
  } catch {
    // The layout preference is optional when browser storage is unavailable.
  }
}

function safeLocalStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
