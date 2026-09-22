import { ToastContext } from '@/contexts/ToastContext';
import { useToastState } from '@/hooks/useToastState';
import { X } from 'lucide-react';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, toast, dismiss } = useToastState();
  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: { id: string; message: string; action?: { label: string; onClick: () => void } }[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center px-4 w-full max-w-md">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-slide-up flex items-center gap-3 bg-tertiary text-app px-4 py-3 rounded-xl shadow-lg max-w-full"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          }}
        >
          <span className="text-sm flex-1 truncate">{t.message}</span>
          {t.action && (
            <button
              className="text-accent text-sm font-semibold hover:text-accent-hover transition-colors whitespace-nowrap"
              style={{ color: 'var(--accent)' }}
              onClick={() => {
                t.action!.onClick();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className="text-tertiary hover:text-app transition-colors flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            onClick={() => onDismiss(t.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
