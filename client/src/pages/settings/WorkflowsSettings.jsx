import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post } from '../../api.js';
import { Card, Loaded, Button, ErrorBox, Notice } from '../../components/ui.jsx';
import { INPUT_CLASS } from '../../components/EntityForm.jsx';
import { PIPELINE_STAGES } from '../../../../shared/enums.js';

const NEW_WORKFLOW = { name_he: '', name_en: '', stages: PIPELINE_STAGES, active: true };

function WorkflowEditor({ workflow, onSaved }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ ...workflow, active: Boolean(workflow.active) });
  const isNew = workflow.id === undefined;
  const save = useAction(async () => {
    const body = { name_he: draft.name_he, name_en: draft.name_en, stages: draft.stages, active: draft.active };
    const result = isNew ? await post('/workflows', body) : await patch(`/workflows/${workflow.id}`, body);
    if (isNew) setDraft(NEW_WORKFLOW);
    onSaved();
    return result;
  });
  const toggleStage = (stage) => setDraft((d) => ({
    ...d, stages: d.stages.includes(stage) ? d.stages.filter((s) => s !== stage) : PIPELINE_STAGES.filter((s) => s === stage || d.stages.includes(s)),
  }));
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <ErrorBox message={save.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{t('settings.nameHe')}<input dir="rtl" className={INPUT_CLASS} value={draft.name_he} onChange={(e) => setDraft({ ...draft, name_he: e.target.value })} /></label>
        <label className="text-sm">{t('settings.nameEn')}<input dir="ltr" className={INPUT_CLASS} value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {PIPELINE_STAGES.map((stage) => (
          <label key={stage} className="flex items-center gap-1">
            <input type="checkbox" checked={draft.stages.includes(stage)} onChange={() => toggleStage(stage)} />{t(`stage.${stage}`)}
          </label>
        ))}
        <label className="flex items-center gap-1 font-medium">
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />{t('settings.active')}
        </label>
      </div>
      <Button className="mt-3" disabled={save.busy} onClick={save.run}>{isNew ? t('common.create') : t('common.save')}</Button>
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
            {rows.map((workflow) => <WorkflowEditor key={`${workflow.id}-${workflow.stages.join()}`} workflow={workflow} onSaved={result.reload} />)}
            <h3 className="pt-2 text-sm font-semibold">{t('settings.newWorkflow')}</h3>
            <WorkflowEditor workflow={NEW_WORKFLOW} onSaved={result.reload} />
          </div>
        )}
      </Loaded>
    </Card>
  );
}
