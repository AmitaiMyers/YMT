// Stagnant leads and overdue tasks. Suggests follow-ups; drafting still goes through the approval queue.

import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { Card, Loaded, PageHeader, Table, Badge, Notice } from '../components/ui.jsx';
import { TaskList } from '../components/TaskList.jsx';

export function RemindersPage() {
  const { t } = useI18n();
  const result = useLoad('/reminders');
  return (
    <>
      <PageHeader title={t('nav.reminders')} subtitle={t('reminders.subtitle')} />
      <Loaded result={result}>
        {(data) => {
          const columns = [
            { key: 'company_name', label: t('company.name'), render: (d) => <Link className="font-medium text-brand-700 hover:underline" to={`/companies/${d.company_id}`}>{d.company_name}</Link> },
            { key: 'title', label: t('deal.title') },
            { key: 'stage', label: t('deal.stage'), render: (d) => t(`stage.${d.stage}`) },
            { key: 'days_idle', label: t('reminders.daysIdle'), render: (d) => <Badge color="red">{d.days_idle}</Badge> },
            { key: 'followups', label: t('reminders.followups'), render: (d) => `${d.followups_committed} / ${data.max_followups}` },
            { key: 'action', label: '', render: (d) => (d.can_followup
              ? <Link className="text-brand-500 underline" to={`/deals/${d.id}`}>{t('reminders.draftFollowup')}</Link>
              : <span className="text-xs text-slate-500">{t('reminders.capReachedHint')}</span>) },
          ];
          return (
            <div className="space-y-6">
              <Card title={t('reminders.staleTitle', { days: data.stale_days })}>
                <Notice>{t('reminders.policy', { max: data.max_followups })}</Notice>
                <Table columns={columns} rows={data.stale_deals} empty={t('reminders.noneStale')} />
              </Card>
              <Card title={t('reminders.overdueTasks')}>
                <TaskList tasks={data.overdue_tasks} onChanged={result.reload} showCompany />
              </Card>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
