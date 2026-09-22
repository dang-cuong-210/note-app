import { useState, useCallback, useRef } from 'react';
import type { ToastItem, ToastAction } from '@/contexts/ToastContext';

export function useToastState() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, action?: ToastAction) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setToasts((prev) => [...prev, { id, message, action }]);
      const timer = setTimeout(() => dismiss(id), action ? 5000 : 3000);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return { toasts, toast, dismiss };
}
