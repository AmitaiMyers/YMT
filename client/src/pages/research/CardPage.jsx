// One research card: the evidence, the company classification with its cited facts, and the owner's decision.
// Keyboard: A accept, V verify, D defer, R reject (each selects; a click confirms). After a decision the next card opens.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, SearchCheck, Clock, X, Quote, BookmarkPlus } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { get, post } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useCounts } from '../../app/CountsProvider.jsx';
import {
  Card, Loaded, PageHeader, DefinitionList, Button, ErrorBox, Table, SkeletonRows, ExternalLink, Notice, Badge, useToast, useHotkeys,
} from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { OpportunityStatus, VerdictBadge, FlagBadges, useEmployeesText } from './researchUi.jsx';
import { PipelinePanel, DecisionMakersPanel } from './AcceptedPanels.jsx';
import { usePolling } from './MandatesPage.jsx';
import { REJECT_REASONS, EXAMPLE_LABELS, CUSTOMER_TYPES } from '../../../../shared/enums.js';

const DECIDABLE = ['draft', 'needs_review', 'verify', 'deferred'];
const DECISION_ICONS = { accept: Check, verify: SearchCheck, defer: Clock, reject: X };
// Enumerated company fields whose stored values are codes that need a label.
const FACT_LABEL_PREFIX = { israel_connection: 'israelConnection', sector: 'sector', model_primary: 'businessModel', model_secondary: 'businessModel' };
// Field codes the server lists under "missing facts"; anything else there is free text written by the AI.
const FIELD_CODES = ['parent_company', 'business_unit', 'israel_connection', 'incorporation_country', 'hq_country', 'model_primary',
  'model_secondary', 'sector', 'subsector', 'customer_types', 'customer_markets', 'employees', 'revenue', 'ownership'];

function useCodeLabel() {
  const { t } = useI18n();
  return (prefix, value) => (value === null ? '—' : t(`${prefix}.${value}`));
}

function DecisionPanel({ card, onDecided }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const decide = useAction(async (decision, body) => onDecided(await post(`/opportunities/${card.id}/decision`, { decision, ...body })));

  useHotkeys({
    a: () => setMode('accept'),
    v: () => setMode('verify'),
    d: () => setMode('defer'),
    r: () => setMode('reject'),
  });

  const needsNote = mode === 'verify' || mode === 'defer' || reason === 'other';
  const ready = mode !== null && (mode !== 'reject' || reason !== '') && (!needsNote || note.trim() !== '');
  return (
    <Card title={t('research.decide')}>
      <p className="mb-3 text-[13px] text-subtle">{t('research.decideHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {['accept', 'verify', 'defer', 'reject'].map((key) => (
          <Button key={key} variant={{ accept: 'success', reject: 'danger' }[key] ?? 'secondary'} icon={DECISION_ICONS[key]} aria-pressed={mode === key} onClick={() => setMode(key)}>
            {t(`decision.${key}`)} <kbd className="ms-1 text-[11px] opacity-70">{key[0].toUpperCase()}</kbd>
          </Button>
        ))}
      </div>
      {mode !== null && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            decide.run(mode, { reason: mode === 'reject' ? reason : null, note: note.trim() || null });
          }}
        >
          {mode === 'reject' && (
            <FieldRow field={{ name: 'reason', label: t('research.rejectReason'), required: true }} inputId="decision-reason">
              <FieldInput field={{ name: 'reason', type: 'select', required: true, options: options('rejectReason', REJECT_REASONS) }} inputId="decision-reason" value={reason} onChange={setReason} />
            </FieldRow>
          )}
          <FieldRow field={{ name: 'note', label: needsNote ? t('research.noteRequired') : t('research.noteOptional'), required: needsNote }} inputId="decision-note">
            <FieldInput field={{ name: 'note', type: 'textarea', rows: 3 }} inputId="decision-note" value={note} onChange={setNote} />
          </FieldRow>
          {mode === 'verify' && <p className="text-[13px] text-subtle">{t('research.verifyCreatesTask')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={{ accept: 'success', reject: 'danger' }[mode] ?? 'primary'} loading={decide.busy} disabled={!ready} disabledReason={t('research.completeDecision')}>
              {t(`decision.confirm.${mode}`)}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)}>{t('common.cancel')}</Button>
          </div>
        </form>
      )}
      {decide.error && <div className="mt-3"><ErrorBox message={decide.error} /></div>}
    </Card>
  );
}

