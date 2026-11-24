// "My tasks" on Research review (24.11.2026): open YMT tasks (Defer and Verify come-backs, meeting follow-ups,
// questions from replies), overdue first, plus meetings that ended without a summary and deals with no activity.
// It replaces the Inbox's task list in the Focused view; "Everyone" shows the whole team's work.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NotebookPen, Hourglass } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { toQuery } from '../../api.js';
import { Card, Loaded, SkeletonRows, Button } from '../../ui/index.js';
import { TaskList } from '../../components/TaskList.jsx';

function Section({ icon: Icon, title, children }) {
  return (
    <Card title={<span className="flex items-center gap-2"><Icon aria-hidden="true" size={18} />{title}</span>}>
      {children}
    </Card>
  );
}

export function MyTasks({ onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const [scope, setScope] = useState('me');
  const result = useLoad(`/my-work${toQuery({ scope })}`);
  const reload = () => {
    result.reload();
    onChanged();
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{scope === 'me' ? t('myTasks.mineHint') : t('myTasks.allHint')}</p>
        <div role="group" aria-label={t('myTasks.scope')} className="flex gap-2">
          {['me', 'all'].map((key) => (
            <Button key={key} size="sm" variant={scope === key ? 'primary' : 'secondary'} aria-pressed={scope === key} onClick={() => setScope(key)}>
              {t(`myTasks.scope.${key}`)}
            </Button>
          ))}
        </div>
      </div>
      <Loaded result={result} skeleton={<Card><SkeletonRows rows={5} /></Card>}>
        {(work) => (
          <>
            <Card title={t('myTasks.tasks')}>
              <TaskList tasks={work.tasks} onChanged={reload} showCompany />
            </Card>
            {work.meetings_to_summarize.length > 0 && (
              <Section icon={NotebookPen} title={t('myTasks.meetings')}>
                <ul className="divide-y divide-line text-sm">
                  {work.meetings_to_summarize.map((meeting) => (
                    <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>
                        <bdi className="font-medium">{meeting.title}</bdi>
                        <span className="text-subtle"> · {format.dateTime(meeting.scheduled_at)}{meeting.company_name ? <> · <bdi>{meeting.company_name}</bdi></> : null}</span>
                      </span>
                      <Link className="text-link underline" to={`/meetings/${meeting.id}/complete`}>{t('meetings.complete')}</Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {work.stale_deals.length > 0 && (
              <Section icon={Hourglass} title={t('myTasks.staleDeals', { days: work.stale_days })}>
                <ul className="divide-y divide-line text-sm">
                  {work.stale_deals.map((deal) => (
                    <li key={deal.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>
                        <Link className="font-medium text-link hover:underline" to={`/deals/${deal.id}`}><bdi>{deal.title}</bdi></Link>
                        <span className="text-subtle"> · <bdi>{deal.company_name}</bdi>{scope === 'all' && deal.owner_name ? <> · <bdi>{deal.owner_name}</bdi></> : null}</span>
                      </span>
                      <span className="tabular text-subtle">{t('myTasks.idleDays', { days: deal.days_idle })}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}
