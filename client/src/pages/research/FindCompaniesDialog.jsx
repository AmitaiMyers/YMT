// Find companies in Apollo or Lusha and put them in a watch list (new or existing), for the agent to check.
// Uses credits on the YMT account, so the dialog says so before the search.

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Dialog, Button, ErrorBox, Notice, Loaded, SkeletonRows } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { DATA_SOURCES } from '../../../../shared/enums.js';

const NEW_LIST = 'new';
const DEFAULT_LIMIT = '25';

function SearchForm({ status, lists, onDone, onClose }) {
  const { t } = useI18n();
  const connected = DATA_SOURCES.filter((provider) => status[provider].configured);
  const [form, setForm] = useState({
    provider: connected[0], countries: 'Israel', keywords: '', employees_min: '', employees_max: '', limit: DEFAULT_LIMIT, list: NEW_LIST, list_name: '',
  });
  const set = (field) => (value) => setForm((previous) => ({ ...previous, [field]: value }));
  const number = (value) => (value === '' ? null : Number(value));
  const search = useAction(async () => onDone(await post(`/data-sources/${form.provider}/companies`, {
    countries: form.countries, keywords: form.keywords.trim() || null,
    employees_min: number(form.employees_min), employees_max: number(form.employees_max), limit: Number(form.limit),
    ...(form.list === NEW_LIST ? { list_name: form.list_name.trim() } : { list_id: Number(form.list) }),
  })));
  if (connected.length === 0) return <Notice tone="signal">{t('findCompanies.noneConnected')}</Notice>;
  const field = (name, type, options = {}) => (
    <FieldRow field={{ name, label: t(`findCompanies.${name}`), required: options.required, help: options.help }} inputId={`find-${name}`}>
      <FieldInput field={{ name, type, required: options.required, options: options.options, min: options.min }} inputId={`find-${name}`} value={form[name]} onChange={set(name)} />
    </FieldRow>
  );
  const ready = form.countries.trim() !== '' && Number(form.limit) >= 1 && (form.list !== NEW_LIST || form.list_name.trim() !== '');
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); search.run(); }}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field('provider', 'select', { required: true, options: connected.map((provider) => ({ value: provider, label: t(`dataSource.${provider}`) })) })}
        {field('countries', 'text', { required: true, help: t('findCompanies.commaHelp') })}
        {field('keywords', 'text', { help: t('findCompanies.keywordsHelp') })}
        {field('limit', 'number', { required: true, min: 1, help: t('findCompanies.limitHelp') })}
        {field('employees_min', 'number', { min: 1 })}
        {field('employees_max', 'number', { min: 1 })}
        {field('list', 'select', { required: true, options: [{ value: NEW_LIST, label: t('findCompanies.newList') }, ...lists.map((list) => ({ value: String(list.id), label: list.name }))] })}
        {form.list === NEW_LIST && field('list_name', 'text', { required: true })}
      </div>
      <Notice tone="signal">{t('findCompanies.credits')}</Notice>
      <ErrorBox message={search.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={Search} loading={search.busy} disabled={!ready} disabledReason={t('findCompanies.notReady')}>{t('findCompanies.search')}</Button>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export function FindCompaniesDialog({ onClose, onDone }) {
  const { t } = useI18n();
  const status = useLoad('/data-sources');
  const lists = useLoad('/watch-lists');
  return (
    <Dialog open onClose={onClose} title={t('findCompanies.title')} description={t('findCompanies.hint')} width="max-w-2xl">
      <Loaded result={status} skeleton={<SkeletonRows rows={5} />}>
        {(providers) => (
          <Loaded result={lists} skeleton={<SkeletonRows rows={2} />}>
            {(watchLists) => <SearchForm status={providers} lists={watchLists} onDone={onDone} onClose={onClose} />}
          </Loaded>
        )}
      </Loaded>
    </Dialog>
  );
}
