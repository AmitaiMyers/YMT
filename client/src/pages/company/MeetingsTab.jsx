import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ClipboardList, NotebookPen } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { post } from '../../api.js';
import { Button, Card, StatusBadge, statusTone, Table, EmptyState } from '../../ui/index.js';
import { ScheduleMeetingDialog } from '../../components/ScheduleMeetingDialog.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { TaskList, useTaskFields } from '../../components/TaskList.jsx';
import { useViewMode } from '../../app/viewMode.jsx';

export function MeetingActions({ meeting }) {
  const { t } = useI18n();
  const { shows } = useViewMode();
  const past = meeting.scheduled_at < new Date().toISOString();
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {shows('meetingPrep') && <Link className="inline-flex items-center gap-1 text-link underline" to={`/meetings/${meeting.id}/prep`}><ClipboardList aria-hidden="true" size={14} />{t('meetings.prep')}</Link>}
      {meeting.status === 'scheduled' && (
        <Link className={`inline-flex items-center gap-1 underline ${past ? 'font-semibold text-signal-fg' : 'text-link'}`} to={`/meetings/${meeting.id}/complete`}>
          <NotebookPen aria-hidden="true" size={14} />{t('meetings.complete')}
        </Link>
      )}
    </div>
  );
}

export function useMeetingColumns({ showCompany }) {
  const { t } = useI18n();
  const format = useFormat();
  return [
    { key: 'scheduled_at', label: t('meeting.scheduledAt'), render: (m) => format.dateTime(m.scheduled_at) },
    ...(showCompany ? [{ key: 'company_name', label: t('company.name'), render: (m) => <Link className="text-link hover:underline" to={`/companies/${m.company_id}`}><bdi>{m.company_name}</bdi></Link> }] : []),
    { key: 'title', label: t('meeting.title'), render: (m) => <span><bdi>{m.title}</bdi>{m.contact_name && <span className="block text-[13px] text-subtle"><bdi>{m.contact_name}</bdi></span>}</span> },
    { key: 'status', label: t('meeting.status'), render: (m) => <StatusBadge tone={statusTone('meeting', m.status)}>{t(`meetingStatus.${m.status}`)}</StatusBadge> },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (m) => <MeetingActions meeting={m} /> },
  ];
}

export function MeetingsTab({ data, reload }) {
  const { t } = useI18n();
  const [scheduling, setScheduling] = useState(false);
  const taskFields = useTaskFields();
  const columns = useMeetingColumns({ showCompany: false });
  const companyId = data.company.id;
  return (
    <div className="space-y-6">
      <Card title={t('meetings.list')} actions={<Button size="sm" icon={CalendarPlus} offlineOk onClick={() => setScheduling(true)}>{t('meetings.schedule')}</Button>}>
        <Table caption={t('meetings.list')} columns={columns} rows={data.meetings} empty={<EmptyState icon={CalendarDays} title={t('meetings.none')} />} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('task.listTitle')}><TaskList tasks={data.tasks} onChanged={reload} /></Card>
        <Card title={t('task.add')}>
          <EntityForm
            fields={taskFields}
            initial={{ is_client_commitment: false }}
            resetOnSuccess
            successMessage={t('toast.taskAdded')}
            onSubmit={async (values) => {
              const result = await post('/tasks', { ...values, company_id: companyId });
              reload();
              return result;
            }}
          />
        </Card>
      </div>
      <ScheduleMeetingDialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        onScheduled={reload}
        company={{ id: companyId, name: data.company.name, deals: data.deals.filter((d) => d.status === 'open') }}
      />
    </div>
  );
}
