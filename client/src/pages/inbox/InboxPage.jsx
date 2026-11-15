// "Today": every item that needs a person, ranked by urgency, with one primary action per row.

import { Link } from 'react-router-dom';
import { ListChecks, ClipboardCheck, CalendarClock, NotebookPen, Hourglass, PartyPopper, ArrowRight } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Button, ButtonLink, Card, Loaded, PageHeader, Badge, EmptyState, SkeletonRows } from '../../ui/index.js';
import { TaskList } from '../../components/TaskList.jsx';
import { useDraftFlow } from '../../components/useDraftFlow.jsx';
import { useCounts } from '../../app/CountsProvider.jsx';

function greetingKey(hour) {
  if (hour < 12) return 'inbox.morning';
  if (hour < 18) return 'inbox.afternoon';
  return 'inbox.evening';
}

function InboxSection({ icon: Icon, title, count, tone = 'neutral', children }) {
  if (count === 0) return null;
  return (
    <Card
      padded={false}
      accent={tone === 'signal' ? 'signal' : undefined}
      title={<span className="flex items-center gap-2"><Icon aria-hidden="true" size={18} className="text-subtle" />{title}<Badge tone={tone}>{count}</Badge></span>}
    >
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  );
}

function InboxRow({ title, meta, action }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors transition-ui hover:bg-hover sm:px-6">
      <div className="min-w-0 flex-1">
        <div dir="auto" className="truncate align-parent font-medium text-fg">{title}</div>
        <div className="text-[13px] text-subtle">{meta}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

export function InboxPage() {
  const { t } = useI18n();
  const format = useFormat();
  const { user } = useAuth();
  const { refresh } = useCounts();
  const result = useLoad('/inbox');
  const reload = () => {
    result.reload();
    refresh();
  };
  const flow = useDraftFlow(reload);

  return (
    <>
      <PageHeader
        eyebrow={format.longDate(new Date().toISOString())}
        title={t(greetingKey(new Date().getHours()), { name: user.display_name })}
        subtitle={result.data && t('inbox.summary', {
          count: result.data.approvals.length + result.data.overdue_tasks.length + result.data.meetings_to_prep.length
            + result.data.meetings_to_summarize.length + result.data.stale_deals.length,
        })}
      />
      <Loaded result={result} skeleton={<Card><SkeletonRows rows={6} /></Card>}>
        {(inbox) => {
          const total = inbox.approvals.length + inbox.overdue_tasks.length + inbox.meetings_to_prep.length
            + inbox.meetings_to_summarize.length + inbox.stale_deals.length;
          if (total === 0) {
            return (
              <Card>
                <EmptyState icon={PartyPopper} title={t('inbox.allClear')} action={<ButtonLink to="/leads" icon={ArrowRight}>{t('inbox.findLeads')}</ButtonLink>}>
                  {t('inbox.allClearHint')}
                </EmptyState>
              </Card>
            );
          }
          return (
            <div className="space-y-6">
              <InboxSection icon={ClipboardCheck} title={t('inbox.approvals')} count={inbox.approvals.length} tone="signal">
                {inbox.approvals.map((item) => (
                  <InboxRow
                    key={item.id}
                    title={`${t(`approvalKind.${item.kind}`)} · ${item.company_name}`}
                    meta={<>{item.contact_name && <><bdi>{item.contact_name}</bdi> · </>}{t('inbox.waitingSince', { date: format.relative(item.created_at) })}</>}
                    action={<Button size="sm" onClick={() => flow.openDraft(item.id)}>{t('inbox.review')}</Button>}
                  />
                ))}
              </InboxSection>

              {inbox.overdue_tasks.length > 0 && (
                <Card accent="signal" title={<span className="flex items-center gap-2"><ListChecks aria-hidden="true" size={18} className="text-subtle" />{t('inbox.overdue')}<Badge tone="danger">{inbox.overdue_tasks.length}</Badge></span>}>
                  <TaskList tasks={inbox.overdue_tasks} onChanged={reload} showCompany />
                </Card>
              )}

              <InboxSection icon={CalendarClock} title={t('inbox.prepMeetings')} count={inbox.meetings_to_prep.length} tone="info">
                {inbox.meetings_to_prep.map((meeting) => (
                  <InboxRow
                    key={meeting.id}
                    title={`${meeting.title} · ${meeting.company_name}`}
                    meta={format.dateTime(meeting.scheduled_at)}
                    action={<ButtonLink size="sm" to={`/meetings/${meeting.id}/prep`}>{t('meetings.prep')}</ButtonLink>}
                  />
                ))}
              </InboxSection>

              <InboxSection icon={NotebookPen} title={t('inbox.summarize')} count={inbox.meetings_to_summarize.length} tone="signal">
                {inbox.meetings_to_summarize.map((meeting) => (
                  <InboxRow
                    key={meeting.id}
                    title={`${meeting.title} · ${meeting.company_name}`}
                    meta={format.dateTime(meeting.scheduled_at)}
                    action={<ButtonLink size="sm" variant="primary" to={`/meetings/${meeting.id}/complete`}>{t('meetings.complete')}</ButtonLink>}
                  />
                ))}
              </InboxSection>

              <InboxSection icon={Hourglass} title={t('inbox.stale', { days: inbox.stale_days })} count={inbox.stale_deals.length}>
                {inbox.stale_deals.map((deal) => (
                  <InboxRow
                    key={deal.id}
                    title={`${deal.company_name} – ${deal.title}`}
                    meta={<>{t('pipeline.idleDays', { days: deal.days_idle })} · {t(`stage.${deal.stage}`)} · <Link className="text-link underline" to={`/deals/${deal.id}`}>{t('inbox.openDeal')}</Link></>}
                    action={deal.can_followup
                      ? <Button size="sm" variant="secondary" onClick={() => flow.openFollowup(deal.id)}>{t('followup.draftNumber', { number: deal.followups_committed + 1, max: inbox.max_followups })}</Button>
                      : <Badge tone="danger">{t('followup.capReached')}</Badge>}
                  />
                ))}
              </InboxSection>
            </div>
          );
        }}
      </Loaded>
      {flow.elements}
    </>
  );
}
