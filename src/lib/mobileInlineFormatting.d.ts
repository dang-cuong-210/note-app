export type MobileInlineFormat = 'bold' | 'italic' | 'underline' | 'strikeThrough';

export function isInlineFormatActiveAtNode(editor: HTMLElement, node: Node | null, formatId: string): boolean;
export function isInlineFormatAppliedToRange(editor: HTMLElement, range: Range, formatId: string): boolean;
export function applyInlineFormatToRange(editor: HTMLElement, range: Range, formatId: string, selection: Selection): boolean;
export function removeInlineFormatFromRange(editor: HTMLElement, range: Range, formatId: string, selection: Selection): boolean;
export function toggleCollapsedInlineFormat(editor: HTMLElement, range: Range, formatId: string, selection: Selection): boolean;
export function removeEmptyInlineFormats(root: HTMLElement): string;
