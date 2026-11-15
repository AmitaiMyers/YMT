// Small presentational building blocks shared by every page.

import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';

const BUTTON_VARIANTS = {
  primary: 'bg-brand-900 text-white hover:bg-brand-700',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({ to, variant = 'secondary', className = '', children }) {
  return (
    <Link to={to} className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${BUTTON_VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {title && <h2 className="text-base font-semibold text-brand-900">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

const BADGE_COLORS = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-brand-100 text-brand-700',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
};

export function Badge({ color = 'gray', children }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_COLORS[color]}`}>{children}</span>;
}

export function ErrorBox({ message }) {
  if (!message) return null;
  return <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}

export function Notice({ children, color = 'blue' }) {
  const colors = { blue: 'border-brand-100 bg-brand-50 text-brand-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' };
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${colors[color]}`}>{children}</div>;
}

export function Loading() {
  const { t } = useI18n();
  return <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>;
}

export function Empty({ children }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

/** Render loading / error states for a useLoad() result, otherwise the children render-prop. */
export function Loaded({ result, children }) {
  if (result.error) return <ErrorBox message={result.error} />;
  if (result.loading || result.data === null) return <Loading />;
  return children(result.data);
}

export function Table({ columns, rows, rowKey = 'id', empty }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-start text-xs uppercase tracking-wide text-slate-500">
            {columns.map((column) => <th key={column.key} className="px-3 py-2 text-start font-medium">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]} className="border-b border-slate-100 hover:bg-slate-50">
              {columns.map((column) => <td key={column.key} className="px-3 py-2 align-top">{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 no-print">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${active === tab.key ? 'border-brand-900 text-brand-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Two-column label/value list. */
export function DefinitionList({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="min-w-32 text-slate-500">{label}</dt>
          <dd className="font-medium text-slate-800 break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExternalLink({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline break-all">{children ?? href}</a>;
}
