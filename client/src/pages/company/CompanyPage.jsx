// Client 360° file: summary header, "Next step" guidance, and sticky tabs with every piece of history.

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarClock, ClipboardCheck, ListChecks, Handshake } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Loaded, PageHeader, Tabs, Badge, Skeleton } from '../../ui/index.js';
import { useDraftFlow } from '../../components/useDraftFlow.jsx';
import { useCounts } from '../../app/CountsProvider.jsx';
import { useViewMode } from '../../app/viewMode.jsx';
import { NextStepPanel } from './NextStepPanel.jsx';
import { OverviewTab } from './OverviewTab.jsx';
import { ContactsTab } from './ContactsTab.jsx';
import { TriggersTab } from './TriggersTab.jsx';
import { PipelineTab } from './PipelineTab.jsx';
import { MeetingsTab } from './MeetingsTab.jsx';
import { DocumentsTab } from './DocumentsTab.jsx';
import { MatchesTab } from './MatchesTab.jsx';
import { SharingTab } from './SharingTab.jsx';
import { ResearchTab } from './ResearchTab.jsx';
import { DiscoveryTab } from './DiscoveryTab.jsx';

const TABS = [
  ['overview', OverviewTab], ['contacts', ContactsTab], ['triggers', TriggersTab], ['pipeline', PipelineTab],
  ['meetings', MeetingsTab], ['documents', DocumentsTab], ['matches', MatchesTab], ['sharing', SharingTab], ['discovery', DiscoveryTab], ['research', ResearchTab],
];

function SummaryStat({ icon: Icon, label, children }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 shadow-e1">
      <Icon aria-hidden="true" size={18} className="shrink-0 text-subtle" />
      <div className="min-w-0">
        <div className="text-[13px] text-subtle">{label}</div>
        <div className="truncate text-sm font-semibold text-fg">{children}</div>
      </div>
    </div>
  );
}

function CompanySummary({ data }) {
  const { t } = useI18n();
  const format = useFormat();
  const now = new Date().toISOString();
  const openDeals = data.deals.filter((deal) => deal.status === 'open');
  const nextMeeting = data.meetings.filter((m) => m.status === 'scheduled' && m.scheduled_at >= now).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  const pending = data.approvals.filter((a) => a.status === 'pending').length;
  const openTasks = data.tasks.filter((task) => !task.done).length;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryStat icon={Handshake} label={t('company.openDeals')}>
        {openDeals.length === 0 ? '—' : openDeals.map((deal) => t(`stage.${deal.stage}`)).join(' · ')}
      </SummaryStat>
      <SummaryStat icon={CalendarClock} label={t('company.nextMeeting')}>{nextMeeting ? format.dateTime(nextMeeting.scheduled_at) : '—'}</SummaryStat>
      <SummaryStat icon={ClipboardCheck} label={t('company.pendingDrafts')}>{pending}</SummaryStat>
      <SummaryStat icon={ListChecks} label={t('company.openTasks')}>{openTasks}</SummaryStat>
    </div>
  );
}

function CompanySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-16 rounded-[10px]" />)}</div>
      <Skeleton className="h-64 rounded-[10px]" />
    </div>
  );
}

export function CompanyPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { refresh } = useCounts();
  const { shows } = useViewMode();
  const tabs = TABS.filter(([key]) => shows(`companyTab.${key}`));
  const [tab, setTab] = useState('overview');
  const result = useLoad(`/companies/${id}/overview`);
  const reload = () => {
    result.reload();
    refresh();
  };
  const flow = useDraftFlow(reload);
  const ActiveTab = tabs.find(([key]) => key === tab)[1];

  return (
    <Loaded result={result} skeleton={<CompanySkeleton />}>
      {(data) => (
        <>
          <PageHeader
            eyebrow={t('nav.clients')}
            title={data.company.name}
            subtitle={
              <span className="flex flex-wrap items-center gap-2">
                <bdi>{data.company.industry} · {data.company.country}</bdi>
                {data.company.is_client ? <Badge tone="success">{t('company.client')}</Badge> : <Badge>{t('company.prospect')}</Badge>}
                <Badge tone="info">{t(`indiaActivity.${data.company.india_activity}`)}</Badge>
              </span>
            }
          />
          <CompanySummary data={data} />
          <NextStepPanel data={data} flow={flow} onTab={setTab} onChanged={reload} />
          <Tabs sticky tabs={tabs.map(([key]) => ({ key, label: t(`companyTab.${key}`) }))} active={tab} onChange={setTab} label={t('company.sections')}>
            <ActiveTab data={data} reload={reload} flow={flow} />
          </Tabs>
          {flow.elements}
        </>
      )}
    </Loaded>
  );
}