function AssignPanel({ card, onAssigned }) {
  const { t } = useI18n();
  const users = useLoad('/users');
  const mandates = useLoad('/mandates');
  const [ownerId, setOwnerId] = useState('');
  const [mandateId, setMandateId] = useState(card.mandate_id ? String(card.mandate_id) : '');
  const assign = useAction(async () => onAssigned(await post(`/opportunities/${card.id}/assign`, { owner_id: Number(ownerId), mandate_id: mandateId ? Number(mandateId) : null })));
  return (
    <Card title={t('research.assignTitle')}>
      <p className="mb-3 text-[13px] text-subtle">{t('research.assignHint')}</p>
      <Loaded result={users} skeleton={<SkeletonRows rows={2} />}>
        {(userList) => (
          <Loaded result={mandates} skeleton={<SkeletonRows rows={1} />}>
            {(mandateList) => (
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); assign.run(); }}>
                <FieldRow field={{ name: 'owner', label: t('research.owner'), required: true }} inputId="assign-owner">
                  <FieldInput field={{ name: 'owner', type: 'select', required: true, options: userList.filter((u) => u.active).map((u) => ({ value: String(u.id), label: u.display_name })) }} inputId="assign-owner" value={ownerId} onChange={setOwnerId} />
                </FieldRow>
                <FieldRow field={{ name: 'mandate', label: t('research.mandate') }} inputId="assign-mandate">
                  <FieldInput field={{ name: 'mandate', type: 'select', options: mandateList.map((m) => ({ value: String(m.id), label: `${m.code} · ${m.name}` })) }} inputId="assign-mandate" value={mandateId} onChange={setMandateId} />
                </FieldRow>
                <Button type="submit" loading={assign.busy} disabled={ownerId === ''} disabledReason={t('research.chooseOwner')}>{t('research.assign')}</Button>
                {assign.error && <ErrorBox message={assign.error} />}
              </form>
            )}
          </Loaded>
        )}
      </Loaded>
    </Card>
  );
}

function ExamplePanel({ card, onSaved }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const [label, setLabel] = useState('good');
  const save = useAction(async () => {
    await post(`/mandates/${card.mandate_id}/examples`, { opportunity_id: card.id, label });
    onSaved();
  });
  const existing = card.examples.find((example) => example.mandate_id === card.mandate_id);
  return (
    <Card title={t('research.exampleTitle')}>
      {existing
        ? <p className="text-sm"><Badge tone="info">{t(`exampleLabel.${existing.label}`)}</Badge> <span className="text-muted">{t('research.exampleSaved', { code: card.mandate_code })}</span></p>
        : (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save.run(); }}>
            <p className="text-[13px] text-subtle">{t('research.exampleHint')}</p>
            <FieldRow field={{ name: 'label', label: t('research.exampleLabel'), required: true }} inputId="example-label">
              <FieldInput field={{ name: 'label', type: 'select', required: true, options: options('exampleLabel', EXAMPLE_LABELS) }} inputId="example-label" value={label} onChange={setLabel} />
            </FieldRow>
            <Button type="submit" icon={BookmarkPlus} loading={save.busy}>{t('research.saveExample')}</Button>
            {save.error && <ErrorBox message={save.error} />}
          </form>
        )}
    </Card>
  );
}

