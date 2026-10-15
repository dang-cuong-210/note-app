export function isMeaningfulNoteContent(title?: string, html?: string, hasAttachments?: boolean): boolean;
export function getBlankLinesToAppend(targetY: number, endY: number, lineHeight: number, maxLines?: number): number;
export function canDiscardUnsentDraftOffline(options: { debouncePending: boolean; confirmedRevision?: number; inFlight: boolean }): boolean;
export function shouldDiscardNewEmptyDraft(options: { createdInSession: boolean; everMeaningful: boolean; explicitlyDeleted?: boolean }): boolean;
