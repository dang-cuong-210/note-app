export type MobileFormattingTransition = 'toggle-off' | 'toggle-on' | 'clear-block' | 'switch-block' | 'clear-list' | 'switch-list' | 'apply';

export function getMobileFormattingTransition(actionId: string, activeActions: string[]): MobileFormattingTransition;
