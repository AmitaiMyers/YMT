// Inline feedback: errors, notices, skeletons, empty states, and the <Loaded> data wrapper.

import { TriangleAlert, Info, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function ErrorBox({ message, onRetry }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <div role="alert" className="animate-rise mb-4 flex items-start gap-2 rounded-[6px] border border-danger-fg/30 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
      <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline">
          <RotateCcw aria-hidden="true" size={14} />{t('common.retry')}
        </button>
      )}
    </div>
  );
}

const NOTICE_TONES = {
  info: 'border-info-line bg-info-soft text-fg',
  signal: 'border-signal/40 bg-signal-soft text-signal-fg',
};

export function Notice({ children, tone = 'info', icon: Icon = Info }) {
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-[6px] border px-3 py-2 text-sm ${NOTICE_TONES[tone]}`}>
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** Content-shaped placeholder: a few rows of varying width. */
export function SkeletonRows({ rows = 4 }) {
  const { t } = useI18n();
  const widths = ['w-11/12', 'w-8/12', 'w-10/12', 'w-6/12', 'w-9/12'];
  return (
    <div role="status" aria-label={t('common.loading')} className="space-y-3 py-2">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className={`h-4 ${widths[index % widths.length]}`} />)}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-subtle">
          <Icon aria-hidden="true" size={22} />
        </div>
      )}
      <p className="font-medium text-fg">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Render skeleton / error (with retry) / children(data) for a useLoad() result. */
export function Loaded({ result, children, skeleton }) {
  if (result.error) return <ErrorBox message={result.error} onRetry={result.reload} />;
  if (result.data === null) return skeleton ?? <SkeletonRows />;
  return children(result.data);
}
