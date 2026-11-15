// Single lead/deal: stage & status, follow-up drafting (capped), unified timeline.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../hooks/useApi.js';
import { patch, post } from '../api.js';
import { Card, Loaded, PageHeader, DefinitionList, Button, ErrorBox, Notice, Badge } from '../components/ui.jsx';
import { EntityForm, INPUT_CLASS } from '../components/EntityForm.jsx';
import { Timeline, LogInteractionCard } from '../components/Timeline.jsx';
import { useEnumOptions } from '../enumOptions.js';
import { DEAL_MODELS, DEAL_STATUSES, LANGUAGES } from '../../../shared/enums.js';

function useDealEditFields(deal) {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'title', label: t('deal.title'), type: 'text', required: true },
    { name: 'stage', label: t('deal.stage'), type: 'select', required: true, options: options('stage', deal.workflow.stages) },
    { name: 'status', label: t('deal.status'), type: 'select', required: true, options: options('dealStatus', DEAL_STATUSES) },
    { name: 'deal_model', label: t('deal.model'), type: 'select', required: true, options: options('dealModel', DEAL_MODELS) },
    { name: 'expected_value_usd', label: t('deal.expectedValue'), type: 'number' },
    { name: 'actual_revenue_usd', label: t('deal.actualRevenue'), type: 'number', help: t('deal.actualRevenueHelp') },
  ];
}

function FollowupCard({ deal }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const options = useEnumOptions();
  const withEmail = deal.contacts.filter((c) => c.email);
  const [contactId, setContactId] = useState(withEmail[0] ? String(withEmail[0].id) : '');
  const [language, setLanguage] = useState(withEmail[0]?.preferred_language ?? 'he');
  const draft = useAction(async () => {
    await post(`/deals/${deal.id}/followup`, { contact_id: Number(contactId), language });
    navigate('/approvals');
  });
  const remaining = deal.max_followups - deal.followups_committed;
  return (
    <Card title={t('followup.title')}>
      <p className="mb-3 text-sm">
        {t('followup.counter', { used: deal.followups_committed, max: deal.max_followups })}{' '}
        {remaining <= 0 && <Badge color="red">{t('followup.capReached')}</Badge>}
      </p>
      <ErrorBox message={draft.error} />
      {deal.status !== 'open' ? <Notice>{t('followup.closedDeal')}</Notice> : withEmail.length === 0 ? <Notice color="amber">{t('followup.noEmailContact')}</Notice> : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">{t('interaction.contact')}
            <select className={INPUT_CLASS} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {withEmail.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </label>
          <label className="text-sm">{t('contact.language')}
            <select className={INPUT_CLASS} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {options('language', LANGUAGES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <Button disabled={remaining <= 0 || draft.busy} onClick={draft.run}>{t('followup.draft')}</Button>
        </div>
      )}
    </Card>
  );
}

export function DealPage() {
  const { id } = useParams();
  const result = useLoad(`/deals/${id}`);
  return <Loaded result={result}>{(deal) => <DealView deal={deal} reload={result.reload} />}</Loaded>;
}

function DealView({ deal, reload }) {
  const { t, language } = useI18n();
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const fields = useDealEditFields(deal);
  return (
    <>
      <PageHeader
        title={deal.title}
        subtitle={<Link className="text-brand-500 underline" to={`/companies/${deal.company_id}`}>{deal.company_name}</Link>}
        actions={!editing && <Button variant="secondary" onClick={() => setEditing(true)}>{t('common.edit')}</Button>}
      />
      <div className="space-y-6">
        <Card title={t('deal.details')}>
          {editing ? (
            <EntityForm
              fields={fields}
              initial={deal}
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                const result = await patch(`/deals/${deal.id}`, values);
                setEditing(false);
                reload();
                return result;
              }}
            />
          ) : (
            <DefinitionList items={[
              [t('deal.workflow'), language === 'he' ? deal.workflow_name_he : deal.workflow_name_en],
              [t('deal.stage'), t(`stage.${deal.stage}`)],
              [t('deal.status'), t(`dealStatus.${deal.status}`)],
              [t('deal.model'), t(`dealModel.${deal.deal_model}`)],
              [t('deal.expectedValue'), format.usd(deal.expected_value_usd)],
              [t('deal.actualRevenue'), format.usd(deal.actual_revenue_usd)],
              [t('deal.owner'), deal.owner_name],
              [t('deal.lastActivity'), format.dateTime(deal.last_activity_at)],
              [t('deal.stageSince'), format.date(deal.stage_changed_at)],
            ]} />
          )}
        </Card>
        <FollowupCard deal={deal} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('interaction.timeline')}><Timeline interactions={deal.interactions} /></Card>
          <LogInteractionCard companyId={deal.company_id} dealId={deal.id} contacts={deal.contacts} onLogged={reload} />
        </div>
      </div>
    </>
  );
}
