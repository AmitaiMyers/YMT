// Settings hub: everything non-technical staff may need to change, without an IT person.

import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { patch } from '../../api.js';
import { Card, Loaded, PageHeader, Tabs } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { WorkflowsSettings } from './WorkflowsSettings.jsx';
import { TemplatesSettings } from './TemplatesSettings.jsx';
import { UsersSettings } from './UsersSettings.jsx';
import { PrivacySettings, AuditLog } from './PrivacySettings.jsx';
import { MAX_FOLLOWUPS_HARD_LIMIT } from '../../../../shared/enums.js';

function GeneralSettings() {
  const { t } = useI18n();
  const result = useLoad('/settings');
  const fields = [
    { name: 'company_name', label: t('settings.companyName'), type: 'text', required: true },
    { name: 'stale_days', label: t('settings.staleDays'), type: 'number', min: 1, required: true, help: t('settings.staleDaysHelp') },
    { name: 'max_followups', label: t('settings.maxFollowups'), type: 'number', min: 1, required: true, help: t('settings.maxFollowupsHelp', { max: MAX_FOLLOWUPS_HARD_LIMIT }) },
    { name: 'share_link_days', label: t('settings.shareLinkDays'), type: 'number', min: 1, required: true },
    { name: 'target_new_leads_monthly', label: t('settings.targetLeads'), type: 'number', required: true },
    { name: 'target_meetings_monthly', label: t('settings.targetMeetings'), type: 'number', required: true },
    { name: 'target_revenue_yearly_usd', label: t('settings.targetRevenue'), type: 'number', required: true },
  ];
  return (
    <Card title={t('settings.general')}>
      <Loaded result={result}>
        {(settings) => (
          <EntityForm
            fields={fields}
            initial={settings}
            onSubmit={async (values) => {
              const updated = await patch('/settings', values);
              result.reload();
              return updated;
            }}
          />
        )}
      </Loaded>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState('general');
  const isAdmin = user.role === 'admin';
  const tabs = [
    { key: 'general', label: t('settings.general'), Component: GeneralSettings },
    { key: 'workflows', label: t('settings.workflows'), Component: WorkflowsSettings },
    { key: 'templates', label: t('settings.templates'), Component: TemplatesSettings },
    ...(isAdmin ? [{ key: 'users', label: t('settings.users'), Component: UsersSettings }] : []),
    { key: 'privacy', label: t('settings.privacy'), Component: PrivacySettings },
    ...(isAdmin ? [{ key: 'audit', label: t('settings.audit'), Component: AuditLog }] : []),
  ];
  const Active = tabs.find((item) => item.key === tab).Component;
  return (
    <>
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <Active />
    </>
  );
}
