// Expert & supplier directory.

import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../hooks/useApi.js';
import { post, patch, del, toQuery } from '../api.js';
import { Card, Loaded, PageHeader, Table, Button, ErrorBox } from '../components/ui.jsx';
import { EntityForm, INPUT_CLASS } from '../components/EntityForm.jsx';
import { useResourceColumns } from '../components/resourceColumns.jsx';
import { useResourceFields, RESOURCE_DEFAULTS } from '../fields.js';
import { useEnumOptions } from '../enumOptions.js';
import { RESOURCE_TYPES } from '../../../shared/enums.js';

export function DirectoryPage() {
  const { t } = useI18n();
  const options = useEnumOptions();
  const [filters, setFilters] = useState({ q: '', type: '', country: '' });
  const result = useLoad(`/resources${toQuery(filters)}`);
  const countries = useLoad('/resources/countries');
  const fields = useResourceFields();
  const [editing, setEditing] = useState(null);
  const remove = useAction(async (resource) => {
    await del(`/resources/${resource.id}`);
    result.reload();
  });
  const columns = useResourceColumns([
    { key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setEditing(r)}>{t('common.edit')}</Button>
        <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => window.confirm(t('common.confirmDelete')) && remove.run(r)}>{t('common.delete')}</Button>
      </div>
    ) },
  ]);

  return (
    <>
      <PageHeader title={t('nav.directory')} subtitle={t('directory.subtitle')} />
      <div className="space-y-6">
        <Card title={t('directory.search')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className={INPUT_CLASS} placeholder={t('directory.searchPlaceholder')} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <select className={INPUT_CLASS} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">{t('directory.allTypes')}</option>
              {options('resourceType', RESOURCE_TYPES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={INPUT_CLASS} value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}>
              <option value="">{t('directory.allCountries')}</option>
              {(countries.data ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Card>
        <Card title={t('directory.results')}>
          <ErrorBox message={remove.error} />
          <Loaded result={result}>{(rows) => <Table columns={columns} rows={rows} empty={t('directory.none')} />}</Loaded>
        </Card>
        <Card title={editing ? `${t('common.edit')}: ${editing.name}` : t('directory.add')}>
          <EntityForm
            key={editing?.id ?? 'new'}
            fields={fields}
            initial={editing ?? RESOURCE_DEFAULTS}
            resetOnSuccess={!editing}
            onCancel={editing ? () => setEditing(null) : undefined}
            onSubmit={async (values) => {
              const response = editing ? await patch(`/resources/${editing.id}`, values) : await post('/resources', values);
              setEditing(null);
              result.reload();
              countries.reload();
              return response;
            }}
          />
        </Card>
      </div>
    </>
  );
}
