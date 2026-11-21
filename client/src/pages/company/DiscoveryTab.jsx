// Release 5: the client discovery form. Create a personal link (optionally for a person and a deal), send it yourself,
// and read the answers here and on the deal. Links expire and can be withdrawn; each can be answered once.

import { ClipboardList, Ban } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Button, ErrorBox, Notice, Loaded, SkeletonRows, StatusBadge, statusTone, EmptyState, useConfirm, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { CopyButton } from '../../components/CopyButton.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { LANGUAGES } from '../../../../shared/enums.js';

/** The answers a client sent, as they saw the questions. Shared with the deal page. */
export function DiscoveryAnswers({ request }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <div>
      <p className="mb-2 text-[13px] text-subtle">{t('discovery.answeredBy', { name: request.submitted_name, date: format.dateTime(request.submitted_at) })}</p>
      <dl lang={request.submitted_language} dir={request.submitted_language === 'he' ? 'rtl' : 'ltr'} className="space-y-3">
        {request.answers.map((item) => (
          <div key={item.question}>
            <dt className="text-sm font-semibold">{item.question}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RequestItem({ request, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const confirm = useConfirm();
  const toast = useToast();
  const revoke = useAction(async () => {
    const ok = await confirm({ title: t('discovery.revokeTitle'), body: t('discovery.revokeBody'), confirmLabel: t('discovery.revoke'), tone: 'danger' });
    if (!ok) return;
    await post(`/discovery/${request.id}/revoke`);
    toast({ title: t('toast.linkRevoked') });
    onChanged();
  });
  return (
    <li className="rounded-[8px] border border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={statusTone('discovery', request.status)}>{t(`discoveryStatus.${request.status}`)}</StatusBadge>
        <span className="text-[13px] text-subtle">
          {t('discovery.sentBy', { name: request.created_by_name, date: format.date(request.created_at) })}
          {request.contact_name && <> · <bdi>{request.contact_name}</bdi></>}
          {request.deal_title && <> · <bdi>{request.deal_title}</bdi></>}
          {request.status === 'open' && <> · {t('discovery.expires', { date: format.date(request.expires_at) })}</>}
        </span>
      </div>
      {request.status === 'open' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyButton size="sm" text={`${window.location.origin}/discovery/${request.token}`} label={t('share.copyLink')} />
          <Button size="sm" variant="ghost" icon={Ban} className="text-danger-fg" loading={revoke.busy} onClick={() => revoke.run()}>{t('discovery.revoke')}</Button>
        </div>
      )}
      {request.status === 'answered' && <div className="mt-3"><DiscoveryAnswers request={request} /></div>}
      <ErrorBox message={revoke.error} />
    </li>
  );
}

export function DiscoveryTab({ data, reload }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const result = useLoad(`/companies/${data.company.id}/discovery`);
  const changed = () => {
    result.reload();
    reload();
  };
  const fields = [
    { name: 'contact_id', label: t('discovery.person'), type: 'select', options: data.contacts.map((contact) => ({ value: String(contact.id), label: contact.full_name })) },
    { name: 'deal_id', label: t('discovery.deal'), type: 'select', options: data.deals.map((deal) => ({ value: String(deal.id), label: deal.title })) },
    { name: 'language', label: t('discovery.language'), type: 'select', required: true, options: options('language', LANGUAGES) },
    { name: 'days', label: t('share.days'), type: 'number', min: 1, help: t('share.daysHelp') },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('discovery.title')}>
        <Notice icon={ClipboardList}>{t('discovery.help')}</Notice>
        <div className="mt-4">
          <Loaded result={result} skeleton={<SkeletonRows rows={3} />}>
            {(requests) => (requests.length === 0
              ? <EmptyState icon={ClipboardList} title={t('discovery.none')} />
              : <ul className="space-y-3">{requests.map((request) => <RequestItem key={`${request.id}-${request.status}`} request={request} onChanged={changed} />)}</ul>)}
          </Loaded>
        </div>
      </Card>
      <Card title={t('discovery.create')}>
        <EntityForm
          fields={fields}
          initial={{ language: data.contacts[0] ? data.contacts[0].preferred_language : 'he' }}
          resetOnSuccess
          submitLabel={t('discovery.createButton')}
          successMessage={t('discovery.created')}
          onSubmit={async (values) => {
            const created = await post(`/companies/${data.company.id}/discovery`, {
              ...values,
              contact_id: values.contact_id ? Number(values.contact_id) : null,
              deal_id: values.deal_id ? Number(values.deal_id) : null,
            });
            changed();
            return created;
          }}
        />
      </Card>
    </div>
  );
}
