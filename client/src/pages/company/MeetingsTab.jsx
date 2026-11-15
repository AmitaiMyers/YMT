import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, NotebookPen } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { post } from '../../api.js';
import { Card, StatusBadge, statusTone, Table, EmptyState } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { TaskList, useTaskFields } from '../../components/TaskList.jsx';
import { useMeetingFields, withIds } from '../../fields.js';

export function MeetingActions({ meeting }) {
  const { t } = useI18n();
  const past = meeting.scheduled_at < new Date().toISOString();
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <Link className="inline-flex items-center gap-1 text-link underline" to={`/meetings/${meeting.id}/prep`}><ClipboardList aria-hidden="true" size={14} />{t('meetings.prep')}</Link>
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
    { key: 'title', label: t('meeting.title') },
    { key: 'status', label: t('meeting.status'), render: (m) => <StatusBadge tone={statusTone('meeting', m.status)}>{t(`meetingStatus.${m.status}`)}</StatusBadge> },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (m) => <MeetingActions meeting={m} /> },
  ];
}

export function MeetingsTab({ data, reload }) {
  const { t } = useI18n();
  const meetingFields = useMeetingFields(data.deals.filter((d) => d.status === 'open'));
  const taskFields = useTaskFields();
  const columns = useMeetingColumns({ showCompany: false });
  const companyId = data.company.id;
  return (
    <div className="space-y-6">
      <Card title={t('meetings.list')}>
        <Table caption={t('meetings.list')} columns={columns} rows={data.meetings} empty={<EmptyState icon={CalendarDays} title={t('meetings.none')} />} />
      </Card>
      <Card title={t('meetings.schedule')}>
        <EntityForm
          fields={meetingFields}
          resetOnSuccess
          submitLabel={t('meetings.scheduleButton')}
          successMessage={t('toast.meetingScheduled')}
          onSubmit={async (values) => {
            const result = await post('/meetings', withIds({ ...values, company_id: companyId }, ['deal_id']));
            reload();
            return result;
          }}
        />
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
    </div>
  );
}