function CompanyCard({ company }) {
  const { t } = useI18n();
  const format = useFormat();
  const label = useCodeLabel();
  const employeesText = useEmployeesText();
  const employees = company.employees_min === null && company.employees_max === null ? '—'
    : `${employeesText(company.employees_min, company.employees_max)} · ${t(`sizeBand.${company.employee_band}`)}${company.employees_as_of ? ` (${company.employees_as_of})` : ''}`;
  const revenue = company.revenue_usd_min === null && company.revenue_usd_max === null ? '—'
    : [
      company.revenue_usd_min === company.revenue_usd_max || company.revenue_usd_max === null
        ? format.usd(company.revenue_usd_min ?? company.revenue_usd_max)
        : `${format.usd(company.revenue_usd_min)}–${format.usd(company.revenue_usd_max)}`,
      t(`sizeBand.${company.revenue_band}`),
      company.revenue_fiscal_year ? t('research.fiscalYear', { year: company.revenue_fiscal_year }) : null,
      company.revenue_basis ? t(`revenueBasis.${company.revenue_basis}`) : null,
      company.revenue_original,
    ].filter(Boolean).join(' · ');
  return (
    <Card title={t('research.companyTitle')}>
      <DefinitionList items={[
        [t('research.field.israel_connection'), label('israelConnection', company.israel_connection)],
        [t('research.field.hq_country'), company.hq_country],
        [t('research.field.incorporation_country'), company.incorporation_country],
        [t('research.field.parent_company'), [company.parent_company, company.business_unit].filter(Boolean).join(' / ') || null],
        [t('research.field.model_primary'), label('businessModel', company.model_primary)],
        [t('research.field.model_secondary'), label('businessModel', company.model_secondary)],
        [t('research.field.sector'), [company.sector ? t(`sector.${company.sector}`) : null, company.subsector].filter(Boolean).join(' / ') || null],
        [t('research.field.customer_types'), company.customer_types.map((type) => t(`customerType.${type}`)).join(', ') || null],
        [t('research.field.customer_markets'), company.customer_markets.join(', ') || null],
        [t('research.field.employees'), employees],
        [t('research.field.revenue'), revenue],
        [t('research.field.ownership'), company.ownership],
        [t('common.website'), company.website ? <ExternalLink href={company.website} /> : null],
      ]} />
    </Card>
  );
}

