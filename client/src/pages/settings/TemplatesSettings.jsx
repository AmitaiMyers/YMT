// Template editor for quotes, agreements, summaries, briefs and email drafts.

import { useState } from 'react';
import { Plus, Trash2, Braces } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { Card, Loaded, Button, ErrorBox, Notice, Badge, useConfirm, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { TEMPLATE_KINDS, LANGUAGES } from '../../../../shared/enums.js';

function PlaceholderHelp({ kind }) {
  const { t } = useI18n();
  const result = useLoad('/templates/placeholders');
  return (
    <Loaded result={result}>
      {(placeholders) => (
        <div className="mb-4 rounded-[6px] border border-line bg-canvas p-3 text-[13px]">
          <div className="mb-2 flex items-center gap-1.5 font-semibold"><Braces aria-hidden="true" size={14} />{t('templates.placeholders')}</div>
          <div dir="ltr" className="flex flex-wrap gap-1">
            {[...placeholders.common, ...placeholders[kind]].map((name) => <code key={name} className="rounded border border-line bg-surface px-1.5 py-0.5">{`{{${name}}}`}</code>)}
          </div>
        </div>
      )}
    </Loaded>
  );
}

function useTemplateFields() {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'kind', label: t('templates.kind'), type: 'select', required: true, options: options('templateKind', TEMPLATE_KINDS) },
    { name: 'language', label: t('contact.language'), type: 'select', required: true, options: options('language', LANGUAGES) },
    { name: 'name', label: t('templates.name'), type: 'text', required: true },
    { name: 'subject', label: t('templates.subject'), type: 'text', help: t('templates.subjectHelp') },
    { name: 'body', label: t('templates.body'), type: 'textarea', required: true, wide: true, rows: 16 },
  ];
}

export function TemplatesSettings() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const result = useLoad('/templates');
  const fields = useTemplateFields();
  const [selectedId, setSelectedId] = useState(null);
  const remove = useAction(async (template) => {
    const ok = await confirm({ title: t('templates.deleteTitle'), body: t('templates.deleteBody', { name: template.name }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/templates/${template.id}`);
    toast({ title: t('toast.deleted') });
    setSelectedId(null);
    result.reload();
  });

  return (
    <Loaded result={result}>
      {(templates) => {
        const selected = templates.find((tpl) => tpl.id === selectedId);
        return (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <Card title={t('settings.templates')} padded={false}>
              <ul className="max-h-[60dvh] overflow-y-auto p-2">
                {templates.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      aria-current={tpl.id === selectedId ? 'true' : undefined}
                      onClick={() => setSelectedId(tpl.id)}
                      className={`w-full rounded-[6px] px-3 py-2 text-start transition-colors transition-ui ${tpl.id === selectedId ? 'bg-info-soft' : 'hover:bg-hover'}`}
                    >
                      <bdi className="block text-sm font-medium">{tpl.name}</bdi>
                      <span className="mt-1 flex gap-1"><Badge>{t(`templateKind.${tpl.kind}`)}</Badge><Badge tone="info">{tpl.language.toUpperCase()}</Badge></span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line p-2">
                <Button variant="secondary" icon={Plus} className="w-full" offlineOk onClick={() => setSelectedId(null)}>{t('templates.new')}</Button>
              </div>
            </Card>
            <Card
              title={selected ? <bdi>{`${t('common.edit')}: ${selected.name}`}</bdi> : t('templates.new')}
              actions={selected && <Button variant="ghost" size="sm" icon={Trash2} className="text-danger-fg" onClick={() => remove.run(selected)}>{t('common.delete')}</Button>}
            >
              <ErrorBox message={remove.error} />
              <Notice icon={Braces}>{t('templates.help')}</Notice>
              {selected && <PlaceholderHelp kind={selected.kind} />}
              <EntityForm
                key={selectedId ?? 'new'}
                fields={fields}
                initial={selected ?? { kind: 'quote', language: 'he' }}
                successMessage={selected ? t('toast.saved') : t('toast.templateCreated')}
                onSubmit={async (values) => {
                  const response = selected ? await patch(`/templates/${selected.id}`, values) : await post('/templates', values);
                  if (!selected) setSelectedId(response.id);
                  result.reload();
                  return response;
                }}
              />
            </Card>
          </div>
        );
      }}
    </Loaded>
  );
}
