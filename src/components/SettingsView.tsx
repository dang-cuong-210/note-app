import { useRef } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  ArrowLeft,
} from 'lucide-react';
import type { Settings, Note, Folder } from '@/types';
import { exportData, parseImport } from '@/lib/utils';
import { summarizeJsonImport } from '@/lib/jsonBackup.js';
import type { JsonBackup } from '@/lib/jsonBackup.js';
import { useToast } from '@/contexts/ToastContext';

interface SettingsViewProps {
  settings: Settings;
  notes: Note[];
  folders: Folder[];
  onUpdateSettings: (updates: Partial<Settings>) => void;
  onImport: (data: JsonBackup) => Promise<{ notesAdded: number; notesUpdated: number; foldersAdded: number; foldersUpdated: number; failed: number }>;
  onBack: () => void;
}

export function SettingsView({
  settings,
  notes,
  folders,
  onUpdateSettings,
  onImport,
  onBack,
}: SettingsViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleExport = () => {
    const data = exportData(notes, folders, settings);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tanooki-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Đã xuất dữ liệu JSON');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = parseImport(reader.result as string);
        const summary = summarizeJsonImport(data, notes, folders);
        const lines = [
          `${summary.notesToAdd} ghi chú mới`,
          `${summary.notesToUpdate} ghi chú sẽ được cập nhật`,
          `${summary.foldersToAdd} thư mục mới`,
          `${summary.foldersToUpdate} thư mục sẽ được cập nhật`,
          ...(summary.applySettings ? ['Cài đặt trên thiết bị này sẽ được áp dụng'] : []),
          '',
          'Tệp đính kèm, ảnh và video không được nhập từ tệp JSON này.',
        ];
        if (!window.confirm(`Nhập dữ liệu này?\n\n${lines.join('\n')}`)) return;
        const result = await onImport(data);
        const changed = result.notesAdded + result.notesUpdated + result.foldersAdded + result.foldersUpdated;
        toast(result.failed
          ? `Đã nhập một phần; ${result.failed} mục chưa thể lưu. Các ghi chú đã được đưa vào hàng đợi đồng bộ.`
          : changed ? `Đã nhập ${result.notesAdded} ghi chú mới, cập nhật ${result.notesUpdated}; ${result.foldersAdded} thư mục mới, cập nhật ${result.foldersUpdated}. Dữ liệu đang được đồng bộ.`
            : summary.applySettings ? 'Đã áp dụng cài đặt trên thiết bị này.' : 'Không có ghi chú hoặc thư mục mới để nhập');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Không thể nhập tệp JSON này.');
      }
    };
    reader.onerror = () => toast('Không thể đọc tệp JSON này.');
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="h-full flex flex-col bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-1 px-3 py-3 border-b border-app" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={onBack}
          className="lg:hidden p-2 rounded-lg hover-bg text-secondary -ml-1"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Quay lại"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="hidden lg:inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium hover-bg focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ color: 'var(--accent)' }}
          aria-label="Quay lại"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Quay lại</span>
        </button>
        <h2 className="text-lg font-bold text-app px-2" style={{ color: 'var(--text)' }}>Cài đặt</h2>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-6 sm:px-8 sm:py-8 space-y-8">
          {/* Appearance */}
          <Section title="Giao diện">
            <Row label="Chủ đề">
              <div className="flex gap-1 bg-secondary p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <ThemeBtn icon={<Sun size={15} />} label="Sáng" active={settings.theme === 'light'} onClick={() => onUpdateSettings({ theme: 'light' })} />
                <ThemeBtn icon={<Moon size={15} />} label="Tối" active={settings.theme === 'dark'} onClick={() => onUpdateSettings({ theme: 'dark' })} />
                <ThemeBtn icon={<Monitor size={15} />} label="Hệ thống" active={settings.theme === 'system'} onClick={() => onUpdateSettings({ theme: 'system' })} />
              </div>
            </Row>
            <Row label="Cỡ chữ">
              <div className="flex gap-1 bg-secondary p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => onUpdateSettings({ fontSize: size })}
                    className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                      settings.fontSize === size ? 'bg-app text-app shadow-sm' : 'text-secondary'
                    }`}
                    style={
                      settings.fontSize === size
                        ? { backgroundColor: 'var(--bg)', color: 'var(--text)' }
                        : { color: 'var(--text-secondary)' }
                    }
                  >
                    {size === 'sm' ? 'S' : size === 'md' ? 'M' : size === 'lg' ? 'L' : 'XL'}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          {/* Sorting */}
          <Section title="Thứ tự sắp xếp">
            <Row label="Sắp xếp theo">
              <select
                value={settings.sortBy}
                onChange={(e) => onUpdateSettings({ sortBy: e.target.value as Settings['sortBy'] })}
                className="bg-secondary text-app text-sm rounded-lg px-3 py-2 outline-none border border-app"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)', borderColor: 'var(--border)' }}
              >
                <option value="updated">Chỉnh sửa gần đây</option>
                <option value="created">Ngày tạo</option>
                <option value="title">Tiêu đề</option>
              </select>
            </Row>
            <Row label="Thứ tự">
              <div className="flex gap-1 bg-secondary p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <button
                  onClick={() => onUpdateSettings({ sortDir: 'desc' })}
                  className={`px-3 py-1.5 rounded-md text-sm transition-all ${settings.sortDir === 'desc' ? 'bg-app text-app shadow-sm' : 'text-secondary'}`}
                  style={settings.sortDir === 'desc' ? { backgroundColor: 'var(--bg)', color: 'var(--text)' } : { color: 'var(--text-secondary)' }}
                >
                  Mới nhất trước
                </button>
                <button
                  onClick={() => onUpdateSettings({ sortDir: 'asc' })}
                  className={`px-3 py-1.5 rounded-md text-sm transition-all ${settings.sortDir === 'asc' ? 'bg-app text-app shadow-sm' : 'text-secondary'}`}
                  style={settings.sortDir === 'asc' ? { backgroundColor: 'var(--bg)', color: 'var(--text)' } : { color: 'var(--text-secondary)' }}
                >
                  Cũ nhất trước
                </button>
              </div>
            </Row>
          </Section>

          {/* Data */}
          <Section title="Dữ liệu JSON">
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary hover-bg text-app text-sm transition-colors text-left"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)' }}
            >
              <Download size={18} style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <div className="font-medium">Xuất dữ liệu JSON</div>
                <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>Gồm ghi chú, thư mục và cài đặt trên thiết bị.</div>
              </div>
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary hover-bg text-app text-sm transition-colors text-left"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)' }}
            >
              <Upload size={18} style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <div className="font-medium">Nhập dữ liệu JSON</div>
                <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>Gộp dữ liệu; ghi chú vắng mặt sẽ được giữ lại.</div>
              </div>
            </button>
            <p className="px-1 text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
              Không bao gồm tệp đính kèm, ảnh hoặc video. Nội dung có thể còn tham chiếu đến tệp chỉ có trên tài khoản.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={handleImport}
              className="hidden"
            />
          </Section>

          {/* About */}
          <div className="text-center pt-4 pb-8">
            <p className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
              Tanooki · {notes.length} ghi chú · {folders.length} thư mục
            </p>
            <p className="text-xs text-tertiary mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Được đồng bộ giữa các thiết bị qua bộ nhớ đám mây
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-app" style={{ color: 'var(--text)' }}>{label}</span>
      {children}
    </div>
  );
}

function ThemeBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${active ? 'bg-app text-app shadow-sm' : 'text-secondary'}`}
      style={active ? { backgroundColor: 'var(--bg)', color: 'var(--text)' } : { color: 'var(--text-secondary)' }}
    >
      {icon}
      {label}
    </button>
  );
}
