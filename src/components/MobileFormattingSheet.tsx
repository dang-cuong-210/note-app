import { MobileBottomSheet } from '@/components/MobileEditorSheets';
import { MOBILE_FORMATTING_GROUPS } from '@/lib/mobileFormatting.js';

interface MobileFormattingSheetProps {
  open: boolean;
  activeActions: string[];
  onClose: () => void;
  onFormat: (actionId: string) => void;
}

export function MobileFormattingSheet({ open, activeActions, onClose, onFormat }: MobileFormattingSheetProps) {
  const active = new Set(activeActions);
  return <MobileBottomSheet open={open} title="Định dạng" onClose={onClose} labelledBy="mobile-editor-formatting">
    <div className="tanooki-mobile-format-groups">
      {MOBILE_FORMATTING_GROUPS.map((group) => <section className="tanooki-mobile-format-group" key={group.label} aria-label={group.label}>
        <h3>{group.label}</h3>
        <div className={`tanooki-mobile-format-actions ${group.actions.length === 4 ? 'is-inline' : ''}`}>
          {group.actions.map((action) => <button
            type="button"
            key={action.id}
            aria-label={action.name}
            aria-pressed={active.has(action.id)}
            className={`${active.has(action.id) ? 'is-active' : ''} ${['bold', 'italic', 'underline', 'strikeThrough'].includes(action.id) ? `format-${action.id}` : ''}`}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onFormat(action.id)}
          >{action.label}</button>)}
        </div>
      </section>)}
    </div>
  </MobileBottomSheet>;
}
