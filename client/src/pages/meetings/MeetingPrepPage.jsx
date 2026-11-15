// Pre-meeting prep sheet: a one-page, printable briefing.

import { Link, useParams } from 'react-router-dom';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, PageHeader, DefinitionList, Button, Empty, Badge, ExternalLink } from '../../components/ui.jsx';
import { Timeline } from '../../components/Timeline.jsx';
import { TaskList } from '../../components/TaskList.jsx';

function Section({ title, items, render, empty }) {
  return (
    <Card title={title}>
      {items.length === 0 ? <Empty>{empty}</Empty> : <ul className="space-y-2 text-sm">{items.map(render)}</ul>}
    </Card>
  );
}

export function MeetingPrepPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/meetings/${id}/prep`);
  return (
    <Loaded result={result}>
      {(data) => (
        <>
          <PageHeader
            title={`${t('prep.title')}: ${data.meeting.title}`}
            subtitle={`${data.company.name} · ${format.dateTime(data.meeting.scheduled_at)}${data.meeting.location ? ` · ${data.meeting.location}` : ''}`}
            actions={<>
              <Button variant="secondary" onClick={() => window.print()}>{t('common.print')}</Button>
              {data.meeting.status === 'scheduled' && <Link className="rounded-md bg-brand-900 px-3 py-2 text-sm text-white" to={`/meetings/${id}/complete`}>{t('meetings.complete')}</Link>}
            </>}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t('prep.company')}>
              <DefinitionList items={[
                [t('company.industry'), data.company.industry],
                [t('company.employees'), format.number(data.company.employee_count)],
                [t('company.revenue'), format.usd(data.company.annual_revenue_usd)],
                [t('company.indiaActivity'), t(`indiaActivity.${data.company.india_activity}`)],
                [t('meeting.attendees'), data.meeting.attendees],
                [t('meeting.deal'), data.deal ? `${data.deal.title} (${t(`stage.${data.deal.stage}`)})` : null],
              ]} />
              {data.company.approved_brief && <pre className="prose-pre mt-4 rounded bg-slate-50 p-3 text-xs">{data.company.approved_brief}</pre>}
            </Card>
            <Section
              title={t('prep.contacts')} items={data.contacts} empty={t('contact.none')}
              render={(c) => <li key={c.id}>{c.full_name} – {c.job_title ?? t(`department.${c.department}`)} {c.verified ? '✓' : ''}</li>}
            />
            <Section
              title={t('prep.previousMeetings')} items={data.previous_meetings} empty={t('meetings.none')}
              render={(m) => (
                <li key={m.id}>
                  <div className="font-medium">{format.date(m.scheduled_at)} – {m.title}</div>
                  {m.decisions && <pre className="prose-pre text-xs text-slate-600">{m.decisions}</pre>}
                </li>
              )}
            />
            <Card title={t('prep.openTasks')}><TaskList tasks={data.open_tasks} onChanged={result.reload} /></Card>
            <Section
              title={t('prep.openDocuments')} items={data.open_documents} empty={t('document.none')}
              render={(d) => <li key={d.id}><Link className="text-brand-700 underline" to={`/documents/${d.id}`}>{d.title}</Link> <Badge>{t(`documentStatus.${d.status}`)}</Badge></li>}
            />
            <Section
              title={t('prep.triggers')} items={data.recent_triggers} empty={t('leads.noTriggers')}
              render={(tr) => <li key={tr.id}>{format.date(tr.detected_on)} · {tr.description} <ExternalLink href={tr.source_url}>{t('common.source')}</ExternalLink></li>}
            />
          </div>
          <Card title={t('prep.recentInteractions')} className="mt-6"><Timeline interactions={data.recent_interactions} /></Card>
        </>
      )}
    </Loaded>
  );
}
