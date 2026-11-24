// Release 2 panels for an accepted card: open the pipeline deal (one per card) and confirm the decision makers
// that the automatic search proposed. Nothing becomes a contact without the owner's confirmation.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Handshake, UserCheck, UserX, RefreshCw, Quote } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Loaded, Button, ErrorBox, SkeletonRows, StatusBadge, statusTone, ExternalLink, Badge, useToast } from '../../ui/index.js';
import { EntityForm, FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { RunStatus, useCost } from './researchUi.jsx';
import { DEAL_MODELS, DEPARTMENTS, LANGUAGES, PREFERRED_CHANNELS, PROPOSAL_DISMISS_REASONS, DATA_SOURCES } from '../../../../shared/enums.js';

const TITLE_MAX = 120;

export function PipelinePanel({ card, onChanged }) {
  const { t, language } = useI18n();
  const options = useEnumOptions();
  const toast = useToast();
  const workflows = useLoad(card.deal ? null : '/workflows');
  if (card.deal) {
    return (
      <Card title={t('research.pipelineTitle')}>
        <p className="text-sm">
          <Link className="font-medium text-link hover:underline" to={`/deals/${card.deal.id}`}><bdi>{card.deal.title}</bdi></Link>
          <span className="text-subtle"> · {t(`stage.${card.deal.stage}`)} · </span>
          <StatusBadge tone={statusTone('deal', card.deal.status)}>{t(`dealStatus.${card.deal.status}`)}</StatusBadge>
        </p>
      </Card>
    );
  }
  const defaults = card.deal_defaults ?? { default_workflow_id: null, default_deal_model: null };
  const title = `${card.mandate_code ? `${card.mandate_code}: ` : ''}${card.business_need}`.slice(0, TITLE_MAX);
  return (
    <Card title={t('research.pipelineTitle')}>
      <p className="mb-3 text-[13px] text-subtle">{t('research.openDealHint')}</p>
      {card.company_deals.length > 0 && (
        <p className="mb-3 text-sm">
          {t('research.companyHasDeals')}{' '}
          {card.company_deals.map((deal, index) => (
            <span key={deal.id}>{index > 0 && ', '}<Link className="text-link hover:underline" to={`/deals/${deal.id}`}><bdi>{deal.title}</bdi></Link></span>
          ))}
        </p>
      )}
      <Loaded result={workflows} skeleton={<SkeletonRows rows={3} />}>
        {(list) => (
          <EntityForm
            columns={1}
            fields={[
              { name: 'title', label: t('deal.title'), type: 'text', required: true },
              { name: 'workflow_id', label: t('deal.workflow'), type: 'select', required: true,
                options: list.filter((w) => w.active).map((w) => ({ value: String(w.id), label: language === 'he' ? w.name_he : w.name_en })) },
              { name: 'deal_model', label: t('deal.model'), type: 'select', required: true, options: options('dealModel', DEAL_MODELS) },
              { name: 'expected_value_usd', label: t('deal.expectedValue'), type: 'number' },
            ]}
            initial={{ title, workflow_id: defaults.default_workflow_id, deal_model: defaults.default_deal_model }}
            submitLabel={t('research.openDeal')}
            onSubmit={async (values) => {
              await post(`/opportunities/${card.id}/deal`, { ...values, workflow_id: Number(values.workflow_id) });
              toast({ title: t('research.dealOpened') });
              onChanged();
            }}
          />
        )}
      </Loaded>
    </Card>
  );
}

function Proposal({ proposal, onChanged }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const [department, setDepartment] = useState('management');
  const [language, setLanguage] = useState('he');
  const [channel, setChannel] = useState(proposal.email ? 'email' : proposal.linkedin_url ? 'linkedin' : 'switchboard');
  const confirm = useAction(async () => {
    await post(`/contact-proposals/${proposal.id}/confirm`, { department, preferred_language: language, preferred_channel: channel });
    onChanged();
  });
  // "Wrong or outdated" is counted in the metrics (the spec's contact-quality measure); "not relevant" is not.
  const dismiss = useAction(async (reason) => {
    await post(`/contact-proposals/${proposal.id}/dismiss`, { reason });
    onChanged();
  });
  const idBase = `proposal-${proposal.id}`;
  return (
    <li className="rounded-[8px] border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold"><bdi>{proposal.full_name}</bdi></span>
        <span className="text-sm text-muted"><bdi>{proposal.job_title}</bdi></span>
        {proposal.status !== 'proposed' && <Badge tone={proposal.status === 'confirmed' ? 'success' : 'neutral'}>{t(`contactProposal.${proposal.status}`)}</Badge>}
      </div>
      <blockquote className="mt-2 flex gap-2 text-[13px] text-muted"><Quote aria-hidden="true" size={14} className="mt-0.5 shrink-0" /><bdi>{proposal.quote}</bdi></blockquote>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <ExternalLink href={proposal.source_url}>{new URL(proposal.source_url).hostname.replace(/^www\./, '')}</ExternalLink>
        {proposal.email && <span dir="ltr">{proposal.email}</span>}
        {proposal.linkedin_url && <ExternalLink href={proposal.linkedin_url}>LinkedIn</ExternalLink>}
      </div>
      {proposal.status === 'proposed' && (
        <div className="mt-3 grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
          <FieldRow field={{ name: 'department', label: t('contact.department') }} inputId={`${idBase}-dept`}>
            <FieldInput field={{ name: 'department', type: 'select', required: true, options: options('department', DEPARTMENTS) }} inputId={`${idBase}-dept`} value={department} onChange={setDepartment} />
          </FieldRow>
          <FieldRow field={{ name: 'language', label: t('contact.language') }} inputId={`${idBase}-lang`}>
            <FieldInput field={{ name: 'language', type: 'select', required: true, options: options('language', LANGUAGES) }} inputId={`${idBase}-lang`} value={language} onChange={setLanguage} />
          </FieldRow>
          <FieldRow field={{ name: 'channel', label: t('contact.preferredChannel') }} inputId={`${idBase}-channel`}>
            <FieldInput field={{ name: 'channel', type: 'select', required: true, options: options('preferredChannel', PREFERRED_CHANNELS) }} inputId={`${idBase}-channel`} value={channel} onChange={setChannel} />
          </FieldRow>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button size="sm" variant="success" icon={UserCheck} loading={confirm.busy} onClick={() => confirm.run()}>{t('research.confirmContact')}</Button>
            {PROPOSAL_DISMISS_REASONS.map((reason) => (
              <Button key={reason} size="sm" variant="ghost" icon={UserX} loading={dismiss.busy} onClick={() => dismiss.run(reason)}>{t(`dismissReason.${reason}`)}</Button>
            ))}
          </div>
        </div>
      )}
      {(confirm.error || dismiss.error) && <div className="mt-2"><ErrorBox message={confirm.error ?? dismiss.error} /></div>}
    </li>
  );
}

/** Decision makers from Apollo or Lusha (connected ones only): proposals like the agent's own, at the cost of credits. */
function ProviderSearch({ card, onChanged }) {
  const { t } = useI18n();
  const toast = useToast();
  const status = useLoad('/data-sources');
  const find = useAction(async (provider) => {
    const result = await post(`/opportunities/${card.id}/contacts-from/${provider}`, {});
    toast({ title: t('dataSources.contactsFound', { provider: t(`dataSource.${provider}`), found: result.found, added: result.added }) });
    onChanged();
  });
  if (!status.data) return null;
  const connected = DATA_SOURCES.filter((provider) => status.data[provider].configured);
  if (connected.length === 0) return null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap gap-2">
        {connected.map((provider) => (
          <Button key={provider} size="sm" variant="secondary" loading={find.busy} onClick={() => find.run(provider)}>
            {t('dataSources.findWith', { provider: t(`dataSource.${provider}`) })}
          </Button>
        ))}
      </div>
      <p className="mt-1.5 text-[13px] text-subtle">{t('dataSources.contactsCredits')}</p>
      {find.error && <div className="mt-2"><ErrorBox message={find.error} /></div>}
    </div>
  );
}

