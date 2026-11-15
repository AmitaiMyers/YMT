import { useState } from 'react';
import { Save, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post } from '../../api.js';
import { Card, Loaded, Button, ErrorBox, Notice, useToast } from '../../ui/index.js';
import { INPUT_CLASS } from '../../components/EntityForm.jsx';
import { PIPELINE_STAGES } from '../../../../shared/enums.js';

const NEW_WORKFLOW = { name_he: '', name_en: '', stages: PIPELINE_STAGES, active: true };
const FIELD_CLASS = `${INPUT_CLASS} border-line-strong mt-1.5`;

function WorkflowEditor({ workflow, onSaved }) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState({ ...workflow, active: Boolean(workflow.active) });
  const isNew = workflow.id === undefined;
  const save = useAction(async () => {
    const body = { name_he: draft.name_he, name_en: draft.name_en, stages: draft.stages, active: draft.active };
    const result = isNew ? await post('/workflows', body) : await patch(`/workflows/${workflow.id}`, body);
    toast({ title: isNew ? t('toast.workflowCreated') : t('toast.saved') });
    if (isNew) setDraft(NEW_WORKFLOW);
    onSaved();
    return result;
  });
  const toggleStage = (stage) => setDraft((d) => ({
    ...d, stages: d.stages.includes(stage) ? d.stages.filter((s) => s !== stage) : PIPELINE_STAGES.filter((s) => s === stage || d.stages.includes(s)),
  }));
  const missing = !draft.name_he.trim() || !draft.name_en.trim() ? t('settings.workflowNamesRequired') : draft.stages.length === 0 ? t('settings.workflowStagesRequired') : null;
  return (
    <div className="rounded-[10px] border border-line p-4">
      <ErrorBox message={save.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{t('settings.nameHe')}<input dir="rtl" lang="he" className={FIELD_CLASS} value={draft.name_he} onChange={(e) => setDraft({ ...draft, name_he: e.target.value })} /></label>
        <label className="block text-sm font-medium">{t('settings.nameEn')}<input dir="ltr" lang="en" className={FIELD_CLASS} value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} /></label>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium">{t('settings.stages')}</legend>
        <div className="flex flex-wrap gap-2">
          {PIPELINE_STAGES.map((stage) => {
            const on = draft.stages.includes(stage);
            return (
              <label key={stage} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors transition-ui ${on ? 'border-link bg-info-soft text-fg' : 'border-line-strong text-muted'}`}>
                <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={on} onChange={() => toggleStage(stage)} />{t(`stage.${stage}`)}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />{t('settings.active')}
        </label>
        <Button icon={isNew ? Plus : Save} loading={save.busy} disabled={missing !== null} disabledReason={missing ?? undefined} onClick={save.run}>{isNew ? t('common.create') : t('common.save')}</Button>
      </div>
    </div>
  );
}

export function WorkflowsSettings() {
  const { t } = useI18n();
  const result = useLoad('/workflows');
  return (
    <Card title={t('settings.workflows')}>
      <Notice>{t('settings.workflowsHelp')}</Notice>
      <Loaded result={result}>
        {(rows) => (
          <div className="space-y-4">
            {rows.map((workflow) => <WorkflowEditor key={`${workflow.id}-${workflow.stages.join()}-${workflow.active}`} workflow={workflow} onSaved={result.reload} />)}
            <h3 className="pt-2 text-sm font-semibold">{t('settings.newWorkflow')}</h3>
            <WorkflowEditor workflow={NEW_WORKFLOW} onSaved={result.reload} />
          </div>
        )}
      </Loaded>
    </Card>
  );
}
