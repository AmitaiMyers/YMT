// Client 360° file: one page with every piece of history for a company.

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Loaded, PageHeader, Tabs, Badge } from '../../components/ui.jsx';
import { OverviewTab } from './OverviewTab.jsx';
import { ContactsTab } from './ContactsTab.jsx';
import { TriggersTab } from './TriggersTab.jsx';
import { PipelineTab } from './PipelineTab.jsx';
import { MeetingsTab } from './MeetingsTab.jsx';
import { DocumentsTab } from './DocumentsTab.jsx';
import { MatchesTab } from './MatchesTab.jsx';
import { SharingTab } from './SharingTab.jsx';

const TABS = [
  ['overview', OverviewTab], ['contacts', ContactsTab], ['triggers', TriggersTab], ['pipeline', PipelineTab],
  ['meetings', MeetingsTab], ['documents', DocumentsTab], ['matches', MatchesTab], ['sharing', SharingTab],
];

export function CompanyPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const [tab, setTab] = useState('overview');
  const result = useLoad(`/companies/${id}/overview`);
  const ActiveTab = TABS.find(([key]) => key === tab)[1];

  return (
    <Loaded result={result}>
      {(data) => (
        <>
          <PageHeader
            title={data.company.name}
            subtitle={
              <span className="flex flex-wrap gap-2">
                <span>{data.company.industry} · {data.company.country}</span>
                {data.company.is_client ? <Badge color="green">{t('company.client')}</Badge> : <Badge>{t('company.prospect')}</Badge>}
                <Badge color="blue">{t(`indiaActivity.${data.company.india_activity}`)}</Badge>
              </span>
            }
          />
          <Tabs tabs={TABS.map(([key]) => ({ key, label: t(`companyTab.${key}`) }))} active={tab} onChange={setTab} />
          <ActiveTab data={data} reload={result.reload} />
        </>
      )}
    </Loaded>
  );
}
