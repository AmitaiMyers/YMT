import { Link } from 'react-router-dom';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { post } from '../../api.js';
import { Card, Badge, Table } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { TaskList, useTaskFields } from '../../components/TaskList.jsx';
import { useMeetingFields, withIds } from '../../fields.js';

const MEETING_STATUS_COLORS = { scheduled: 'blue', done: 'green', cancelled: 'gray' };

export function MeetingActions({ meeting }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <Link className="text-brand-500 underline" to={`/meetings/${meeting.id}/prep`}>{t('meetings.prep')}</Link>
      {meeting.status === 'scheduled' && <Link className="text-brand-500 underline" to={`/meetings/${meeting.id}/complete`}>{t('meetings.complete')}</Link>}
    </div>
  );
}

export function useMeetingColumns({ showCompany }) {
  const { t } = useI18n();
  const format = useFormat();
  return [
    { key: 'scheduled_at', label: t('meeting.scheduledAt'), render: (m) => format.dateTime(m.scheduled_at) },
    ...(showCompany ? [{ key: 'company_name', label: t('company.name'), render: (m) => <Link className="text-brand-700 hover:underline" to={`/companies/${m.company_id}`}>{m.company_name}</Link> }] : []),
    { key: 'title', label: t('meeting.title') },
    { key: 'status', label: t('meeting.status'), render: (m) => <Badge color={MEETING_STATUS_COLORS[m.status]}>{t(`meetingStatus.${m.status}`)}</Badge> },
    { key: 'actions', label: '', render: (m) => <MeetingActions meeting={m} /> },
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
        <Table columns={columns} rows={data.meetings} empty={t('meetings.none')} />
      </Card>
      <Card title={t('meetings.schedule')}>
        <EntityForm
          fields={meetingFields}
          resetOnSuccess
          submitLabel={t('meetings.scheduleButton')}
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
