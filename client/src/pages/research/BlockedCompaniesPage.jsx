// "Don't suggest" (27.11.2026): companies no agent may suggest again – e.g. after an approach that failed. Add one by
// hand here, from a watch list or from its card; their cards leave the lead flow and the review until removed here.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Undo2 } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post, del } from '../../api.js';
import { Card, Loaded, PageHeader, Table, Button, SkeletonRows, EmptyState, ErrorBox, useToast, useConfirm } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';

function AddBlockForm({ onAdded }) {
  const { t } = useI18n();
  const toast = useToast();
  const [values, setValues] = useState({ name: '', website: '', reason: '' });
  const set = (field) => (value) => setValues((previous) => ({ ...previous, [field]: value }));
  const add = useAction(async () => {
    await post('/blocked-companies', { name: values.name, website: values.website || null, reason: values.reason || null });
    toast({ title: t('blocked.added', { name: values.name }) });
    setValues({ name: '', website: '', reason: '' });
    onAdded();
  });
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); add.run(); }}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FieldRow field={{ name: 'name', label: t('blocked.company'), required: true }} inputId="block-name">
          <FieldInput field={{ name: 'name', type: 'text', required: true }} inputId="block-name" value={values.name} onChange={set('name')} />
        </FieldRow>
        <FieldRow field={{ name: 'website', label: t('blocked.website') }} inputId="block-website">
          <FieldInput field={{ name: 'website', type: 'text' }} inputId="block-website" value={values.website} onChange={set('website')} />
        </FieldRow>
        <FieldRow field={{ name: 'reason', label: t('blocked.reason') }} inputId="block-reason">
          <FieldInput field={{ name: 'reason', type: 'text' }} inputId="block-reason" value={values.reason} onChange={set('reason')} />
        </FieldRow>
      </div>
      {add.error && <ErrorBox message={add.error} />}
      <Button type="submit" variant="danger" icon={Ban} loading={add.busy} disabled={values.name.trim() === ''} disabledReason={t('blocked.nameFirst')}>
        {t('blocked.add')}
      </Button>
    </form>
  );
}

export function BlockedCompaniesPage() {
  const { t } = useI18n();
  const format = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const result = useLoad('/blocked-companies');
  const remove = useAction(async (block) => {
    const ok = await confirm({ title: t('blocked.remove'), body: t('blocked.removeBody', { name: block.name }), confirmLabel: t('blocked.remove') });
    if (!ok) return;
    await del(`/blocked-companies/${block.id}`);
    toast({ title: t('blocked.removed', { name: block.name }) });
    result.reload();
  });
  return (
    <>
      <PageHeader title={t('nav.blocked')} subtitle={t('blocked.subtitle')} />
      <div className="space-y-6">
        <Card title={t('blocked.addTitle')}><AddBlockForm onAdded={result.reload} /></Card>
        {remove.error && <ErrorBox message={remove.error} />}
        <Card>
          <Loaded result={result} skeleton={<SkeletonRows rows={5} />}>
            {(blocks) => (
              <Table
                caption={t('nav.blocked')}
                columns={[
                  { key: 'name', label: t('blocked.company'), render: (block) => (block.card_id
                    ? <Link className="font-medium text-link hover:underline" to={`/research/cards/${block.card_id}`}><bdi>{block.name}</bdi></Link>
                    : <bdi className="font-medium">{block.name}</bdi>) },
                  { key: 'domain', label: t('blocked.website'), render: (block) => (block.domain ? <span dir="ltr">{block.domain}</span> : '—') },
                  { key: 'reason', label: t('blocked.reason') },
                  { key: 'blocked_by_name', label: t('blocked.by'), render: (block) => <div>{block.blocked_by_name ?? '—'}<div className="text-[13px] text-subtle">{format.date(block.created_at)}</div></div> },
                  { key: 'remove', label: <span className="sr-only">{t('blocked.remove')}</span>, render: (block) => (
                    <Button variant="ghost" size="sm" icon={Undo2} onClick={() => remove.run(block)}>{t('blocked.remove')}</Button>
                  ) },
                ]}
                rows={blocks}
                empty={<EmptyState icon={Ban} title={t('blocked.none')}>{t('blocked.noneHint')}</EmptyState>}
              />
            )}
          </Loaded>
        </Card>
      </div>
    </>
  );
}
