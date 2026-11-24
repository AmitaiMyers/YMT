// Declarative form used for every create/edit screen, so field handling lives in exactly one place.
//
// field: { name, label, type, required?, options?: [{ value, label }], wide?, placeholder?, help?, min?, rows? }
// type: 'text' | 'textarea' | 'number' | 'email' | 'url' | 'date' | 'datetime' | 'select' | 'checkbox'
//
// Validation: required fields are checked in the browser (bilingual message, focus moves to the field);
// server 400 messages that start with a field name ("email must be …") are attached to that field.

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, ErrorBox, useToast } from '../ui/index.js';
import { useAction } from '../hooks/useApi.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export const INPUT_CLASS = 'w-full min-h-11 sm:min-h-10 rounded-[6px] border bg-surface px-3 py-2 text-[15px] text-fg placeholder:text-subtle transition-colors transition-ui hover:border-muted focus-visible:border-focus';
const VALID_BORDER = 'border-line-strong';
const INVALID_BORDER = 'border-danger-fg';

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

export function FieldInput({ field, value, onChange, inputId, errorId, invalid }) {
  const common = {
    id: inputId,
    name: field.name,
    placeholder: field.placeholder,
    'aria-required': field.required ? 'true' : undefined,
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': errorId,
  };
  const className = `${INPUT_CLASS} ${invalid ? INVALID_BORDER : VALID_BORDER}`;
  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={field.rows ?? 4} className={`${className} leading-relaxed`} value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select {...common} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled={field.required}>—</option>
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    case 'checkbox':
      return <input {...common} type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={value} onChange={(e) => onChange(e.target.checked)} />;
    case 'datetime':
      return <input {...common} type="datetime-local" className={className} value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input {...common} type="number" inputMode="numeric" min={field.min ?? 0} step="1" className={`${className} tabular`} value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'password': // API keys: never offered for saving or autofill by the browser
      return <input {...common} type="password" dir="ltr" autoComplete="off" className={className} value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'text': case 'email': case 'url': case 'date':
      return <input {...common} type={field.type} dir={['email', 'url'].includes(field.type) ? 'ltr' : undefined} className={className} value={value} onChange={(e) => onChange(e.target.value)} />;
    default:
      throw new Error(`Unknown field type: ${field.type}`);
  }
}

export function FieldRow({ field, inputId, errorId, error, children }) {
  const { t } = useI18n();
  const isCheckbox = field.type === 'checkbox';
  const requiredMark = field.required && <span className="text-danger-fg" aria-hidden="true"> *</span>;
  return (
    <div className={field.wide ? 'sm:col-span-2' : ''}>
      {isCheckbox ? (
        <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-fg sm:min-h-10">
          {children}
          {field.label}
        </label>
      ) : (
        <>
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-fg">
            {field.label}{requiredMark}
            {field.required && <span className="sr-only"> ({t('form.requiredShort')})</span>}
          </label>
          {children}
        </>
      )}
      {error
        ? <p id={errorId} className="animate-rise mt-1.5 text-[13px] font-medium text-danger-fg">{error}</p>
        : field.help && <p id={errorId} className="mt-1.5 text-[13px] text-subtle">{field.help}</p>}
    </div>
  );
}

/** Find the field a server message refers to ("email must be a valid email address" → email). */
function fieldForMessage(fields, message) {
  return fields.find((field) => message.startsWith(`${field.name} `));
}

export function EntityForm({ fields, initial = {}, onSubmit, submitLabel, submittingLabel, resetOnSuccess = false, onCancel, successMessage, columns = 2 }) {
  const { t } = useI18n();
  const toast = useToast();
  const formId = useId();
  const [state, setState] = useState(() => initialFormState(fields, initial));
  const [fieldErrors, setFieldErrors] = useState({});
  const { run, busy, error } = useAction(onSubmit);
  const inputId = (name) => `${formId}-${name}`;

  function focusField(name) {
    document.getElementById(inputId(name)).focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const missing = fields.filter((field) => field.required && field.type !== 'checkbox' && state[field.name] === '');
    if (missing.length > 0) {
      setFieldErrors(Object.fromEntries(missing.map((field) => [field.name, t('form.required')])));
      focusField(missing[0].name);
      return;
    }
    setFieldErrors({});
    const result = await run(formToApi(fields, state));
    if (result === undefined) return;
    toast({ title: successMessage ?? t('toast.saved') });
    if (resetOnSuccess) setState(initialFormState(fields, initial));
  }

  // A server error that names a field is shown under that field instead of only at the top.
  const serverField = error ? fieldForMessage(fields, error) : undefined;
  const errors = serverField ? { ...fieldErrors, [serverField.name]: error } : fieldErrors;

  const renderField = (field) => (
    <FieldRow key={field.name} field={field} inputId={inputId(field.name)} errorId={`${inputId(field.name)}-hint`} error={errors[field.name]}>
      <FieldInput
        field={field}
        inputId={inputId(field.name)}
        errorId={errors[field.name] || field.help ? `${inputId(field.name)}-hint` : undefined}
        invalid={Boolean(errors[field.name])}
        value={state[field.name]}
        onChange={(value) => {
          setState((s) => ({ ...s, [field.name]: value }));
          if (fieldErrors[field.name]) setFieldErrors(({ [field.name]: removed, ...rest }) => rest);
        }}
      />
    </FieldRow>
  );
  const gridClass = `grid grid-cols-1 gap-4 ${columns === 2 ? 'sm:grid-cols-2' : ''}`;
  // Progressive disclosure: fields marked `advanced` sit behind "More details" (open when one has a value or an error).
  const essential = fields.filter((field) => !field.advanced);
  const advanced = fields.filter((field) => field.advanced);
  const advancedOpen = advanced.some((field) => state[field.name] !== '' && state[field.name] !== false) || advanced.some((field) => errors[field.name]);

  return (
    <form onSubmit={handleSubmit} noValidate>
      <ErrorBox message={serverField ? null : error} />
      <div className={gridClass}>{essential.map(renderField)}</div>
      {advanced.length > 0 && (
        <details open={advancedOpen} className="group mt-4 rounded-[6px] border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-muted hover:text-fg">
            <ChevronDown aria-hidden="true" size={16} className="transition-transform transition-ui group-open:rotate-180" />
            {t('form.moreDetails')}
          </summary>
          <div className={`${gridClass} border-t border-line p-3`}>{advanced.map(renderField)}</div>
        </details>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="submit" loading={busy} loadingLabel={submittingLabel ?? t('common.saving')}>{submitLabel ?? t('common.save')}</Button>
        {onCancel && <Button variant="secondary" offlineOk onClick={onCancel}>{t('common.cancel')}</Button>}
      </div>
    </form>
  );
}
