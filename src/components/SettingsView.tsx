import { useRef, useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  ArrowLeft,
  Check,
} from 'lucide-react';
import type { Settings, Note, Folder } from '@/types';
import { exportData, parseImport } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';

interface SettingsViewProps {
  settings: Settings;
  notes: Note[];
  folders: Folder[];
  onUpdateSettings: (updates: Partial<Settings>) => void;
  onImport: (data: { notes?: Note[]; folders?: Folder[]; settings?: Settings }) => void;
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
    a.download = `noted-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Notes exported');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = parseImport(reader.result as string);
        onImport(data);
        toast('Notes imported successfully');
      } catch {
        toast('Could not import file — invalid format');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="h-full flex flex-col bg-app" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-1 px-3 py-3 border-b border-app" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={onBack}
          className="lg:hidden p-2 rounded-lg hover-bg text-secondary -ml-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-bold text-app px-2" style={{ color: 'var(--text)' }}>Settings</h2>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-6 sm:px-8 sm:py-8 space-y-8">
          {/* Appearance */}
          <Section title="Appearance">
            <Row label="Theme">
              <div className="flex gap-1 bg-secondary p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <ThemeBtn icon={<Sun size={15} />} label="Light" active={settings.theme === 'light'} onClick={() => onUpdateSettings({ theme: 'light' })} />
                <ThemeBtn icon={<Moon size={15} />} label="Dark" active={settings.theme === 'dark'} onClick={() => onUpdateSettings({ theme: 'dark' })} />
                <ThemeBtn icon={<Monitor size={15} />} label="System" active={settings.theme === 'system'} onClick={() => onUpdateSettings({ theme: 'system' })} />
              </div>
            </Row>
            <Row label="Font size">
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
          <Section title="Sort order">
            <Row label="Sort by">
              <select
                value={settings.sortBy}
                onChange={(e) => onUpdateSettings({ sortBy: e.target.value as Settings['sortBy'] })}
                className="bg-secondary text-app text-sm rounded-lg px-3 py-2 outline-none border border-app"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)', borderColor: 'var(--border)' }}
              >
                <option value="updated">Last edited</option>
                <option value="created">Date created</option>
                <option value="title">Title</option>
              </select>
            </Row>
            <Row label="Direction">
              <div className="flex gap-1 bg-secondary p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <button
                  onClick={() => onUpdateSettings({ sortDir: 'desc' })}
                  className={`px-3 py-1.5 rounded-md text-sm transition-all ${settings.sortDir === 'desc' ? 'bg-app text-app shadow-sm' : 'text-secondary'}`}
                  style={settings.sortDir === 'desc' ? { backgroundColor: 'var(--bg)', color: 'var(--text)' } : { color: 'var(--text-secondary)' }}
                >
                  Newest first
                </button>
                <button
                  onClick={() => onUpdateSettings({ sortDir: 'asc' })}
                  className={`px-3 py-1.5 rounded-md text-sm transition-all ${settings.sortDir === 'asc' ? 'bg-app text-app shadow-sm' : 'text-secondary'}`}
                  style={settings.sortDir === 'asc' ? { backgroundColor: 'var(--bg)', color: 'var(--text)' } : { color: 'var(--text-secondary)' }}
                >
                  Oldest first
                </button>
              </div>
            </Row>
          </Section>

          {/* Data */}
          <Section title="Backup & Data">
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary hover-bg text-app text-sm transition-colors text-left"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)' }}
            >
              <Download size={18} style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <div className="font-medium">Export notes</div>
                <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>Download all notes as JSON</div>
              </div>
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary hover-bg text-app text-sm transition-colors text-left"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)' }}
            >
              <Upload size={18} style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <div className="font-medium">Import notes</div>
                <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>Restore from a backup file</div>
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={handleImport}
              className="hidden"
            />

            <button
              onClick={handleExport}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary hover-bg text-app text-sm transition-colors text-left"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text)' }}
            >
              <Check size={18} style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <div className="font-medium">Backup</div>
                <div className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>Same as export — your data is stored locally</div>
              </div>
            </button>
          </Section>

          {/* About */}
          <div className="text-center pt-4 pb-8">
            <p className="text-xs text-tertiary" style={{ color: 'var(--text-tertiary)' }}>
              Noted · {notes.length} notes · {folders.length} folders
            </p>
            <p className="text-xs text-tertiary mt-1" style={{ color: 'var(--text-tertiary)' }}>
              All data is stored locally on your device
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
