import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error:   (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info:    (message: string, duration?: number) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Toast item component ──────────────────────────────────────────────────────

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
};

const STYLES: Record<ToastType, { bar: string; icon: string; border: string }> = {
  success: { bar: 'bg-emerald-500', icon: 'text-emerald-400', border: 'border-emerald-500/30' },
  error:   { bar: 'bg-red-500',     icon: 'text-red-400',     border: 'border-red-500/30'     },
  warning: { bar: 'bg-yellow-500',  icon: 'text-yellow-400',  border: 'border-yellow-500/30'  },
  info:    { bar: 'bg-blue-500',    icon: 'text-blue-400',    border: 'border-blue-500/30'    },
};

const ToastItem = ({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) => {
  const Icon = ICONS[toast.type];
  const s = STYLES[toast.type];

  return (
    <div
      className={`
        relative flex items-start gap-3 w-80 px-4 py-3
        bg-primary-800 border ${s.border} rounded-xl shadow-xl
        animate-slide-up overflow-hidden
      `}
    >
      {/* colored left bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar} rounded-l-xl`} />

      <Icon size={18} className={`${s.icon} flex-shrink-0 mt-0.5`} />

      <p className="flex-1 text-sm text-neutral-200 leading-snug">{toast.message}</p>

      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 p-0.5 text-neutral-500 hover:text-white transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

// ── Provider ──────────────────────────────────────────────────────────────────

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const add = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
    if (duration > 0) {
      const timer = setTimeout(() => remove(id), duration);
      timers.current.set(id, timer);
    }
  }, [remove]);

  const value = useMemo<ToastContextValue>(() => ({
    toast:   add,
    success: (msg, dur) => add('success', msg, dur),
    error:   (msg, dur) => add('error',   msg, dur),
    warning: (msg, dur) => add('warning', msg, dur),
    info:    (msg, dur) => add('info',    msg, dur),
  }), [add]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Portal-like fixed container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={remove} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

// The hook stays next to its provider so both share the context instance. This costs
// fast refresh for this file only, which is an acceptable trade for a single module.
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};
