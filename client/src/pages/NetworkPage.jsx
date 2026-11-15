// Network: manufacturers, suppliers and experts. Search-as-you-type; add/edit in a side sheet.

import { useState } from 'react';
import { Network, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../hooks/useApi.js';
import { post, patch, del, toQuery } from '../api.js';
import { Button, Card, Dialog, IconButton, Loaded, PageHeader, Table, ErrorBox, EmptyState, SkeletonRows, useConfirm, useToast } from '../ui/index.js';
import { EntityForm, INPUT_CLASS } from '../components/EntityForm.jsx';
import { useResourceColumns } from '../components/resourceColumns.jsx';
import { useResourceFields, RESOURCE_DEFAULTS } from '../fields.js';
import { useEnumOptions } from '../enumOptions.js';
import { RESOURCE_TYPES } from '../../../shared/enums.js';

const FIELD_CLASS = `${INPUT_CLASS} border-line-strong`;

export function NetworkPage() {
  const { t } = useI18n();
  const options = useEnumOptions();
  const confirm = useConfirm();
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', type: '', country: '' });
  const result = useLoad(`/resources${toQuery(filters)}`);
  const countries = useLoad('/resources/countries');
  const fields = useResourceFields();
  // null = closed, 'new' = create, object = edit
  const [editing, setEditing] = useState(null);
  const remove = useAction(async (resource) => {
    const ok = await confirm({ title: t('directory.deleteTitle'), body: t('directory.deleteBody', { name: resource.name }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/resources/${resource.id}`);
    toast({ title: t('toast.deleted') });
    result.reload();
  });
  const columns = useResourceColumns([
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (r) => (
      <div className="flex gap-1">
        <IconButton icon={Pencil} label={`${t('common.edit')}: ${r.name}`} onClick={() => setEditing(r)} />
        <IconButton icon={Trash2} label={`${t('common.delete')}: ${r.name}`} onClick={() => remove.run(r)} />
      </div>
    ) },
  ]);
  const isEdit = editing !== null && editing !== 'new';

  return (
    <>
      <PageHeader title={t('nav.network')} subtitle={t('directory.subtitle')} actions={<Button icon={Plus} offlineOk onClick={() => setEditing('new')}>{t('directory.add')}</Button>} />
      <Card>
        <div role="search" className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="relative">
            <Search aria-hidden="true" size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input type="search" aria-label={t('directory.search')} className={`${FIELD_CLASS} ps-9`} placeholder={t('directory.searchPlaceholder')} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
          <select aria-label={t('resource.type')} className={FIELD_CLASS} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">{t('directory.allTypes')}</option>
            {options('resourceType', RESOURCE_TYPES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select aria-label={t('company.country')} className={FIELD_CLASS} value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}>
            <option value="">{t('directory.allCountries')}</option>
            {(countries.data ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <ErrorBox message={remove.error} />
        <Loaded result={result} skeleton={<SkeletonRows rows={6} />}>
          {(rows) => (
            <Table
              caption={t('nav.network')}
              columns={columns}
              rows={rows}
              empty={<EmptyState icon={Network} title={t('directory.none')} action={<Button icon={Plus} offlineOk onClick={() => setEditing('new')}>{t('directory.add')}</Button>} />}
            />
          )}
        </Loaded>
      </Card>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} variant="sheet" title={isEdit ? `${t('common.edit')}: ${editing.name}` : t('directory.add')}>
        {editing !== null && (
          <EntityForm
            key={isEdit ? editing.id : 'new'}
            fields={fields}
            columns={1}
            initial={isEdit ? editing : RESOURCE_DEFAULTS}
            onCancel={() => setEditing(null)}
            successMessage={isEdit ? t('toast.saved') : t('toast.resourceAdded')}
            onSubmit={async (values) => {
              const response = isEdit ? await patch(`/resources/${editing.id}`, values) : await post('/resources', values);
              setEditing(null);
              result.reload();
              countries.reload();
              return response;
            }}
          />
        )}
      </Dialog>
    </>
  );
}
