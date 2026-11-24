// Settings hub: everything non-technical staff may need to change, without an IT person.

import { useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch } from '../../api.js';
import { Card, Loaded, PageHeader, Tabs, useTheme, SkeletonRows, ErrorBox } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { WorkflowsSettings } from './WorkflowsSettings.jsx';
import { TemplatesSettings } from './TemplatesSettings.jsx';
import { UsersSettings } from './UsersSettings.jsx';
import { PrivacySettings, AuditLog } from './PrivacySettings.jsx';
import { OutreachSettings } from './OutreachSettings.jsx';
import { ApprovedAnswersSettings } from './ApprovedAnswersSettings.jsx';
import { DiscoverySettings } from './DiscoverySettings.jsx';
import { ServicesSettings } from './ServicesSettings.jsx';
import { ShephaSettings } from './ShephaSettings.jsx';
import { MAX_FOLLOWUPS_HARD_LIMIT, VIEW_MODES } from '../../../../shared/enums.js';
import { InstallButton } from '../../app/InstallButton.jsx';
import { useInstallPrompt } from '../../app/pwa.js';
import { useViewMode } from '../../app/viewMode.jsx';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };

function ChoiceGroup({ label, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(option.value)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium transition-colors transition-ui ${checked ? 'border-link bg-info-soft text-fg' : 'border-line-strong text-muted hover:bg-hover'}`}
            >
              {Icon && <Icon aria-hidden="true" size={16} />}{option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function AppearanceSettings() {
  const { t, language, setLanguage } = useI18n();
  const { preference, choose, preferences } = useTheme();
  const { mode: installMode } = useInstallPrompt();
  return (
    <Card title={t('settings.appearance')}>
      <p className="mb-4 text-sm text-muted">{t('settings.appearanceHelp')}</p>
      <div className="space-y-6">
        <ChoiceGroup label={t('settings.theme')} value={preference} onChange={choose} options={preferences.map((key) => ({ value: key, label: t(`theme.${key}`), icon: THEME_ICONS[key] }))} />
        <ChoiceGroup label={t('settings.language')} value={language} onChange={setLanguage} options={[{ value: 'he', label: 'עברית' }, { value: 'en', label: 'English' }]} />
        <div>
          <div className="mb-2 text-sm font-medium">{t('pwa.title')}</div>
          <p className="mb-3 text-sm text-muted">{installMode === 'installed' ? t('pwa.installed') : t('pwa.help')}</p>
          <InstallButton />
        </div>
      </div>
    </Card>
  );
}

/** Focus or Full view for everyone (admins switch it; nothing is deleted, hidden screens come back in Full). */
function ViewModeSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { mode, setMode } = useViewMode();
  const change = useAction(setMode);
  return (
    <Card title={t('viewMode.title')}>
      <p className="mb-4 text-sm text-muted">{t('viewMode.help')}</p>
      {user.role === 'admin'
        ? <ChoiceGroup label={t('viewMode.label')} value={mode} onChange={(next) => change.run(next)} options={VIEW_MODES.map((key) => ({ value: key, label: t(`viewMode.${key}`) }))} />
        : <p className="text-sm">{t('viewMode.current', { mode: t(`viewMode.${mode}`) })}</p>}
      <p className="mt-3 text-[13px] text-subtle">{t(`viewModeHelp.${mode}`)}</p>
      <ErrorBox message={change.error} />
    </Card>
  );
}

function GeneralSettings() {
  const { t } = useI18n();
  const result = useLoad('/settings');
  const fields = [
    { name: 'company_name', label: t('settings.companyName'), type: 'text', required: true },
    { name: 'stale_days', label: t('settings.staleDays'), type: 'number', min: 1, required: true, help: t('settings.staleDaysHelp') },
    { name: 'max_followups', label: t('settings.maxFollowups'), type: 'number', min: 1, required: true, help: t('settings.maxFollowupsHelp', { max: MAX_FOLLOWUPS_HARD_LIMIT }) },
    { name: 'share_link_days', label: t('settings.shareLinkDays'), type: 'number', min: 1, required: true },
    { name: 'followup_after_days', label: t('settings.followupAfterDays'), type: 'number', min: 1, required: true, help: t('settings.followupAfterDaysHelp') },
    { name: 'target_new_leads_monthly', label: t('settings.targetLeads'), type: 'number', required: true },
    { name: 'target_meetings_monthly', label: t('settings.targetMeetings'), type: 'number', required: true },
    { name: 'target_revenue_yearly_usd', label: t('settings.targetRevenue'), type: 'number', required: true },
  ];
  return (
    <div className="space-y-6">
      <ViewModeSettings />
      <AppearanceSettings />
      <Card title={t('settings.business')}>
        <Loaded result={result} skeleton={<SkeletonRows rows={5} />}>
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
    </div>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState('general');
  const isAdmin = user.role === 'admin';
  const { shows } = useViewMode();
  const tabs = [
    { key: 'general', label: t('settings.general'), Component: GeneralSettings },
    { key: 'workflows', label: t('settings.workflows'), Component: WorkflowsSettings },
    ...(shows('settings.templates') ? [{ key: 'templates', label: t('settings.templates'), Component: TemplatesSettings }] : []),
    { key: 'outreach', label: t('settings.outreach'), Component: OutreachSettings },
    { key: 'answers', label: t('settings.answers'), Component: ApprovedAnswersSettings },
    ...(shows('settings.discovery') ? [{ key: 'discovery', label: t('settings.discovery'), Component: DiscoverySettings }] : []),
    { key: 'services', label: t('settings.services'), Component: ServicesSettings },
    ...(isAdmin ? [{ key: 'shepha', label: t('settings.shepha'), Component: ShephaSettings }] : []),
    ...(isAdmin ? [{ key: 'users', label: t('settings.users'), Component: UsersSettings }] : []),
    { key: 'privacy', label: t('settings.privacy'), Component: PrivacySettings },
    ...(isAdmin ? [{ key: 'audit', label: t('settings.audit'), Component: AuditLog }] : []),
  ];
  const Active = tabs.find((item) => item.key === tab).Component;
  return (
    <>
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('nav.settings')}>
        <Active />
      </Tabs>
    </>
  );
}
