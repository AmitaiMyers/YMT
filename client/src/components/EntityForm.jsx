// Declarative form used for every create/edit screen, so field handling lives in exactly one place.
//
// field: { name, label, type, required?, options?: [{ value, label }], wide?, placeholder?, help? }
// type: 'text' | 'textarea' | 'number' | 'email' | 'url' | 'date' | 'datetime' | 'select' | 'checkbox'

import { useState } from 'react';
import { Button, ErrorBox } from './ui.jsx';
import { useAction } from '../hooks/useApi.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const INPUT_CLASS = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

/** ISO (UTC) → value for <input type="datetime-local"> in the browser's local time. */
export function isoToLocalInput(iso) {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toFormValue(field, value) {
  if (field.type === 'checkbox') return Boolean(value);
  if (value === null || value === undefined) return '';
  if (field.type === 'datetime') return isoToLocalInput(value);
  return String(value);
}

function toApiValue(field, value) {
  if (field.type === 'checkbox') return value;
  if (value === '') return null;
  if (field.type === 'number') return Number(value);
  if (field.type === 'datetime') return new Date(value).toISOString();
  return value;
}

export function initialFormState(fields, initial) {
  return Object.fromEntries(fields.map((field) => [field.name, toFormValue(field, initial[field.name])]));
}

export function formToApi(fields, state) {
  return Object.fromEntries(fields.map((field) => [field.name, toApiValue(field, state[field.name])]));
}

export function FieldInput({ field, value, onChange }) {
  const common = { id: `f-${field.name}`, name: field.name, required: field.required, placeholder: field.placeholder };
  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={field.rows ?? 4} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select {...common} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled={field.required}>—</option>
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    case 'checkbox':
      return <input {...common} type="checkbox" className="h-4 w-4" checked={value} onChange={(e) => onChange(e.target.checked)} />;
    case 'datetime':
      return <input {...common} type="datetime-local" className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input {...common} type="number" min={field.min ?? 0} step="1" className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'text': case 'email': case 'url': case 'date':
      return <input {...common} type={field.type} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} />;
    default:
      throw new Error(`Unknown field type: ${field.type}`);
  }
}

export function FieldRow({ field, children }) {
  const isCheckbox = field.type === 'checkbox';
  return (
    <div className={field.wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={`f-${field.name}`} className={`text-sm font-medium text-slate-700 ${isCheckbox ? 'flex items-center gap-2' : 'mb-1 block'}`}>
        {isCheckbox && children}
        {field.label}
        {field.required && <span className="text-red-600"> *</span>}
      </label>
      {!isCheckbox && children}
      {field.help && <p className="mt-1 text-xs text-slate-500">{field.help}</p>}
    </div>
  );
}

export function EntityForm({ fields, initial = {}, onSubmit, submitLabel, resetOnSuccess = false, onCancel }) {
  const { t } = useI18n();
  const [state, setState] = useState(() => initialFormState(fields, initial));
  const { run, busy, error } = useAction(onSubmit);

  async function handleSubmit(event) {
    event.preventDefault();
    const result = await run(formToApi(fields, state));
    if (result !== undefined && resetOnSuccess) setState(initialFormState(fields, initial));
  }

  return (
    <form onSubmit={handleSubmit}>
      <ErrorBox message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <FieldRow key={field.name} field={field}>
            <FieldInput field={field} value={state[field.name]} onChange={(value) => setState((s) => ({ ...s, [field.name]: value }))} />
          </FieldRow>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={busy}>{submitLabel ?? t('common.save')}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>}
      </div>
    </form>
  );
}

export { INPUT_CLASS };
