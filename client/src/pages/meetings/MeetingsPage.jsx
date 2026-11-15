import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Loaded, PageHeader, Table } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { TaskList } from '../../components/TaskList.jsx';
import { useMeetingColumns } from '../company/MeetingsTab.jsx';
import { useMeetingFields, withIds } from '../../fields.js';

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
      onSubmit={async (values) => {
        const result = await post('/meetings', withIds(values, ['company_id']));
        onCreated();
        return result;
      }}
    />
  );
}

export function MeetingsPage() {
  const { t } = useI18n();
  const meetings = useLoad('/meetings');
  const tasks = useLoad('/tasks');
  const companies = useLoad('/companies');
  const columns = useMeetingColumns({ showCompany: true });
  return (
    <>
      <PageHeader title={t('nav.meetings')} subtitle={t('meetings.subtitle')} />
      <div className="space-y-6">
        <Card title={t('meetings.list')}>
          <Loaded result={meetings}>{(rows) => <Table columns={columns} rows={rows} empty={t('meetings.none')} />}</Loaded>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('meetings.schedule')}>
            <Loaded result={companies}>{(rows) => <ScheduleForm companies={rows} onCreated={meetings.reload} />}</Loaded>
          </Card>
          <Card title={t('task.openTasks')}>
            <Loaded result={tasks}>{(rows) => <TaskList tasks={rows} onChanged={tasks.reload} showCompany />}</Loaded>
          </Card>
        </div>
      </div>
    </>
  );
}
