import type { LucideIcon } from 'lucide-react';
import { FileText, Inbox, Pin, Settings as SettingsIcon, Tag, Folder as FolderIcon } from 'lucide-react';

export type ViewType =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'archived' }
  | { kind: 'trash' }
  | { kind: 'settings' }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; name: string };

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  view: ViewType;
  count?: number;
}
