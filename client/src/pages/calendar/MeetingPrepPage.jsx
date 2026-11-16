// Pre-meeting prep sheet: a one-page, printable briefing.

import { Link, useParams } from 'react-router-dom';
import { Printer, NotebookPen, ShieldCheck } from 'lucide-react';
import { detectLanguage } from '../../lib/text.js';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, PageHeader, DefinitionList, Button, ButtonLink, EmptyState, StatusBadge, statusTone, ExternalLink, GeneratedText, Skeleton } from '../../ui/index.js';
import { Timeline } from '../../components/Timeline.jsx';
import { TaskList } from '../../components/TaskList.jsx';

function ListCard({ title, items, render, empty }) {
  return (
    <Card title={title}>
      {items.length === 0 ? <EmptyState title={empty} /> : <ul className="space-y-2 text-sm">{items.map(render)}</ul>}
    </Card>
  );
}

export function MeetingPrepPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/meetings/${id}/prep`);
  return (
    <Loaded result={result} skeleton={<div className="space-y-4"><Skeleton className="h-9 w-96" /><div className="grid gap-6 lg:grid-cols-2">{[0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-48 rounded-[10px]" />)}</div></div>}>
      {(data) => (
        <>
          <PageHeader
            eyebrow={t('prep.title')}
            title={data.meeting.title}
            subtitle={<bdi>{[data.person && data.person.full_name, data.company && data.company.name, format.dateTime(data.meeting.scheduled_at), data.meeting.location].filter(Boolean).join(' · ')}</bdi>}
            actions={<>
              <Button variant="secondary" icon={Printer} offlineOk onClick={() => window.print()}>{t('common.print')}</Button>
              {data.meeting.status === 'scheduled' && <ButtonLink variant="primary" icon={NotebookPen} to={`/meetings/${id}/complete`}>{t('meetings.complete')}</ButtonLink>}
            </>}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            {data.company ? (
            <Card title={t('prep.company')}>
              <DefinitionList items={[
                [t('company.industry'), data.company.industry],
                [t('company.employees'), format.number(data.company.employee_count)],
                [t('company.revenue'), format.usd(data.company.annual_revenue_usd)],
                [t('company.indiaActivity'), t(`indiaActivity.${data.company.india_activity}`)],
                [t('meeting.attendees'), data.meeting.attendees],
                [t('meeting.deal'), data.deal ? `${data.deal.title} (${t(`stage.${data.deal.stage}`)})` : null],
              ]} />
              {data.company.approved_brief && (
                <div className="mt-5 rounded-[6px] border border-line bg-canvas p-3 text-sm">
                  <GeneratedText text={data.company.approved_brief} language={detectLanguage(data.company.approved_brief)} />
                </div>
              )}
            </Card>
            ) : (
              <Card title={t('prep.person')}>
                <DefinitionList items={[
                  [t('contact.fullName'), data.person ? data.person.full_name : null],
                  [t('contact.jobTitle'), data.person ? data.person.job_title : null],
                  [t('contact.email'), data.person && data.person.email ? <bdi key="e" dir="ltr">{data.person.email}</bdi> : null],
                  [t('contact.phone'), data.person && data.person.phone ? <bdi key="p" dir="ltr">{data.person.phone}</bdi> : null],
                  [t('meeting.attendees'), data.meeting.attendees],
                ]} />
                <p className="mt-4 text-[13px] text-subtle">{t('prep.noOrganization')}</p>
              </Card>
            )}
            <ListCard
              title={t('prep.contacts')} items={data.contacts} empty={t('contact.none')}
              render={(c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <bdi className="font-medium">{c.full_name}</bdi>
                  <span className="text-subtle">– <bdi>{c.job_title ?? t(`department.${c.department}`)}</bdi></span>
                  {c.verified ? <ShieldCheck aria-label={t('contact.verifiedShort')} size={15} className="text-success-fg" /> : null}
                </li>
              )}
            />
            <ListCard
              title={t('prep.previousMeetings')} items={data.previous_meetings} empty={t('meetings.none')}
              render={(m) => (
                <li key={m.id}>
                  <div className="font-medium">{format.date(m.scheduled_at)} – <bdi>{m.title}</bdi></div>
                  {m.decisions && <GeneratedText text={m.decisions} language={detectLanguage(m.decisions)} className="text-[13px] text-muted" />}
                </li>
              )}
            />
            <Card title={t('prep.openTasks')}><TaskList tasks={data.open_tasks} onChanged={result.reload} /></Card>
            <ListCard
              title={t('prep.openDocuments')} items={data.open_documents} empty={t('document.none')}
              render={(d) => <li key={d.id} className="flex items-center gap-2"><Link className="text-link underline" to={`/documents/${d.id}`}><bdi>{d.title}</bdi></Link><StatusBadge tone={statusTone('document', d.status)}>{t(`documentStatus.${d.status}`)}</StatusBadge></li>}
            />
            <ListCard
              title={t('prep.triggers')} items={data.recent_triggers} empty={t('leads.noTriggers')}
              render={(tr) => <li key={tr.id}>{format.date(tr.detected_on)} · <bdi>{tr.description}</bdi> <ExternalLink href={tr.source_url}>{t('common.source')}</ExternalLink></li>}
            />
          </div>
          <div className="mt-6"><Card title={t('prep.recentInteractions')}><Timeline interactions={data.recent_interactions} /></Card></div>
        </>
      )}
    </Loaded>
  );
}
