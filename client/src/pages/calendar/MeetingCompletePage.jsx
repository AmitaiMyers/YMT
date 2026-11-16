// Post-meeting workflow as a 3-step wizard: What happened → Tasks → Follow-up.
// One submit at the end creates: summary + decisions, tasks, timeline entry, optional stage change,
// optional summary document, and a follow-up email DRAFT in the approval queue.
// The in-progress form auto-saves to sessionStorage (cleared when the tab closes — confidential notes).

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Plus, Trash2, Check, ClipboardCheck, FileText, Building2, CircleCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Loaded, PageHeader, Button, IconButton, ErrorBox, Notice, Stepper, useToast } from '../../ui/index.js';
import { FieldInput, FieldRow, INPUT_CLASS } from '../../components/EntityForm.jsx';
import { useCounts } from '../../app/CountsProvider.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { LANGUAGES } from '../../../../shared/enums.js';

const EMPTY_TASK = { description: '', assignee: '', due_date: '', is_client_commitment: false };
const STEPS = ['happened', 'tasks', 'followup'];
const FIELD_CLASS = `${INPUT_CLASS} border-line-strong`;
// Direction-dependent icon: "back" points to the reading start, so it mirrors in RTL.
const BackIcon = (props) => <ArrowLeft {...props} className="rtl:-scale-x-100" />;

function storageKey(meetingId) {
  return `ymt.meetingDraft.${meetingId}`;
}

function readDraft(meetingId, fallback) {
  const stored = window.sessionStorage.getItem(storageKey(meetingId));
  return stored === null ? fallback : JSON.parse(stored);
}

function TaskRows({ tasks, setTasks }) {
  const { t } = useI18n();
  const updateTask = (index, key, value) => setTasks(tasks.map((task, i) => (i === index ? { ...task, [key]: value } : task)));
  return (
    <div className="space-y-3">
      {tasks.length === 0 && <p className="text-sm text-muted">{t('complete.noTasksYet')}</p>}
      {tasks.map((task, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <fieldset key={index} className="animate-rise grid grid-cols-1 gap-2 rounded-[10px] border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-center">
          <legend className="sr-only">{t('complete.taskNumber', { number: index + 1 })}</legend>
          <input aria-label={t('task.description')} dir="auto" className={FIELD_CLASS} placeholder={t('task.description')} value={task.description} onChange={(e) => updateTask(index, 'description', e.target.value)} />
          <input aria-label={t('task.assignee')} dir="auto" className={FIELD_CLASS} placeholder={t('task.assignee')} value={task.assignee} onChange={(e) => updateTask(index, 'assignee', e.target.value)} />
          <input aria-label={t('task.due')} type="date" className={FIELD_CLASS} value={task.due_date} onChange={(e) => updateTask(index, 'due_date', e.target.value)} />
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={task.is_client_commitment} onChange={(e) => updateTask(index, 'is_client_commitment', e.target.checked)} />
            {t('task.commitment')}
          </label>
          <IconButton icon={Trash2} label={t('complete.removeTask', { number: index + 1 })} onClick={() => setTasks(tasks.filter((_, i) => i !== index))} />
        </fieldset>
      ))}
      <Button variant="secondary" icon={Plus} offlineOk onClick={() => setTasks([...tasks, EMPTY_TASK])}>{t('complete.addTask')}</Button>
    </div>
  );
}

