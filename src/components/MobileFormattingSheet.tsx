import { MOBILE_FORMATTING_GROUPS } from '@/lib/mobileFormatting.js';

interface MobileFormattingSheetProps {
  open: boolean;
  activeActions: string[];
  onClose: () => void;
  onFormat: (actionId: string) => void;
  onBeforeFormat?: () => void;
}

/** Compact, keyboard-adjacent formatting controls for the mobile editor. */
export function MobileFormattingSheet({ open, activeActions, onClose, onFormat, onBeforeFormat }: MobileFormattingSheetProps) {
  if (!open) return null;
  const active = new Set(activeActions);
  return <div className="tanooki-mobile-format-toolbar" role="toolbar" aria-label="Định dạng văn bản">
    <div className="tanooki-mobile-format-toolbar-actions">
      {MOBILE_FORMATTING_GROUPS.flatMap((group) => group.actions).map((action) => <button
        type="button"
        key={action.id}
        aria-label={action.name}
        aria-pressed={active.has(action.id)}
        className={`${active.has(action.id) ? 'is-active' : ''} ${['bold', 'italic', 'underline', 'strikeThrough'].includes(action.id) ? `format-${action.id}` : ''}`}
        onPointerDown={(event) => { event.preventDefault(); onBeforeFormat?.(); }}
        onClick={() => onFormat(action.id)}
      >{action.label}</button>)}
    </div>
    <button type="button" className="tanooki-mobile-format-close" aria-label="Thu gọn định dạng" title="Thu gọn" onPointerDown={(event) => event.preventDefault()} onClick={onClose}>×</button>
  </div>;
}
