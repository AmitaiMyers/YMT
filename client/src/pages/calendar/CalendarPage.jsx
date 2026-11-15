// Calendar: meetings grouped by Today / This week / Later, plus past meetings waiting for a summary.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarDays, Plus, NotebookPen } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Button, Card, Loaded, PageHeader, EmptyState, StatusBadge, statusTone, SkeletonRows } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { TaskList } from '../../components/TaskList.jsx';
import { MeetingActions } from '../company/MeetingsTab.jsx';
import { useMeetingFields, withIds } from '../../fields.js';

const DAY_MS = 86400000;

/** Pure: bucket meetings by when they happen relative to now. */
export function groupMeetings(meetings, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + DAY_MS;
  const endOfWeek = startOfToday + 7 * DAY_MS;
  const groups = { needsSummary: [], today: [], week: [], later: [], past: [] };
  const sorted = [...meetings].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  for (const meeting of sorted) {
    const time = Date.parse(meeting.scheduled_at);
    if (meeting.status === 'scheduled' && time < now.getTime()) groups.needsSummary.push(meeting);
    else if (meeting.status !== 'scheduled') groups.past.unshift(meeting);
    else if (time < endOfToday) groups.today.push(meeting);
    else if (time < endOfWeek) groups.week.push(meeting);
    else groups.later.push(meeting);
  }
  return groups;
}

function MeetingRow({ meeting }) {
  const format = useFormat();
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
      <time dateTime={meeting.scheduled_at} className="tabular w-36 shrink-0 text-sm font-medium text-fg">{format.dateTime(meeting.scheduled_at)}</time>
      <div className="min-w-0 flex-1">
        <span dir="auto" className="block truncate align-parent font-medium">{meeting.title}</span>
        <div className="text-[13px] text-subtle"><bdi>{meeting.company_name}</bdi>{meeting.location && <> · <bdi>{meeting.location}</bdi></>}</div>
      </div>
      {meeting.status !== 'scheduled' && <StatusBadge tone={statusTone('meeting', meeting.status)}>{t(`meetingStatus.${meeting.status}`)}</StatusBadge>}
      <MeetingActions meeting={meeting} />
    </li>
  );
}

function MeetingGroup({ title, meetings, accent, icon }) {
  if (meetings.length === 0) return null;
  return (
    <Card padded={false} accent={accent} title={<span className="flex items-center gap-2">{icon}{title}</span>}>
      <ul className="divide-y divide-line">{meetings.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} />)}</ul>
    </Card>
  );
}

function ScheduleForm({ companies, onCreated }) {
  const { t } = useI18n();
  const meetingFields = useMeetingFields([]).filter((field) => field.name !== 'deal_id');
  const fields = [
    { name: 'company_id', label: t('company.name'), type: 'select', required: true, options: companies.map((c) => ({ value: String(c.id), label: c.name })) },
    ...meetingFields,
  ];
  return (
    <EntityForm
      fields={fields}
      resetOnSuccess
      submitLabel={t('meetings.scheduleButton')}
      successMessage={t('toast.meetingScheduled')}
      onSubmit={async (values) => {
        const result = await post('/meetings', withIds(values, ['company_id']));
        onCreated();
        return result;
      }}
    />
  );
}

export function CalendarPage() {
  const { t } = useI18n();
  const location = useLocation();
  const meetings = useLoad('/meetings');
  const tasks = useLoad('/tasks');
  const companies = useLoad('/companies');
  const [scheduling, setScheduling] = useState(location.hash === '#schedule');
  const scheduleRef = useRef(null);

  useEffect(() => {
    if (scheduling && scheduleRef.current) scheduleRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scheduling]);

  return (
    <>
      <PageHeader title={t('nav.calendar')} subtitle={t('meetings.subtitle')} actions={<Button icon={Plus} offlineOk onClick={() => setScheduling(true)}>{t('meetings.schedule')}</Button>} />
      <div className="space-y-6">
        <Loaded result={meetings} skeleton={<Card><SkeletonRows rows={5} /></Card>}>
          {(rows) => {
            const groups = groupMeetings(rows);
            if (rows.length === 0) {
              return <Card><EmptyState icon={CalendarDays} title={t('meetings.none')} action={<Button icon={Plus} offlineOk onClick={() => setScheduling(true)}>{t('meetings.schedule')}</Button>} /></Card>;
            }
            return (
              <>
                <MeetingGroup title={t('calendar.needsSummary')} meetings={groups.needsSummary} accent="signal" icon={<NotebookPen aria-hidden="true" size={18} className="text-signal-fg" />} />
                <MeetingGroup title={t('calendar.today')} meetings={groups.today} />
                <MeetingGroup title={t('calendar.week')} meetings={groups.week} />
                <MeetingGroup title={t('calendar.later')} meetings={groups.later} />
                <MeetingGroup title={t('calendar.past')} meetings={groups.past.slice(0, 10)} />
              </>
            );
          }}
        </Loaded>
        <div className="grid gap-6 lg:grid-cols-2">
          <div ref={scheduleRef} id="schedule" className="scroll-mt-20">
            <Card title={t('meetings.schedule')}>
              <Loaded result={companies}>{(rows) => <ScheduleForm companies={rows} onCreated={meetings.reload} />}</Loaded>
            </Card>
          </div>
          <Card title={t('task.openTasks')}>
            <Loaded result={tasks}>{(rows) => <TaskList tasks={rows} onChanged={tasks.reload} showCompany />}</Loaded>
          </Card>
        </div>
      </div>
    </>
  );
}
