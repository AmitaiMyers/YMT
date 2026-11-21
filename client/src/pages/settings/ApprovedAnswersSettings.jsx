// Release 4: the approved answers library. When the AI answers a reply it may use only the card, the conversation and
// these texts; anything else becomes a "find out" task. Everyone can read them; only an admin can change them.

import { useState } from 'react';
import { BookCheck, Pencil, Trash2 } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post, patch, del } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, SkeletonRows, IconButton, ErrorBox, Badge, EmptyState, Notice, useConfirm, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { LANGUAGES } from '../../../../shared/enums.js';

function AnswerItem({ answer, canEdit, onEdit, onDelete }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <li className="rounded-[8px] border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold"><bdi>{answer.title}</bdi></span>
        <Badge tone="neutral">{t(`language.${answer.language}`)}</Badge>
        {!answer.active && <Badge tone="signal">{t('answers.inactive')}</Badge>}
        {canEdit && (
          <span className="ms-auto flex gap-1">
            <IconButton icon={Pencil} label={`${t('common.edit')}: ${answer.title}`} onClick={() => onEdit(answer.id)} />
            <IconButton icon={Trash2} label={`${t('common.delete')}: ${answer.title}`} onClick={() => onDelete(answer)} />
          </span>
        )}
      </div>
      <p lang={answer.language} dir={answer.language === 'he' ? 'rtl' : 'ltr'} className="mt-2 whitespace-pre-wrap text-sm text-muted">{answer.body}</p>
      <p className="mt-1 text-[13px] text-subtle">{t('answers.updated', { name: answer.updated_by_name ?? '—', date: format.date(answer.updated_at) })}</p>
    </li>
  );
}

export function ApprovedAnswersSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const options = useEnumOptions();
  const confirm = useConfirm();
  const toast = useToast();
  const result = useLoad('/approved-answers');
  const [editingId, setEditingId] = useState(null);
  const canEdit = user.role === 'admin';
  const remove = useAction(async (answer) => {
    const ok = await confirm({ title: t('answers.deleteTitle'), body: t('answers.deleteBody', { title: answer.title }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/approved-answers/${answer.id}`);
    toast({ title: t('toast.deleted') });
    result.reload();
  });
  const fields = [
    { name: 'title', label: t('answers.titleField'), type: 'text', required: true, help: t('answers.titleHelp') },
    { name: 'language', label: t('contact.language'), type: 'select', required: true, options: options('language', LANGUAGES) },
    { name: 'body', label: t('answers.body'), type: 'textarea', required: true, wide: true },
    { name: 'active', label: t('answers.active'), type: 'checkbox' },
  ];
  return (
    <div className="space-y-6">
      <Notice icon={BookCheck}>{t('answers.notice')}</Notice>
      <Card title={t('answers.title')}>
        <ErrorBox message={remove.error} />
        <Loaded result={result} skeleton={<SkeletonRows rows={4} />}>
          {(answers) => {
            const editing = answers.find((answer) => answer.id === editingId) ?? null;
            return (
              <>
                {answers.length === 0
                  ? <EmptyState icon={BookCheck} title={t('answers.none')}>{t('answers.noneHint')}</EmptyState>
                  : <ul className="space-y-3">{answers.map((answer) => <AnswerItem key={answer.id} answer={answer} canEdit={canEdit} onEdit={setEditingId} onDelete={(item) => remove.run(item)} />)}</ul>}
                {canEdit && (
                  <div className="mt-6 border-t border-line pt-4">
                    <h3 className="mb-3 text-sm font-semibold">{editing ? `${t('common.edit')}: ${editing.title}` : t('answers.add')}</h3>
                    <EntityForm
                      key={editingId ?? 'new'}
                      fields={fields}
                      initial={editing ? { ...editing, active: Boolean(editing.active) } : { language: 'he', active: true }}
                      resetOnSuccess={!editing}
                      onCancel={editing ? () => setEditingId(null) : undefined}
                      onSubmit={async (values) => {
                        const saved = editing ? await patch(`/approved-answers/${editing.id}`, values) : await post('/approved-answers', values);
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
