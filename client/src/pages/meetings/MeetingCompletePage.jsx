// Post-meeting workflow: one quick form → summary, decisions, tasks, stage update,
// optional summary document, and a follow-up email draft placed in the approval queue.

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Loaded, PageHeader, Button, ErrorBox, Notice } from '../../components/ui.jsx';
import { FieldInput, FieldRow, INPUT_CLASS } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { LANGUAGES } from '../../../../shared/enums.js';

const EMPTY_TASK = { description: '', assignee: '', due_date: '', is_client_commitment: false };

function TaskRows({ tasks, setTasks }) {
  const { t } = useI18n();
  const updateTask = (index, key, value) => setTasks(tasks.map((task, i) => (i === index ? { ...task, [key]: value } : task)));
  return (
    <div className="space-y-2">
      {tasks.map((task, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-center">
          <input className={INPUT_CLASS} placeholder={t('task.description')} value={task.description} onChange={(e) => updateTask(index, 'description', e.target.value)} required />
          <input className={INPUT_CLASS} placeholder={t('task.assignee')} value={task.assignee} onChange={(e) => updateTask(index, 'assignee', e.target.value)} required />
          <input type="date" className={INPUT_CLASS} value={task.due_date} onChange={(e) => updateTask(index, 'due_date', e.target.value)} />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={task.is_client_commitment} onChange={(e) => updateTask(index, 'is_client_commitment', e.target.checked)} />
            {t('task.commitment')}
          </label>
          <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setTasks(tasks.filter((_, i) => i !== index))}>✕</Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => setTasks([...tasks, EMPTY_TASK])}>{t('complete.addTask')}</Button>
    </div>
  );
}

function CompleteForm({ prep, workflows }) {
  const { t, language } = useI18n();
  const options = useEnumOptions();
  const workflow = prep.deal ? workflows.find((w) => w.id === prep.deal.workflow_id) : null;
  const contactsWithEmail = prep.contacts.filter((c) => c.email);
  const [form, setForm] = useState({
    summary: '', decisions: '', new_stage: '', followup_contact_id: contactsWithEmail[0] ? String(contactsWithEmail[0].id) : '',
    language: contactsWithEmail[0]?.preferred_language ?? language, create_summary_document: true,
  });
  const [tasks, setTasks] = useState([]);
  const submit = useAction(() => post(`/meetings/${prep.meeting.id}/complete`, {
    summary: form.summary,
    decisions: form.decisions || null,
    new_stage: form.new_stage || null,
    followup_contact_id: form.followup_contact_id ? Number(form.followup_contact_id) : null,
    language: form.language,
    create_summary_document: form.create_summary_document,
    tasks: tasks.map((task) => ({ ...task, due_date: task.due_date || null })),
  }));
  const [outcome, setOutcome] = useState(null);

  if (outcome) {
    return (
      <Card title={t('complete.doneTitle')}>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          <li>{t('complete.doneTimeline')}</li>
          {outcome.approval_id && <li><Link className="text-brand-500 underline" to="/approvals">{t('complete.doneApproval')}</Link></li>}
          {outcome.document_id && <li><Link className="text-brand-500 underline" to={`/documents/${outcome.document_id}`}>{t('complete.doneDocument')}</Link></li>}
          <li><Link className="text-brand-500 underline" to={`/companies/${prep.company.id}`}>{t('complete.backToClient')}</Link></li>
        </ul>
      </Card>
    );
  }

  const fields = [
    { name: 'summary', label: t('complete.summary'), type: 'textarea', required: true, wide: true, rows: 5 },
    { name: 'decisions', label: t('complete.decisions'), type: 'textarea', wide: true, rows: 4, help: t('complete.decisionsHelp') },
    ...(workflow ? [{ name: 'new_stage', label: t('complete.newStage'), type: 'select', options: options('stage', workflow.stages) }] : []),
    { name: 'followup_contact_id', label: t('complete.followupContact'), type: 'select', help: t('complete.followupHelp'),
      options: contactsWithEmail.map((c) => ({ value: String(c.id), label: `${c.full_name} <${c.email}>` })) },
    { name: 'language', label: t('contact.language'), type: 'select', required: true, options: options('language', LANGUAGES) },
    { name: 'create_summary_document', label: t('complete.createDocument'), type: 'checkbox' },
  ];

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      const result = await submit.run();
      if (result !== undefined) setOutcome(result);
    }}
    >
      <Card title={t('complete.formTitle')}>
        <ErrorBox message={submit.error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <FieldRow key={field.name} field={field}>
              <FieldInput field={field} value={form[field.name]} onChange={(value) => setForm((f) => ({ ...f, [field.name]: value }))} />
            </FieldRow>
          ))}
        </div>
        <h3 className="mb-2 mt-6 text-sm font-semibold">{t('complete.tasks')}</h3>
        <TaskRows tasks={tasks} setTasks={setTasks} />
        <Notice>{t('complete.hitlNote')}</Notice>
        <Button type="submit" disabled={submit.busy}>{t('complete.submit')}</Button>
      </Card>
    </form>
  );
}

export function MeetingCompletePage() {
  const { id } = useParams();
  const { t } = useI18n();
  const prep = useLoad(`/meetings/${id}/prep`);
  const workflows = useLoad('/workflows');
  return (
    <Loaded result={prep}>
      {(data) => (
        <>
          <PageHeader title={`${t('complete.title')}: ${data.meeting.title}`} subtitle={data.company.name} />
          {data.meeting.status !== 'scheduled'
            ? <Notice>{t('complete.alreadyDone')}</Notice>
            : <Loaded result={workflows}>{(rows) => <CompleteForm prep={data} workflows={rows} />}</Loaded>}
        </>
      )}
    </Loaded>
  );
}
