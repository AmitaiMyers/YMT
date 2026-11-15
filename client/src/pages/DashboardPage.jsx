// Management dashboard.

import { Link } from 'react-router-dom';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { Card, Loaded, PageHeader, Empty, Badge } from '../components/ui.jsx';

function Bar({ value, max, color = 'bg-brand-500' }) {
  const percent = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-100">
      <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

function StatTile({ label, value, to, highlight }) {
  return (
    <Link to={to} className={`rounded-lg border bg-white p-4 shadow-sm hover:shadow ${highlight ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-brand-900">{value}</div>
    </Link>
  );
}

function TargetRow({ label, target, actual, format }) {
  const reached = actual >= target;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{format(actual)} / {format(target)}</span>
      </div>
      <Bar value={actual} max={target} color={reached ? 'bg-emerald-500' : 'bg-accent-500'} />
    </div>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad('/dashboard');

  return (
    <>
      <PageHeader title={t('nav.dashboard')} subtitle={t('dashboard.subtitle')} />
      <Loaded result={result}>
        {(data) => {
          const maxStage = Math.max(1, ...data.stage_distribution.map((row) => row.count));
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile label={t('dashboard.pendingApprovals')} value={data.pending_approvals} to="/approvals" highlight={data.pending_approvals > 0} />
                <StatTile label={t('dashboard.approvedNotSent')} value={data.approved_not_sent} to="/approvals" />
                <StatTile label={t('dashboard.openProposals')} value={data.open_proposals.length} to="/pipeline" />
                <StatTile label={t('dashboard.unsignedDocuments')} value={data.unsigned_documents} to="/documents" />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title={t('dashboard.stageDistribution')}>
                  <div className="space-y-3">
                    {data.stage_distribution.map((row) => (
                      <div key={row.stage} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
                        <span>{t(`stage.${row.stage}`)}</span>
                        <Bar value={row.count} max={maxStage} />
                        <span className="text-end font-semibold">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title={t('dashboard.targets')}>
                  <div className="space-y-4">
                    <TargetRow label={t('dashboard.newLeadsMonth')} {...data.targets.new_leads_month} format={format.number} />
                    <TargetRow label={t('dashboard.meetingsMonth')} {...data.targets.meetings_month} format={format.number} />
                    <TargetRow label={t('dashboard.revenueYear')} {...data.targets.revenue_year_usd} format={format.usd} />
                  </div>
                </Card>

                <Card title={t('dashboard.upcomingMeetings')}>
                  {data.upcoming_meetings.length === 0 ? <Empty>{t('dashboard.noMeetings')}</Empty> : (
                    <ul className="divide-y divide-slate-100">
                      {data.upcoming_meetings.map((meeting) => (
                        <li key={meeting.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <div>
                            <div className="font-medium">{meeting.title}</div>
                            <div className="text-slate-500">{meeting.company_name} · {format.dateTime(meeting.scheduled_at)}</div>
                          </div>
                          <Link className="text-brand-500 underline" to={`/meetings/${meeting.id}/prep`}>{t('meetings.prep')}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title={t('dashboard.openProposalsTitle')}>
                  {data.open_proposals.length === 0 ? <Empty>{t('dashboard.noProposals')}</Empty> : (
                    <ul className="divide-y divide-slate-100">
                      {data.open_proposals.map((deal) => (
                        <li key={deal.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <Link to={`/deals/${deal.id}`} className="font-medium text-brand-700 hover:underline">{deal.company_name} – {deal.title}</Link>
                          <span>{format.usd(deal.expected_value_usd)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <Card title={t('dashboard.revenueByModel')}>
                {data.revenue_by_model.length === 0 ? <Empty>{t('dashboard.noRevenue')}</Empty> : (
                  <div className="space-y-3">
                    {data.revenue_by_model.map((row) => (
                      <div key={row.deal_model} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <Badge color="blue">{t(`dealModel.${row.deal_model}`)}</Badge>
                        <span>{t('dashboard.won')}: <strong>{format.usd(row.won_usd)}</strong> · {t('dashboard.pipelineValue')}: {format.usd(row.pipeline_usd)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
