// Toasts: bottom-end stack, live-region announced (errors assertive), pause on hover/focus, optional action (Undo).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleCheck, TriangleAlert, Info, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';

const ToastContext = createContext(null);
const DEFAULT_DURATION_MS = 5000;
const TONE_STYLES = {
  success: { icon: CircleCheck, className: 'text-success-fg' },
  error: { icon: TriangleAlert, className: 'text-danger-fg' },
  info: { icon: Info, className: 'text-link' },
};

function ToastItem({ toast, onDismiss }) {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const { icon: Icon, className } = TONE_STYLES[toast.tone];

  useEffect(() => {
    if (paused) return undefined;
    const started = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, toast.id, onDismiss]);

  return (
    <li
      className="animate-rise pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-[10px] border border-line bg-surface p-3 text-sm shadow-e3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon aria-hidden="true" size={20} className={`mt-0.5 shrink-0 ${className} ${toast.tone === 'success' ? 'animate-pop' : ''}`} />
      <div className="flex-1">
        <p className="font-medium text-fg">{toast.title}</p>
        {toast.body && <p className="mt-0.5 text-muted">{toast.body}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          className="shrink-0 font-semibold text-link underline"
          onClick={() => {
            toast.action.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label={t('common.close')} className="shrink-0 text-subtle hover:text-fg" onClick={() => onDismiss(toast.id)}>
        <X aria-hidden="true" size={16} />
      </button>
    </li>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((item) => item.id !== id)), []);
  const show = useCallback(({ tone = 'success', title, body, action, duration = DEFAULT_DURATION_MS }) => {
    if (!TONE_STYLES[tone]) throw new Error(`Unknown toast tone: ${tone}`);
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { id, tone, title, body, action, duration }]);
    return id;
  }, []);

  const polite = toasts.filter((item) => item.tone !== 'error');
  const assertive = toasts.filter((item) => item.tone === 'error');
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-20 end-4 z-[60] flex flex-col items-end gap-2 md:bottom-4">
        <ol role="status" aria-live="polite" className="flex flex-col gap-2">
          {polite.map((item) => <ToastItem key={item.id} toast={item} onDismiss={dismiss} />)}
        </ol>
        <ol role="alert" aria-live="assertive" className="flex flex-col gap-2">
          {assertive.map((item) => <ToastItem key={item.id} toast={item} onDismiss={dismiss} />)}
        </ol>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return show;
}