export function DecisionMakersPanel({ card, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const cost = useCost();
  const search = card.contact_search;
  const again = useAction(async () => {
    await post(`/opportunities/${card.id}/contacts/search`);
    onChanged();
  });
  const busy = search && (search.status === 'queued' || search.status === 'running');
  return (
    <Card title={t('research.decisionMakersTitle')}>
      <p className="mb-3 text-[13px] text-subtle">{t('research.decisionMakersHint')}</p>
      {search && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-subtle">
          <RunStatus status={search.status} />
          {search.finished_at && <span>{format.dateTime(search.finished_at)} · {cost(search.cost_usd)}</span>}
        </div>
      )}
      {search && search.error && <div className="mb-3"><ErrorBox message={search.error} /></div>}
      {card.contact_proposals.length > 0
        ? <ul className="space-y-3">{card.contact_proposals.map((proposal) => <Proposal key={proposal.id} proposal={proposal} onChanged={onChanged} />)}</ul>
        : search && search.status === 'done' && <p className="text-sm text-muted">{t('research.noDecisionMakers')}</p>}
      {!busy && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={again.busy} onClick={() => again.run()}>{search ? t('research.searchAgain') : t('research.searchDecisionMakers')}</Button>
        </div>
      )}
      {again.error && <div className="mt-2"><ErrorBox message={again.error} /></div>}
      <ProviderSearch card={card} onChanged={onChanged} />
      {card.contact_proposals.some((proposal) => proposal.status === 'confirmed') && (
        <p className="mt-3 text-[13px]"><Link className="text-link hover:underline" to={`/companies/${card.company.id}`}>{t('research.seeContacts')}</Link></p>
      )}
    </Card>
  );
}

/** The originating research card, shown on the deal page. */
export function ResearchOriginCard({ card }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <Card title={<span className="flex items-center gap-2"><Handshake aria-hidden="true" size={18} />{t('research.originTitle')}</span>}>
      <blockquote className="mb-3 flex gap-2 rounded-[6px] bg-sunken p-3 text-sm"><Quote aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-subtle" /><bdi>{card.evidence_quote}</bdi></blockquote>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-subtle">
        <ExternalLink href={card.evidence_url}>{new URL(card.evidence_url).hostname.replace(/^www\./, '')}</ExternalLink>
        <span>{t('research.publishedOn', { date: format.date(card.evidence_date) })}</span>
        {card.mandate_code && <span>{card.mandate_code}</span>}
        {card.decided_by_name && <span>{t('research.acceptedBy', { name: card.decided_by_name, date: format.date(card.decided_at) })}</span>}
        <Link className="text-link hover:underline" to={`/research/cards/${card.id}`}>{t('research.openCard')}</Link>
      </div>
    </Card>
  );
}
