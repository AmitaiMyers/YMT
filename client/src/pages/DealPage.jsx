// Single lead/deal: details, capped follow-ups (drafted into the approval sheet), unified timeline.

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil, Send } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { patch } from '../api.js';
import { Card, Loaded, PageHeader, DefinitionList, Button, Notice, ProgressBar, StatusBadge, statusTone, Stepper, Skeleton } from '../ui/index.js';
import { EntityForm } from '../components/EntityForm.jsx';
import { Timeline, LogInteractionCard } from '../components/Timeline.jsx';
import { useDraftFlow } from '../components/useDraftFlow.jsx';
import { useCounts } from '../app/CountsProvider.jsx';
import { ResearchOriginCard } from './research/AcceptedPanels.jsx';
import { useEnumOptions } from '../enumOptions.js';
import { DEAL_MODELS, DEAL_STATUSES } from '../../../shared/enums.js';

function useDealEditFields(deal) {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'title', label: t('deal.title'), type: 'text', required: true },
    { name: 'stage', label: t('deal.stage'), type: 'select', required: true, options: options('stage', deal.workflow.stages) },
    { name: 'status', label: t('deal.status'), type: 'select', required: true, options: options('dealStatus', DEAL_STATUSES) },
    { name: 'deal_model', label: t('deal.model'), type: 'select', required: true, options: options('dealModel', DEAL_MODELS) },
    { name: 'expected_value_usd', label: t('deal.expectedValue'), type: 'number' },
    { name: 'actual_revenue_usd', label: t('deal.actualRevenue'), type: 'number', help: t('deal.actualRevenueHelp') },
  ];
}

function FollowupCard({ deal, onDraft }) {
  const { t } = useI18n();
  const used = deal.followups_committed;
  const capReached = used >= deal.max_followups;
  return (
    <Card title={t('followup.title')}>
      <div className="mb-4">
        <div className="mb-1.5 flex justify-between text-sm"><span>{t('followup.touchpoints')}</span><span className="tabular font-semibold">{used} / {deal.max_followups}</span></div>
        <ProgressBar value={used} max={deal.max_followups} tone={capReached ? 'signal' : 'chart'} label={t('followup.touchpoints')} />
      </div>
      {deal.status !== 'open'
        ? <Notice>{t('followup.closedDeal')}</Notice>
        : (
          <Button icon={Send} disabled={capReached} disabledReason={t('followup.capReachedHint')} onClick={onDraft}>
            {t('followup.draftNumber', { number: used + 1, max: deal.max_followups })}
          </Button>
        )}
    </Card>
  );
}

function DealView({ deal, reload }) {
  const { t, language } = useI18n();
  const format = useFormat();
  const { refresh } = useCounts();
  const [editing, setEditing] = useState(false);
  const fields = useDealEditFields(deal);
  const flow = useDraftFlow(() => { reload(); refresh(); });
  const stageIndex = deal.workflow.stages.indexOf(deal.stage);
  return (
    <>
      <PageHeader
        eyebrow={<Link className="text-link underline" to={`/companies/${deal.company_id}`}><bdi>{deal.company_name}</bdi></Link>}
        title={deal.title}
        subtitle={<StatusBadge tone={statusTone('deal', deal.status)}>{t(`dealStatus.${deal.status}`)}</StatusBadge>}
        actions={!editing && <Button variant="secondary" icon={Pencil} offlineOk onClick={() => setEditing(true)}>{t('common.edit')}</Button>}
      />
      <Stepper label={t('deal.stage')} current={deal.status === 'won' ? deal.workflow.stages.length : stageIndex} steps={deal.workflow.stages.map((stage) => ({ key: stage, label: t(`stage.${stage}`) }))} />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card title={t('deal.details')}>
            {editing ? (
              <EntityForm
                fields={fields}
                initial={deal}
                onCancel={() => setEditing(false)}
                onSubmit={async (values) => {
                  const result = await patch(`/deals/${deal.id}`, values);
                  setEditing(false);
                  reload();
                  return result;
                }}
              />
            ) : (
              <DefinitionList items={[
                [t('deal.workflow'), language === 'he' ? deal.workflow_name_he : deal.workflow_name_en],
                [t('deal.model'), t(`dealModel.${deal.deal_model}`)],
                [t('deal.expectedValue'), format.usd(deal.expected_value_usd)],
                [t('deal.actualRevenue'), format.usd(deal.actual_revenue_usd)],
                [t('deal.owner'), deal.owner_name],
                [t('deal.lastActivity'), format.dateTime(deal.last_activity_at)],
                [t('deal.stageSince'), format.date(deal.stage_changed_at)],
              ]} />
            )}
          </Card>
          <FollowupCard deal={deal} onDraft={() => flow.openFollowup(deal.id)} />
        </div>
        {deal.research_card && <ResearchOriginCard card={deal.research_card} />}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('interaction.timeline')}><Timeline interactions={deal.interactions} /></Card>
          <LogInteractionCard companyId={deal.company_id} dealId={deal.id} contacts={deal.contacts} onLogged={reload} />
        </div>
      </div>
      {flow.elements}
    </>
  );
}

export function DealPage() {
  const { id } = useParams();
  const result = useLoad(`/deals/${id}`);
  return (
    <Loaded result={result} skeleton={<div className="space-y-4"><Skeleton className="h-9 w-80" /><Skeleton className="h-64 rounded-[10px]" /></div>}>
      {(deal) => <DealView deal={deal} reload={result.reload} />}
    </Loaded>
  );
}
