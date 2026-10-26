export interface MobileFormattingAction {
  id: string;
  label: string;
  name: string;
  command: string;
  value?: string;
}

export const MOBILE_FORMATTING_GROUPS: Array<{
  label: string;
  actions: MobileFormattingAction[];
}>;

export function setChecklistItemChecked(item: Element, checked: boolean): boolean;
export function normalizeChecklistItem(item: HTMLLIElement): void;
export function normalizeChecklistRows(list: HTMLUListElement): void;
export function removeChecklistFromItem(item: HTMLLIElement): boolean;
