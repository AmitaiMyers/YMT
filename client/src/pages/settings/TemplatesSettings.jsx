// Template editor for quotes, agreements, summaries, briefs and email drafts.

import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { Card, Loaded, Button, ErrorBox, Notice, Badge } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { TEMPLATE_KINDS, LANGUAGES } from '../../../../shared/enums.js';

function PlaceholderHelp({ kind }) {
  const { t } = useI18n();
  const result = useLoad('/templates/placeholders');
  return (
    <Loaded result={result}>
      {(placeholders) => (
        <div className="mb-4 rounded-md bg-slate-50 p-3 text-xs">
          <div className="mb-1 font-semibold">{t('templates.placeholders')}</div>
          <div className="flex flex-wrap gap-1">
            {[...placeholders.common, ...placeholders[kind]].map((name) => <code key={name} className="rounded bg-white px-1">{`{{${name}}}`}</code>)}
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
  const result = useLoad('/templates');
  const fields = useTemplateFields();
  const [selectedId, setSelectedId] = useState(null);
  const remove = useAction(async (id) => {
    await del(`/templates/${id}`);
    setSelectedId(null);
    result.reload();
  });

  return (
    <Loaded result={result}>
      {(templates) => {
        const selected = templates.find((tpl) => tpl.id === selectedId);
        return (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <Card title={t('settings.templates')}>
              <ul className="space-y-1 text-sm">
                {templates.map((tpl) => (
                  <li key={tpl.id}>
                    <button type="button" onClick={() => setSelectedId(tpl.id)} className={`w-full rounded px-2 py-1 text-start ${tpl.id === selectedId ? 'bg-brand-100' : 'hover:bg-slate-100'}`}>
                      <div>{tpl.name}</div>
                      <div className="flex gap-1"><Badge>{t(`templateKind.${tpl.kind}`)}</Badge><Badge color="blue">{tpl.language.toUpperCase()}</Badge></div>
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" className="mt-3 w-full" onClick={() => setSelectedId(null)}>{t('templates.new')}</Button>
            </Card>
            <Card
              title={selected ? `${t('common.edit')}: ${selected.name}` : t('templates.new')}
              actions={selected && <Button variant="danger" onClick={() => window.confirm(t('common.confirmDelete')) && remove.run(selected.id)}>{t('common.delete')}</Button>}
            >
              <ErrorBox message={remove.error} />
              <Notice>{t('templates.help')}</Notice>
              {selected && <PlaceholderHelp kind={selected.kind} />}
              <EntityForm
                key={selectedId ?? 'new'}
                fields={fields}
                initial={selected ?? { kind: 'quote', language: 'he' }}
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