function Outcome({ outcome, companyId }) {
  const { t } = useI18n();
  const items = [
    { icon: CircleCheck, text: t('complete.doneTimeline') },
    outcome.approval_id && { icon: ClipboardCheck, text: t('complete.doneApproval'), to: '/approvals' },
    outcome.document_id && { icon: FileText, text: t('complete.doneDocument'), to: `/documents/${outcome.document_id}` },
    companyId && { icon: Building2, text: t('complete.backToClient'), to: `/companies/${companyId}` },
  ].filter(Boolean);
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <span className="animate-pop flex h-10 w-10 items-center justify-center rounded-full bg-success text-white"><Check aria-hidden="true" size={22} strokeWidth={3} /></span>
        <h2 className="text-lg font-semibold">{t('complete.doneTitle')}</h2>
      </div>
      <ul className="space-y-2">
        {items.map(({ icon: Icon, text, to }) => (
          <li key={text} className="flex items-center gap-2 text-sm">
            <Icon aria-hidden="true" size={16} className="text-subtle" />
            {to ? <Link className="text-link underline" to={to}>{text}</Link> : text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CompleteWizard({ prep, workflows }) {
  const { t, language } = useI18n();
  const toast = useToast();
  const { refresh } = useCounts();
  const options = useEnumOptions();
  const meetingId = prep.meeting.id;
  const workflow = prep.deal ? workflows.find((w) => w.id === prep.deal.workflow_id) : null;
  // The person the meeting was with comes first as the follow-up recipient.
  const contactsWithEmail = prep.contacts.filter((c) => c.email)
    .sort((a, b) => Number(b.id === prep.meeting.contact_id) - Number(a.id === prep.meeting.contact_id));
  const hasCompany = prep.company !== null;
  const initial = {
    step: 0,
    form: {
      summary: '', decisions: '', new_stage: '',
      followup_contact_id: contactsWithEmail[0] ? String(contactsWithEmail[0].id) : '',
      language: contactsWithEmail[0]?.preferred_language ?? language,
      create_summary_document: hasCompany, // a summary document belongs to a company file
    },
    tasks: [],
  };
  const [draft, setDraft] = useState(() => readDraft(meetingId, initial));
  const [outcome, setOutcome] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const { step, form, tasks } = draft;

  useEffect(() => {
    if (outcome === null) window.sessionStorage.setItem(storageKey(meetingId), JSON.stringify(draft));
  }, [draft, meetingId, outcome]);

  const setForm = (key, value) => setDraft((d) => ({ ...d, form: { ...d.form, [key]: value } }));
  const setTasks = (next) => setDraft((d) => ({ ...d, tasks: next }));
  const goTo = (next) => setDraft((d) => ({ ...d, step: next }));
  const incompleteTask = tasks.findIndex((task) => !task.description.trim() || !task.assignee.trim());

  const submit = useAction(() => post(`/meetings/${meetingId}/complete`, {
    summary: form.summary,
    decisions: form.decisions || null,
    new_stage: form.new_stage || null,
    followup_contact_id: form.followup_contact_id ? Number(form.followup_contact_id) : null,
    language: form.language,
    create_summary_document: hasCompany && form.create_summary_document,
    tasks: tasks.map((task) => ({ ...task, due_date: task.due_date || null })),
  }));

  if (outcome) return <Outcome outcome={outcome} companyId={hasCompany ? prep.company.id : null} />;

  function next() {
    if (step === 0 && !form.summary.trim()) {
      setSummaryError(t('form.required'));
      document.getElementById('wizard-summary').focus();
      return;
    }
    setSummaryError(null);
    goTo(step + 1);
  }

  async function finish() {
    const result = await submit.run();
    if (result === undefined) return;
    window.sessionStorage.removeItem(storageKey(meetingId));
    toast({ title: t('complete.doneTitle') });
    refresh();
    setOutcome(result);
  }

  const happenedFields = [
    { name: 'summary', label: t('complete.summary'), type: 'textarea', required: true, wide: true, rows: 6 },
    { name: 'decisions', label: t('complete.decisions'), type: 'textarea', wide: true, rows: 4, help: t('complete.decisionsHelp') },
    ...(workflow ? [{ name: 'new_stage', label: t('complete.newStage'), type: 'select', options: options('stage', workflow.stages) }] : []),
  ];
  const followupFields = [
    { name: 'followup_contact_id', label: t('complete.followupContact'), type: 'select', help: t('complete.followupHelp'),
      options: contactsWithEmail.map((c) => ({ value: String(c.id), label: `${c.full_name} <${c.email}>` })) },
    { name: 'language', label: t('contact.language'), type: 'select', required: true, options: options('language', LANGUAGES) },
    ...(hasCompany ? [{ name: 'create_summary_document', label: t('complete.createDocument'), type: 'checkbox', wide: true }] : []),
  ];
  const renderFields = (fields) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const inputId = field.name === 'summary' ? 'wizard-summary' : `wizard-${field.name}`;
        const error = field.name === 'summary' ? summaryError : null;
        return (
          <FieldRow key={field.name} field={field} inputId={inputId} errorId={`${inputId}-hint`} error={error}>
            <FieldInput field={field} inputId={inputId} errorId={error || field.help ? `${inputId}-hint` : undefined} invalid={Boolean(error)} value={form[field.name]} onChange={(value) => setForm(field.name, value)} />
          </FieldRow>
        );
      })}
    </div>
  );

  return (
    <>
      <Stepper label={t('complete.title')} current={step} steps={STEPS.map((key) => ({ key, label: t(`complete.step.${key}`) }))} />
      <Card title={t(`complete.step.${STEPS[step]}`)}>
        <ErrorBox message={submit.error} />
        <div key={step} className="animate-rise">
          {step === 0 && renderFields(happenedFields)}
          {step === 1 && <TaskRows tasks={tasks} setTasks={setTasks} />}
          {step === 2 && (
            <>
              {renderFields(followupFields)}
              <div className="mt-4"><Notice>{t('complete.hitlNote')}</Notice></div>
            </>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {step > 0 && <Button variant="secondary" icon={BackIcon} offlineOk onClick={() => goTo(step - 1)}>{t('common.back')}</Button>}
          {step < STEPS.length - 1 && (
            <Button
              offlineOk
              disabled={step === 1 && incompleteTask !== -1}
              disabledReason={t('complete.taskIncomplete', { number: incompleteTask + 1 })}
              onClick={next}
            >
              {t('common.next')}<ArrowRight aria-hidden="true" size={16} className="rtl:-scale-x-100" />
            </Button>
          )}
          {step === STEPS.length - 1 && <Button variant="success" icon={Check} loading={submit.busy} loadingLabel={t('common.saving')} onClick={finish}>{t('complete.submit')}</Button>}
          <span className="ms-auto text-[13px] text-subtle">{t('complete.autosaved')}</span>
        </div>
      </Card>
    </>
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
          <PageHeader eyebrow={t('complete.title')} title={data.meeting.title} subtitle={<bdi>{[data.person && data.person.full_name, data.company && data.company.name].filter(Boolean).join(' · ')}</bdi>} />
          {data.meeting.status !== 'scheduled'
            ? <Notice>{t('complete.alreadyDone')}</Notice>
            : <Loaded result={workflows}>{(rows) => <CompleteWizard prep={data} workflows={rows} />}</Loaded>}
        </>
      )}
    </Loaded>
  );
}
