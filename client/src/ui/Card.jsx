// Layout surfaces: Card, PageHeader (also sets the document title), DefinitionList.

import { useId } from 'react';
import { usePageTitle } from './hooks.js';

export function Card({ title, actions, children, className = '', padded = true, accent }) {
  const titleId = useId();
  const accentClass = accent ? `border-s-[3px] ${accent === 'signal' ? 'border-s-signal' : 'border-s-success'}` : '';
  return (
    <section aria-labelledby={title ? titleId : undefined} className={`rounded-[10px] border border-line bg-surface shadow-e1 ${accentClass} ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          {title && <h2 id={titleId} className="text-[18px] font-semibold text-fg">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4 sm:p-6' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  usePageTitle(typeof title === 'string' ? title : undefined);
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] font-medium text-subtle">{eyebrow}</div>}
        <h1 className="text-2xl font-bold text-fg">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Label/value pairs. String values are bidi-isolated so mixed Hebrew/English stays readable.
 * `stacked` keeps one column with the label above the value, for narrow side panels.
 */
export function DefinitionList({ items, stacked = false }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-8 gap-y-3 text-sm ${stacked ? '' : 'sm:grid-cols-2'}`}>
      {items.map(([label, value]) => (
        <div key={label} className={`flex flex-col gap-0.5 ${stacked ? '' : 'sm:flex-row sm:gap-3'}`}>
          <dt className={`shrink-0 text-subtle ${stacked ? '' : 'sm:w-36'}`}>{label}</dt>
          <dd className="min-w-0 font-medium text-fg [overflow-wrap:anywhere]">{typeof value === 'string' ? <bdi>{value}</bdi> : (value ?? '—')}</dd>
        </div>
      ))}
    </dl>
  );
}
