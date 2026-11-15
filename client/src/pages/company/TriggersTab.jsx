import { Zap, Trash2 } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post, del } from '../../api.js';
import { Card, IconButton, ErrorBox, Badge, Table, ExternalLink, EmptyState, useConfirm } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useTriggerFields } from '../../fields.js';

export function TriggersTab({ data, reload }) {
  const { t } = useI18n();
  const format = useFormat();
  const confirm = useConfirm();
  const fields = useTriggerFields();
  const remove = useAction(async (trigger) => {
    const ok = await confirm({ title: t('trigger.deleteTitle'), body: trigger.description, confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/triggers/${trigger.id}`);
    reload();
  });
  const columns = [
    { key: 'detected_on', label: t('trigger.detectedOn'), render: (r) => format.date(r.detected_on) },
    { key: 'type', label: t('trigger.type'), render: (r) => <Badge tone="signal">{t(`triggerType.${r.type}`)}</Badge> },
    { key: 'description', label: t('trigger.description') },
    { key: 'source_url', label: t('trigger.sourceUrl'), render: (r) => <ExternalLink href={r.source_url}>{t('common.source')}</ExternalLink> },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (r) => <IconButton icon={Trash2} label={t('common.delete')} onClick={() => remove.run(r)} /> },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('trigger.list')}>
        <ErrorBox message={remove.error} />
        <Table caption={t('trigger.list')} columns={columns} rows={data.triggers} empty={<EmptyState icon={Zap} title={t('leads.noTriggers')}>{t('leads.noTriggersHint')}</EmptyState>} />
      </Card>
      <Card title={t('trigger.add')}>
        <EntityForm
          fields={fields}
          initial={{ type: 'news', detected_on: new Date().toISOString().slice(0, 10) }}
          resetOnSuccess
          successMessage={t('toast.triggerAdded')}
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
