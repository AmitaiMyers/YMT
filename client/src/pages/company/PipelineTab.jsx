import { Link } from 'react-router-dom';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Badge, Table, Loaded } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { Timeline, LogInteractionCard } from '../../components/Timeline.jsx';
import { useDealFields, withIds } from '../../fields.js';

const STATUS_COLORS = { open: 'blue', won: 'green', lost: 'red' };

function NewDealForm({ companyId, workflows, onCreated }) {
  const { t } = useI18n();
  const fields = useDealFields({ workflows });
  return (
    <EntityForm
      fields={fields}
      initial={{ deal_model: 'retainer', workflow_id: workflows[0]?.id }}
      resetOnSuccess
      submitLabel={t('deal.create')}
      onSubmit={async (values) => {
        const result = await post('/deals', withIds({ ...values, company_id: companyId }, ['workflow_id']));
        onCreated();
        return result;
      }}
    />
  );
}

export function PipelineTab({ data, reload }) {
  const { t, language } = useI18n();
  const format = useFormat();
  const workflows = useLoad('/workflows');
  const columns = [
    { key: 'title', label: t('deal.title'), render: (d) => <Link className="font-medium text-brand-700 hover:underline" to={`/deals/${d.id}`}>{d.title}</Link> },
    { key: 'workflow', label: t('deal.workflow'), render: (d) => (language === 'he' ? d.workflow_name_he : d.workflow_name_en) },
    { key: 'stage', label: t('deal.stage'), render: (d) => t(`stage.${d.stage}`) },
    { key: 'status', label: t('deal.status'), render: (d) => <Badge color={STATUS_COLORS[d.status]}>{t(`dealStatus.${d.status}`)}</Badge> },
    { key: 'model', label: t('deal.model'), render: (d) => t(`dealModel.${d.deal_model}`) },
    { key: 'value', label: t('deal.expectedValue'), render: (d) => format.usd(d.expected_value_usd) },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('deal.list')}>
        <Table columns={columns} rows={data.deals} empty={t('deal.none')} />
      </Card>
      <Card title={t('deal.add')}>
        <Loaded result={workflows}>{(rows) => <NewDealForm companyId={data.company.id} workflows={rows} onCreated={reload} />}</Loaded>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('interaction.timeline')}><Timeline interactions={data.interactions} /></Card>
        <LogInteractionCard companyId={data.company.id} contacts={data.contacts} onLogged={reload} />
      </div>
    </div>
  );
}