export function CardPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { refresh } = useCounts();
  const result = useLoad(`/opportunities/${id}`);
  const searching = Boolean(result.data && result.data.contact_search && ['queued', 'running'].includes(result.data.contact_search.status));
  usePolling(result, searching);

  async function openNext(card) {
    refresh();
    toast({ title: t(`decision.done.${card.status}`) });
    const queue = await get('/research/review?view=queue');
    const next = queue.find((item) => item.id !== card.id);
    navigate(next ? `/research/cards/${next.id}` : '/research');
  }

  return (
    <Loaded result={result} skeleton={<Card><SkeletonRows rows={10} /></Card>}>
      {(card) => {
        const canDecide = DECIDABLE.includes(card.status) && (card.owner_id === user.id || user.role === 'admin');
        const canAssign = user.role === 'admin' && ['draft', 'needs_review', 'manual_assignment'].includes(card.status);
        const label = (field, value) => {
          if (FACT_LABEL_PREFIX[field]) return t(`${FACT_LABEL_PREFIX[field]}.${value}`);
          if (field === 'customer_types') {
            return value.split(',').map((part) => part.trim()).map((part) => (CUSTOMER_TYPES.includes(part) ? t(`customerType.${part}`) : part)).join(', ');
          }
          return value;
        };
        const factColumns = [
          { key: 'field', label: t('research.factField'), render: (fact) => t(`research.field.${fact.field}`) },
          { key: 'value', label: t('research.factValue'), render: (fact) => <bdi>{label(fact.field, fact.value)}</bdi> },
          { key: 'quote', label: t('research.factQuote'), render: (fact) => (fact.quote ? <q className="text-[13px] text-muted"><bdi>{fact.quote}</bdi></q> : '—') },
          { key: 'url', label: t('common.source'), render: (fact) => <span className="whitespace-nowrap"><ExternalLink href={fact.url}>{new URL(fact.url).hostname.replace(/^www\./, '')}</ExternalLink></span> },
          { key: 'checked_at', label: t('research.checkedAt'), render: (fact) => format.date(fact.checked_at) },
        ];
        return (
          <>
            <PageHeader
              eyebrow={<Link className="text-link hover:underline" to="/research">{t('nav.research')}</Link>}
              title={card.company.name}
              subtitle={(
                <span className="flex flex-wrap items-center gap-2">
                  <OpportunityStatus status={card.status} />
                  <VerdictBadge verdict={card.verdict} />
                  <FlagBadges flags={card.flags} />
                  <span>{card.mandate_code ? `${card.mandate_code} · ${card.owner_name ?? t('research.noOwner')}` : t('research.noMandate')}</span>
                </span>
              )}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card title={t('research.evidenceTitle')}>
                  <blockquote className="flex gap-2 rounded-[6px] bg-sunken p-3 text-[15px] leading-relaxed">
                    <Quote aria-hidden="true" size={18} className="mt-1 shrink-0 text-subtle" />
                    <bdi>{card.evidence_quote}</bdi>
                  </blockquote>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <ExternalLink href={card.evidence_url}>{card.evidence_title ?? card.evidence_url}</ExternalLink>
                    <span className="text-subtle">{t('research.publishedOn', { date: format.date(card.evidence_date) })}</span>
                    <span className="text-subtle">{t(`sourceKind.${card.evidence_kind}`)}</span>
                  </div>
                </Card>
                <Card title={t('research.opportunityTitle')}>
                  <DefinitionList items={[
                    [t('research.businessNeed'), card.business_need],
                    [t('research.target'), `${card.target_country} · ${t(`needType.${card.need_type}`)}`],
                    [t('research.relationshipRole'), t(`relationshipRole.${card.relationship_role}`)],
                    [t('research.verdictReason'), card.verdict_reason],
                    [t('research.reasonToAct'), card.reason_to_act],
                    [t('research.proposedService'), card.proposed_service],
                    [t('research.mandate'), card.mandate_code ? `${card.mandate_code} · ${card.mandate_name} (v${card.mandate_version})` : null],
                    [t('research.foundOn'), format.dateTime(card.created_at)],
                    [t('research.foundVia'), card.watch_list_name ? t('research.foundViaList', { name: card.watch_list_name }) : null],
                  ]} />
                  {card.unknowns.length > 0 && (
                    <div className="mt-4">
                      <h3 className="mb-1 text-sm font-semibold text-fg">{t('research.unknowns')}</h3>
                      <ul className="flex flex-wrap gap-1">
                        {card.unknowns.map((item) => <li key={item}><Badge tone="neutral"><bdi>{FIELD_CODES.includes(item) ? t(`research.field.${item}`) : item}</bdi></Badge></li>)}
                      </ul>
                    </div>
                  )}
                </Card>
                <CompanyCard company={card.company} />
                <Card title={t('research.factsTitle')} padded>
                  <Table caption={t('research.factsTitle')} columns={factColumns} rows={card.facts} empty={t('research.noFacts')} />
                </Card>
                {card.other_opportunities.length > 0 && (
                  <Card title={t('research.otherOpportunities')}>
                    <ul className="space-y-2 text-sm">
                      {card.other_opportunities.map((other) => (
                        <li key={other.id} className="flex flex-wrap items-center gap-2">
                          <OpportunityStatus status={other.status} />
                          <Link className="text-link hover:underline" to={`/research/cards/${other.id}`}><bdi>{other.business_need}</bdi></Link>
                          <span className="text-subtle">{other.mandate_code ?? '—'} · {format.date(other.evidence_date)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
              <div className="space-y-6">
                {card.status === 'manual_assignment' && <Notice>{t('research.manualNotice')}</Notice>}
                {canAssign && <AssignPanel card={card} onAssigned={() => { refresh(); result.reload(); }} />}
                {canDecide && <DecisionPanel card={card} onDecided={openNext} />}
                {!DECIDABLE.includes(card.status) && card.status !== 'manual_assignment' && (
                  <Card title={t('research.decisionTitle')}>
                    <DefinitionList stacked items={[
                      [t('research.status'), <OpportunityStatus key="s" status={card.status} />],
                      [t('research.decidedBy'), card.decided_by_name ? `${card.decided_by_name} · ${format.dateTime(card.decided_at)}` : null],
                      [t('research.rejectReason'), card.decision_reason ? t(`rejectReason.${card.decision_reason}`) : null],
                      [t('research.note'), card.decision_note],
                    ]} />
                  </Card>
                )}
                {card.status === 'accepted' && (card.owner_id === user.id || user.role === 'admin') && (
                  <>
                    <PipelinePanel card={card} onChanged={result.reload} />
                    <DecisionMakersPanel card={card} onChanged={result.reload} />
                  </>
                )}
                {card.mandate_id !== null && (card.owner_id === user.id || user.role === 'admin') && <ExamplePanel card={card} onSaved={result.reload} />}
              </div>
            </div>
          </>
        );
      }}
    </Loaded>
  );
}
