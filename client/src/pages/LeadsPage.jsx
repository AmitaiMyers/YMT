// Module 1: criteria-based lead search, trigger log and research search-string helper.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { post, toQuery } from '../api.js';
import { Card, Loaded, PageHeader, Table, Tabs, Badge, Button, ExternalLink, Notice } from '../components/ui.jsx';
import { EntityForm, FieldInput, FieldRow } from '../components/EntityForm.jsx';
import { useCompanyFields, COMPANY_DEFAULTS } from '../fields.js';
import { useEnumOptions } from '../enumOptions.js';
import { INDIA_ACTIVITY } from '../../../shared/enums.js';

const EMPTY_FILTERS = { q: '', industry: '', min_employees: '', max_employees: '', min_revenue: '', max_revenue: '', exports: '', india_activity: '', is_client: '' };

function useFilterFields(industries) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const yesNo = [{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }];
  return [
    { name: 'q', label: t('leads.freeText'), type: 'text' },
    { name: 'industry', label: t('company.industry'), type: 'select', options: industries.map((i) => ({ value: i, label: i })) },
    { name: 'min_employees', label: t('leads.minEmployees'), type: 'number' },
    { name: 'max_employees', label: t('leads.maxEmployees'), type: 'number' },
    { name: 'min_revenue', label: t('leads.minRevenue'), type: 'number' },
    { name: 'max_revenue', label: t('leads.maxRevenue'), type: 'number' },
    { name: 'exports', label: t('company.exports'), type: 'select', options: yesNo },
    { name: 'india_activity', label: t('company.indiaActivity'), type: 'select', options: options('indiaActivity', INDIA_ACTIVITY) },
    { name: 'is_client', label: t('company.isClient'), type: 'select', options: yesNo },
  ];
}

function CriteriaSearch() {
  const { t } = useI18n();
  const format = useFormat();
  const industries = useLoad('/companies/industries');
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const results = useLoad(`/companies${toQuery(applied)}`);
  const fields = useFilterFields(industries.data ?? []);

  const columns = [
    { key: 'name', label: t('company.name'), render: (c) => <Link className="font-medium text-brand-700 hover:underline" to={`/companies/${c.id}`}>{c.name}</Link> },
    { key: 'industry', label: t('company.industry') },
    { key: 'employee_count', label: t('company.employees'), render: (c) => format.number(c.employee_count) },
    { key: 'annual_revenue_usd', label: t('company.revenue'), render: (c) => format.usd(c.annual_revenue_usd) },
    { key: 'india_activity', label: t('company.indiaActivity'), render: (c) => <Badge color={c.india_activity === 'none' ? 'gray' : 'blue'}>{t(`indiaActivity.${c.india_activity}`)}</Badge> },
    { key: 'triggers', label: t('leads.triggers'), render: (c) => (c.trigger_count > 0 ? <Badge color="amber">{c.trigger_count} · {format.date(c.latest_trigger)}</Badge> : '—') },
    { key: 'verified_contacts', label: t('leads.verifiedContacts') },
  ];

  return (
    <div className="space-y-6">
      <Card title={t('leads.criteria')}>
        <form onSubmit={(e) => { e.preventDefault(); setApplied(draft); }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {fields.map((field) => (
              <FieldRow key={field.name} field={field}>
                <FieldInput field={field} value={draft[field.name]} onChange={(value) => setDraft((d) => ({ ...d, [field.name]: value }))} />
              </FieldRow>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="submit">{t('common.search')}</Button>
            <Button variant="secondary" onClick={() => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); }}>{t('common.clear')}</Button>
          </div>
        </form>
      </Card>
      <Card title={t('leads.results')}>
        <Loaded result={results}>{(rows) => <Table columns={columns} rows={rows} empty={t('leads.noResults')} />}</Loaded>
      </Card>
      <SearchStringHelper industry={applied.industry} />
    </div>
  );
}

/** Builds web/LinkedIn search queries from criteria. Opens results in a new tab; nothing is sent anywhere. */
function SearchStringHelper({ industry }) {
  const { t } = useI18n();
  const [keywords, setKeywords] = useState(industry);
  const term = keywords.trim() || 'industrial';
  const queries = [
    { label: t('leads.qTradeShows'), url: `https://www.google.com/search?q=${encodeURIComponent(`"${term}" exhibitor India trade show Israel`)}` },
    { label: t('leads.qDelegations'), url: `https://www.google.com/search?q=${encodeURIComponent(`"${term}" Israel India trade delegation`)}` },
    { label: t('leads.qJobs'), url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${term} India business development`)}&location=Israel` },
    { label: t('leads.qPeople'), url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${term} VP sales OR "Asia" Israel`)}` },
    { label: t('leads.qNews'), url: `https://news.google.com/search?q=${encodeURIComponent(`"${term}" Israel India expansion`)}` },
  ];
  return (
    <Card title={t('leads.searchHelper')}>
      <p className="mb-3 text-sm text-slate-500">{t('leads.searchHelperHelp')}</p>
      <input className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t('company.industry')} />
      <ul className="space-y-1 text-sm">
        {queries.map((query) => <li key={query.label}><ExternalLink href={query.url}>{query.label}</ExternalLink></li>)}
      </ul>
    </Card>
  );
}

function TriggerLog() {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad('/triggers');
  const columns = [
    { key: 'detected_on', label: t('trigger.detectedOn'), render: (r) => format.date(r.detected_on) },
    { key: 'company_name', label: t('company.name'), render: (r) => <Link className="text-brand-700 hover:underline" to={`/companies/${r.company_id}`}>{r.company_name}</Link> },
    { key: 'type', label: t('trigger.type'), render: (r) => <Badge color="amber">{t(`triggerType.${r.type}`)}</Badge> },
    { key: 'description', label: t('trigger.description') },
    { key: 'source_url', label: t('trigger.sourceUrl'), render: (r) => <ExternalLink href={r.source_url}>{t('common.open')}</ExternalLink> },
  ];
  return (
    <Card title={t('leads.triggerLog')}>
      <Notice>{t('leads.triggerLogHelp')}</Notice>
      <Loaded result={result}>{(rows) => <Table columns={columns} rows={rows} empty={t('leads.noTriggers')} />}</Loaded>
    </Card>
  );
}

function NewCompany() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fields = useCompanyFields();
  return (
    <Card title={t('leads.newCompany')}>
      <EntityForm
        fields={fields}
        initial={COMPANY_DEFAULTS}
        submitLabel={t('common.create')}
        onSubmit={async (values) => {
          const { id } = await post('/companies', values);
          navigate(`/companies/${id}`);
          return id;
        }}
      />
    </Card>
  );
}

export function LeadsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('search');
  const tabs = [
    { key: 'search', label: t('leads.tabSearch') },
    { key: 'triggers', label: t('leads.tabTriggers') },
    { key: 'new', label: t('leads.tabNew') },
  ];
  return (
    <>
      <PageHeader title={t('nav.leads')} subtitle={t('leads.subtitle')} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'search' && <CriteriaSearch />}
      {tab === 'triggers' && <TriggerLog />}
      {tab === 'new' && <NewCompany />}
    </>
  );
}
