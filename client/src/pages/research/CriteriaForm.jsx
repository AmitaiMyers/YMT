// Mandate criteria form. Used to create a mandate (admin) and to save a new version (owner or admin).
// Lists are edited one item per line; need types and sectors are checkbox groups (no sector ticked = any sector).

import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { Button, ErrorBox, Loaded, SkeletonRows } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { NEED_TYPES, SECTORS } from '../../../../shared/enums.js';

const LIST_FIELDS = ['target_countries', 'false_positives', 'search_terms', 'exclusions'];
const NUMBER_FIELDS = ['employees_min', 'employees_max', 'revenue_min_usd', 'revenue_max_usd', 'revenue_floor_usd'];

function toState(version) {
  const state = { need_types: version.need_types ?? [], sectors: version.sectors ?? [], service_codes: version.service_codes ?? [], accept_rule: version.accept_rule ?? '', proposed_service: version.proposed_service ?? '', change_note: '', code: '', name: '' };
  for (const field of LIST_FIELDS) state[field] = (version[field] ?? []).join('\n');
  for (const field of NUMBER_FIELDS) state[field] = version[field] === null || version[field] === undefined ? '' : String(version[field]);
  return state;
}

function toPayload(state, mode) {
  const payload = { need_types: state.need_types, sectors: state.sectors, service_codes: state.service_codes, accept_rule: state.accept_rule, proposed_service: state.proposed_service };
  for (const field of LIST_FIELDS) payload[field] = state[field].split('\n').map((line) => line.trim()).filter(Boolean);
  for (const field of NUMBER_FIELDS) payload[field] = state[field] === '' ? null : Number(state[field]);
  if (mode === 'create') return { ...payload, code: state.code.trim().toUpperCase(), name: state.name };
  return { ...payload, change_note: state.change_note };
}

/** @param {{ labelOf: (value: string) => string }} props labels come from the caller (translated codes or catalogue names) */
function CheckboxGroup({ legend, values, selected, labelOf, onChange, required }) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1.5 text-sm font-medium text-fg">{legend}{required && <span className="text-danger-fg" aria-hidden="true"> *</span>}</legend>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {values.map((value) => (
          <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--primary)]"
              checked={selected.includes(value)}
              onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))}
            />
            {labelOf(value)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** @param {{ mode: 'create' | 'version', initial: object, onSubmit: (payload: object) => Promise<void>, onCancel: () => void }} props */
export function CriteriaForm({ mode, initial, onSubmit, onCancel }) {
  const { t, language } = useI18n();
  const services = useLoad('/services');
  const [state, setState] = useState(() => toState(initial));
  const submit = useAction(async () => onSubmit(toPayload(state, mode)));
  const set = (field) => (value) => setState((previous) => ({ ...previous, [field]: value }));
  const field = (name, type, { required = false, rows, help, wide = false } = {}) => (
    <FieldRow field={{ name, label: t(`criteria.${name}`), required, help, wide }} inputId={`criteria-${name}`} errorId={help ? `criteria-${name}-hint` : undefined}>
      <FieldInput field={{ name, type, required, rows }} inputId={`criteria-${name}`} errorId={help ? `criteria-${name}-hint` : undefined} value={state[name]} onChange={set(name)} />
    </FieldRow>
  );
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit.run(); }}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mode === 'create' && field('code', 'text', { required: true, help: t('criteria.codeHelp') })}
        {mode === 'create' && field('name', 'text', { required: true })}
        {field('target_countries', 'textarea', { required: true, rows: 2, help: t('criteria.onePerLine') })}
        {field('proposed_service', 'text', { required: true })}
        <CheckboxGroup legend={t('criteria.need_types')} values={NEED_TYPES} selected={state.need_types} labelOf={(value) => t(`needType.${value}`)} onChange={set('need_types')} required />
        {field('accept_rule', 'textarea', { required: true, rows: 3, wide: true })}
        {field('false_positives', 'textarea', { rows: 3, wide: true, help: t('criteria.onePerLine') })}
        {field('employees_min', 'number')}
        {field('employees_max', 'number')}
        {field('revenue_min_usd', 'number', { help: t('criteria.usdHelp') })}
        {field('revenue_max_usd', 'number', { help: t('criteria.usdHelp') })}
        {field('revenue_floor_usd', 'number', { help: t('criteria.floorHelp') })}
        <Loaded result={services} skeleton={<SkeletonRows rows={2} />}>
          {(catalogue) => {
            const names = new Map(catalogue.map((service) => [service.code, language === 'he' ? service.name_he : service.name_en]));
            return (
              <CheckboxGroup legend={t('criteria.service_codes')} values={catalogue.map((service) => service.code)} selected={state.service_codes}
                labelOf={(code) => `${code} · ${names.get(code)}`} onChange={set('service_codes')} />
            );
          }}
        </Loaded>
        <CheckboxGroup legend={t('criteria.sectors')} values={SECTORS.filter((s) => s !== 'unknown')} selected={state.sectors} labelOf={(value) => t(`sector.${value}`)} onChange={set('sectors')} />
        {field('search_terms', 'textarea', { rows: 3, help: t('criteria.onePerLine') })}
        {field('exclusions', 'textarea', { rows: 3, help: t('criteria.exclusionsHelp') })}
        {mode === 'version' && field('change_note', 'textarea', { required: true, rows: 2, wide: true, help: t('criteria.changeNoteHelp') })}
      </div>
      {submit.error && <ErrorBox message={submit.error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submit.busy}>{mode === 'create' ? t('research.createMandate') : t('research.saveVersion')}</Button>
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
