import { Archive, Ellipsis, Folder, House, Plus, Search, Settings, Trash2, LogOut, Pin, FileText } from 'lucide-react';
import type { ViewType } from '@/lib/navigation';

export type MobileDestination = 'home' | 'search' | 'folders' | 'more';

interface MobileBottomNavProps {
  active: MobileDestination;
  onHome: () => void;
  onSearch: () => void;
  onNew: () => void;
  onFolders: () => void;
  onMore: () => void;
}

export function MobileBottomNav({ active, onHome, onSearch, onNew, onFolders, onMore }: MobileBottomNavProps) {
  const items = [
    { id: 'home' as const, label: 'Trang chủ', icon: House, action: onHome },
    { id: 'search' as const, label: 'Tìm kiếm', icon: Search, action: onSearch },
    { id: 'folders' as const, label: 'Thư mục', icon: Folder, action: onFolders },
    { id: 'more' as const, label: 'Thêm', icon: Ellipsis, action: onMore },
  ];
  return <nav className="tanooki-mobile-bottom-nav" aria-label="Điều hướng chính">
    {items.slice(0, 2).map(({ id, label, icon: Icon, action }) => <button key={id} type="button" className={active === id ? 'is-active' : ''} aria-current={active === id ? 'page' : undefined} onClick={action}><Icon size={21} aria-hidden="true" /><span>{label}</span></button>)}
    <button type="button" className="tanooki-mobile-new-button" aria-label="Tạo ghi chú mới" onClick={onNew}><Plus size={25} aria-hidden="true" /><span>Mới</span></button>
    {items.slice(2).map(({ id, label, icon: Icon, action }) => <button key={id} type="button" className={active === id ? 'is-active' : ''} aria-current={active === id ? 'page' : undefined} onClick={action}><Icon size={21} aria-hidden="true" /><span>{label}</span></button>)}
  </nav>;
}

interface MobileMoreViewProps {
  onNavigate: (view: ViewType) => void;
  onSignOut: () => void;
}

export function MobileMoreView({ onNavigate, onSignOut }: MobileMoreViewProps) {
  const items = [
    { label: 'Ghi chú đã ghim', icon: Pin, action: () => onNavigate({ kind: 'pinned' }) },
    { label: 'Tất cả ghi chú', icon: FileText, action: () => onNavigate({ kind: 'all' }) },
    { label: 'Lưu trữ', icon: Archive, action: () => onNavigate({ kind: 'archived' }) },
    { label: 'Thùng rác', icon: Trash2, action: () => onNavigate({ kind: 'trash' }) },
    { label: 'Cài đặt', icon: Settings, action: () => onNavigate({ kind: 'settings' }) },
  ];
  return <div className="tanooki-mobile-page">
    <header className="tanooki-mobile-page-heading"><h1>Thêm</h1><p>Các mục và cài đặt của Tanooki.</p></header>
    <div className="tanooki-mobile-more-list">
      {items.map(({ label, icon: Icon, action }) => <button key={label} type="button" onClick={action}><Icon size={20} aria-hidden="true" /><span>{label}</span><span className="tanooki-mobile-more-chevron">›</span></button>)}
      <button type="button" className="is-danger" onClick={onSignOut}><LogOut size={20} aria-hidden="true" /><span>Đăng xuất</span><span className="tanooki-mobile-more-chevron">›</span></button>
    </div>
  </div>;
}
