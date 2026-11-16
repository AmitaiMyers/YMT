// Management dashboard (MANAGE group).

import { Link } from 'react-router-dom';
import { ClipboardCheck, Send, FileSignature, Handshake, CalendarDays, TrendingUp } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { Card, Loaded, PageHeader, EmptyState, Badge, KpiTile, ProgressBar, Skeleton, ButtonLink } from '../ui/index.js';

function TargetRow({ label, target, actual, format }) {
  const reached = actual >= target;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular font-semibold">{format(actual)} <span className="font-normal text-subtle">/ {format(target)}</span></span>
      </div>
      <ProgressBar value={actual} max={target} tone={reached ? 'success' : 'signal'} label={label} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-28 rounded-[10px]" />)}</div>
      <div className="grid gap-6 lg:grid-cols-2">{[0, 1].map((key) => <Skeleton key={key} className="h-64 rounded-[10px]" />)}</div>
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
      <Loaded result={result} skeleton={<DashboardSkeleton />}>
        {(data) => {
          const maxStage = Math.max(1, ...data.stage_distribution.map((row) => row.count));
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiTile label={t('dashboard.pendingApprovals')} value={data.pending_approvals} to="/approvals" icon={ClipboardCheck} attention={data.pending_approvals > 0} />
                <KpiTile label={t('dashboard.approvedNotSent')} value={data.approved_not_sent} to="/approvals" icon={Send} />
                <KpiTile label={t('dashboard.openProposals')} value={data.open_proposals.length} to="/pipeline" icon={Handshake} />
                <KpiTile label={t('dashboard.unsignedDocuments')} value={data.unsigned_documents} to="/documents" icon={FileSignature} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title={t('dashboard.stageDistribution')}>
                  <ul className="space-y-3">
                    {data.stage_distribution.map((row) => (
                      <li key={row.stage} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm">
                        <span>{t(`stage.${row.stage}`)}</span>
                        <ProgressBar value={row.count} max={maxStage} label={t(`stage.${row.stage}`)} />
                        <span className="tabular text-end font-semibold">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card title={t('dashboard.targets')}>
                  <div className="space-y-5">
                    <TargetRow label={t('dashboard.newLeadsMonth')} {...data.targets.new_leads_month} format={format.number} />
                    <TargetRow label={t('dashboard.meetingsMonth')} {...data.targets.meetings_month} format={format.number} />
                    <TargetRow label={t('dashboard.revenueYear')} {...data.targets.revenue_year_usd} format={format.usd} />
                  </div>
                </Card>

                <Card title={t('dashboard.upcomingMeetings')} padded={false}>
                  {data.upcoming_meetings.length === 0
                    ? <EmptyState icon={CalendarDays} title={t('dashboard.noMeetings')} action={<ButtonLink to="/calendar#schedule" size="sm">{t('meetings.schedule')}</ButtonLink>} />
                    : (
                      <ul className="divide-y divide-line">
                        {data.upcoming_meetings.map((meeting) => (
                          <li key={meeting.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
                            <div className="min-w-0">
                              <span dir="auto" className="block truncate align-parent font-medium">{meeting.title}</span>
                              <div className="text-[13px] text-subtle">{meeting.company_name && <><bdi>{meeting.company_name}</bdi> · </>}{format.dateTime(meeting.scheduled_at)}</div>
                            </div>
                            <ButtonLink size="sm" to={`/meetings/${meeting.id}/prep`}>{t('meetings.prep')}</ButtonLink>
                          </li>
                        ))}
                      </ul>
                    )}
                </Card>

                <Card title={t('dashboard.openProposalsTitle')} padded={false}>
                  {data.open_proposals.length === 0 ? <EmptyState icon={Handshake} title={t('dashboard.noProposals')} /> : (
                    <ul className="divide-y divide-line">
                      {data.open_proposals.map((deal) => (
                        <li key={deal.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
                          <Link to={`/deals/${deal.id}`} dir="auto" className="min-w-0 truncate align-parent font-medium text-link hover:underline">{deal.company_name} – {deal.title}</Link>
                          <span className="tabular shrink-0">{format.usd(deal.expected_value_usd)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <Card title={t('dashboard.revenueByModel')}>
                {data.revenue_by_model.length === 0 ? <EmptyState icon={TrendingUp} title={t('dashboard.noRevenue')} /> : (
                  <ul className="divide-y divide-line">
                    {data.revenue_by_model.map((row) => (
                      <li key={row.deal_model} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
                        <Badge tone="info">{t(`dealModel.${row.deal_model}`)}</Badge>
                        <span className="tabular">{t('dashboard.won')}: <strong>{format.usd(row.won_usd)}</strong> <span className="text-subtle">· {t('dashboard.pipelineValue')}: {format.usd(row.pipeline_usd)}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
