const INLINE_FORMATS = new Set(['bold', 'italic', 'underline', 'strikeThrough']);
const HEADING_FORMATS = new Set(['heading1', 'heading2', 'heading3']);
const LIST_FORMATS = new Set(['insertUnorderedList', 'insertOrderedList', 'checklist']);
const BLOCK_FORMATS = new Set(['quote', 'code']);

/** Describes how a toolbar action relates to the actual active editor state. */
export function getMobileFormattingTransition(actionId, activeActions) {
  const active = new Set(activeActions);
  if (INLINE_FORMATS.has(actionId)) return active.has(actionId) ? 'toggle-off' : 'toggle-on';
  if (HEADING_FORMATS.has(actionId)) return active.has(actionId) ? 'clear-block' : 'switch-block';
  if (LIST_FORMATS.has(actionId)) return active.has(actionId) ? 'clear-list' : 'switch-list';
  if (BLOCK_FORMATS.has(actionId)) return active.has(actionId) ? 'clear-block' : 'switch-block';
  return 'apply';
}
