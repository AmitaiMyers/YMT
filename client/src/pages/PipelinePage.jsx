// Module 2: CRM pipeline board per workflow (service type).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../hooks/useApi.js';
import { patch, post, toQuery } from '../api.js';
import { Card, Loaded, PageHeader, Tabs, ErrorBox, Badge, Table } from '../components/ui.jsx';
import { EntityForm } from '../components/EntityForm.jsx';
import { useDealFields, withIds } from '../fields.js';
import { DEAL_STATUSES } from '../../../shared/enums.js';

function daysSince(iso) {
  return Math.floor((Date.now() - Date.parse(iso)) / 86400000);
}

function DealCard({ deal, stages, staleDays, onMove }) {
  const { t } = useI18n();
  const format = useFormat();
  const idle = daysSince(deal.last_activity_at);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <Link to={`/deals/${deal.id}`} className="block font-medium text-brand-700 hover:underline">{deal.company_name}</Link>
      <div className="text-xs text-slate-600">{deal.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
        <Badge color={idle > staleDays ? 'red' : 'gray'}>{t('pipeline.idleDays', { days: idle })}</Badge>
        <span className="text-slate-500">{format.usd(deal.expected_value_usd)}</span>
      </div>
      <select
        aria-label={t('pipeline.moveTo')}
        className="mt-2 w-full rounded border border-slate-300 px-1 py-1 text-xs"
        value={deal.stage}
        onChange={(e) => onMove(deal, e.target.value)}
      >
        {stages.map((stage) => <option key={stage} value={stage}>{t(`stage.${stage}`)}</option>)}
      </select>
    </div>
  );
}

function Board({ workflow, staleDays }) {
  const { t } = useI18n();
  const result = useLoad(`/deals${toQuery({ status: 'open', workflow_id: workflow.id })}`);
  const move = useAction(async (deal, stage) => {
    await patch(`/deals/${deal.id}`, { stage });
    result.reload();
  });
  return (
    <Loaded result={result}>
      {(deals) => (
        <>
          <ErrorBox message={move.error} />
          <div className="flex gap-3 overflow-x-auto pb-2">
            {workflow.stages.map((stage) => {
              const inStage = deals.filter((deal) => deal.stage === stage);
              return (
                <div key={stage} className="w-56 shrink-0 rounded-lg bg-slate-100 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-brand-900">
                    <span>{t(`stage.${stage}`)}</span>
                    <span className="rounded-full bg-white px-2 text-xs">{inStage.length}</span>
                  </div>
                  <div className="space-y-2">
                    {inStage.map((deal) => <DealCard key={deal.id} deal={deal} stages={workflow.stages} staleDays={staleDays} onMove={move.run} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Loaded>
  );
}

function ClosedDeals({ status }) {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/deals?status=${status}`);
  const columns = [
    { key: 'company_name', label: t('company.name'), render: (d) => <Link className="text-brand-700 hover:underline" to={`/deals/${d.id}`}>{d.company_name}</Link> },
    { key: 'title', label: t('deal.title') },
    { key: 'deal_model', label: t('deal.model'), render: (d) => t(`dealModel.${d.deal_model}`) },
    { key: 'actual_revenue_usd', label: t('deal.actualRevenue'), render: (d) => format.usd(d.actual_revenue_usd) },
    { key: 'closed_at', label: t('deal.closedAt'), render: (d) => format.date(d.closed_at) },
  ];
  return <Loaded result={result}>{(rows) => <Table columns={columns} rows={rows} empty={t('deal.none')} />}</Loaded>;
}

function NewDeal({ workflows, onCreated }) {
  const companies = useLoad('/companies');
  return (
    <Loaded result={companies}>
      {(rows) => <NewDealForm workflows={workflows} companies={rows} onCreated={onCreated} />}
    </Loaded>
  );
}

function NewDealForm({ workflows, companies, onCreated }) {
  const { t } = useI18n();
  const fields = useDealFields({ workflows, companies });
  return (
    <EntityForm
      fields={fields}
      initial={{ deal_model: 'retainer', workflow_id: workflows[0]?.id }}
      resetOnSuccess
      submitLabel={t('deal.create')}
      onSubmit={async (values) => {
        const result = await post('/deals', withIds(values, ['company_id', 'workflow_id']));
        onCreated();
        return result;
      }}
    />
  );
}

export function PipelinePage() {
  const { t, language } = useI18n();
  const workflows = useLoad('/workflows');
  const settings = useLoad('/settings');
  const [view, setView] = useState(null);
  const [boardVersion, setBoardVersion] = useState(0);

  return (
    <>
      <PageHeader title={t('nav.pipeline')} subtitle={t('pipeline.subtitle')} />
      <Loaded result={workflows}>
        {(rows) => {
          const active = rows.filter((w) => w.active);
          const currentView = view ?? `wf-${active[0]?.id}`;
          const tabs = [
            ...active.map((w) => ({ key: `wf-${w.id}`, label: language === 'he' ? w.name_he : w.name_en })),
            ...DEAL_STATUSES.filter((s) => s !== 'open').map((s) => ({ key: s, label: t(`dealStatus.${s}`) })),
          ];
          const workflow = active.find((w) => `wf-${w.id}` === currentView);
          return (
            <div className="space-y-6">
              <Tabs tabs={tabs} active={currentView} onChange={setView} />
              {workflow ? <Board key={`${workflow.id}-${boardVersion}`} workflow={workflow} staleDays={Number(settings.data?.stale_days ?? Infinity)} /> : <ClosedDeals status={currentView} />}
              <Card title={t('deal.add')}>
                <NewDeal workflows={active} onCreated={() => setBoardVersion((v) => v + 1)} />
              </Card>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
