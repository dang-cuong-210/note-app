import type { Note, Folder } from '@/types';
import type { ViewType } from './navigation';
import type { MobileDestination } from '@/components/MobileAppNavigation';

export interface SettingsReturnContext {
  view: ViewType;
  selectedNoteId: string | null;
  mobileDestination: MobileDestination;
  searchQuery: string;
}

export function captureSettingsReturnContext(current: SettingsReturnContext, existing?: SettingsReturnContext | null): SettingsReturnContext | null;
export function resolveSettingsReturnContext(args: {
  origin: SettingsReturnContext | null;
  notes: Note[];
  folders: Folder[];
  isDesktop: boolean;
}): SettingsReturnContext;
