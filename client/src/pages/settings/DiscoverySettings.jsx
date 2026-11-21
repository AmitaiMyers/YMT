// Release 5: the questions of the client discovery form, in Hebrew and English. Everyone can read them; an admin can
// add, edit, reorder and deactivate them. Answers already sent keep the wording the client saw.

import { useState } from 'react';
import { ArrowUp, ArrowDown, Pencil, ClipboardList } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post, patch } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, SkeletonRows, IconButton, ErrorBox, Badge, Notice } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { DISCOVERY_ANSWER_KINDS } from '../../../../shared/enums.js';

export function DiscoverySettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const options = useEnumOptions();
  const result = useLoad('/discovery-questions');
  const [editingId, setEditingId] = useState(null);
  const canEdit = user.role === 'admin';
  const move = useAction(async (question, direction) => {
    await post(`/discovery-questions/${question.id}/move`, { direction });
    result.reload();
  });
  const fields = [
    { name: 'question_he', label: t('discoveryQuestion.he'), type: 'text', required: true, wide: true },
    { name: 'question_en', label: t('discoveryQuestion.en'), type: 'text', required: true, wide: true },
    { name: 'answer_kind', label: t('discoveryQuestion.kind'), type: 'select', required: true, options: options('discoveryKind', DISCOVERY_ANSWER_KINDS) },
    { name: 'required', label: t('discoveryQuestion.required'), type: 'checkbox' },
    { name: 'active', label: t('discoveryQuestion.active'), type: 'checkbox' },
  ];
  return (
    <div className="space-y-6">
      <Notice icon={ClipboardList}>{t('discoveryQuestion.notice')}</Notice>
      <Card title={t('discoveryQuestion.title')}>
        <ErrorBox message={move.error} />
        <Loaded result={result} skeleton={<SkeletonRows rows={6} />}>
          {(questions) => {
            const editing = questions.find((question) => question.id === editingId) ?? null;
            return (
              <>
                <ol className="space-y-2">
                  {questions.map((question, index) => (
                    <li key={question.id} className={`flex flex-wrap items-start gap-2 rounded-[8px] border border-line p-3 ${question.active ? '' : 'opacity-70'}`}>
                      <span className="tabular w-6 text-sm text-subtle">{index + 1}.</span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p lang="he" dir="rtl">{question.question_he}</p>
                        <p lang="en" dir="ltr" className="text-muted">{question.question_en}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone="neutral">{t(`discoveryKind.${question.answer_kind}`)}</Badge>
                          {question.required ? <Badge tone="info">{t('discoveryQuestion.required')}</Badge> : null}
                          {question.active ? null : <Badge tone="signal">{t('answers.inactive')}</Badge>}
                        </div>
                      </div>
                      {canEdit && (
                        <span className="flex gap-1">
                          <IconButton icon={ArrowUp} label={`${t('discoveryQuestion.moveUp')}: ${index + 1}`} disabled={index === 0} onClick={() => move.run(question, 'up')} />
                          <IconButton icon={ArrowDown} label={`${t('discoveryQuestion.moveDown')}: ${index + 1}`} disabled={index === questions.length - 1} onClick={() => move.run(question, 'down')} />
                          <IconButton icon={Pencil} label={`${t('common.edit')}: ${index + 1}`} onClick={() => setEditingId(question.id)} />
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {canEdit && (
                  <div className="mt-6 border-t border-line pt-4">
                    <h3 className="mb-3 text-sm font-semibold">{editing ? `${t('common.edit')}: ${questions.indexOf(editing) + 1}` : t('discoveryQuestion.add')}</h3>
                    <EntityForm
                      key={editingId ?? 'new'}
                      fields={fields}
                      initial={editing ? { ...editing, required: Boolean(editing.required), active: Boolean(editing.active) } : { answer_kind: 'long', required: false, active: true }}
                      resetOnSuccess={!editing}
                      onCancel={editing ? () => setEditingId(null) : undefined}
                      onSubmit={async (values) => {
                        const saved = editing ? await patch(`/discovery-questions/${editing.id}`, values) : await post('/discovery-questions', values);
                        setEditingId(null);
                        result.reload();
                        return saved;
                      }}
                    />
                  </div>
                )}
              </>
            );
          }}
        </Loaded>
      </Card>
    </div>
  );
}
