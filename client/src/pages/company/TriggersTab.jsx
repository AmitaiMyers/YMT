import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post, del } from '../../api.js';
import { Card, Button, ErrorBox, Badge, Table, ExternalLink } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useTriggerFields } from '../../fields.js';

export function TriggersTab({ data, reload }) {
  const { t } = useI18n();
  const format = useFormat();
  const fields = useTriggerFields();
  const remove = useAction(async (trigger) => {
    await del(`/triggers/${trigger.id}`);
    reload();
  });
  const columns = [
    { key: 'detected_on', label: t('trigger.detectedOn'), render: (r) => format.date(r.detected_on) },
    { key: 'type', label: t('trigger.type'), render: (r) => <Badge color="amber">{t(`triggerType.${r.type}`)}</Badge> },
    { key: 'description', label: t('trigger.description') },
    { key: 'source_url', label: t('trigger.sourceUrl'), render: (r) => <ExternalLink href={r.source_url}>{t('common.open')}</ExternalLink> },
    { key: 'actions', label: '', render: (r) => (
      <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => window.confirm(t('common.confirmDelete')) && remove.run(r)}>{t('common.delete')}</Button>
    ) },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('trigger.list')}>
        <ErrorBox message={remove.error} />
        <Table columns={columns} rows={data.triggers} empty={t('leads.noTriggers')} />
      </Card>
      <Card title={t('trigger.add')}>
        <EntityForm
          fields={fields}
          initial={{ type: 'news', detected_on: new Date().toISOString().slice(0, 10) }}
          resetOnSuccess
          onSubmit={async (values) => {
            const result = await post(`/companies/${data.company.id}/triggers`, values);
            reload();
            return result;
          }}
        />
      </Card>
    </div>
  );
}
