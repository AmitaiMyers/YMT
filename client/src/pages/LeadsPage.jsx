// Module 1: criteria-based lead search, trigger log and research search-string helper.

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, Radar, Zap, Plus } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { post, toQuery } from '../api.js';
import { Button, Card, Loaded, PageHeader, Table, Tabs, Badge, ExternalLink, Notice, EmptyState, SkeletonRows } from '../ui/index.js';
import { EntityForm, FieldInput, FieldRow, INPUT_CLASS } from '../components/EntityForm.jsx';
import { useCompanyFields, COMPANY_DEFAULTS } from '../fields.js';
import { useEnumOptions } from '../enumOptions.js';
import { INDIA_ACTIVITY } from '../../../shared/enums.js';

const EMPTY_FILTERS = { q: '', industry: '', min_employees: '', max_employees: '', min_revenue: '', max_revenue: '', exports: '', india_activity: '', is_client: '' };
const TABS = ['search', 'triggers', 'new'];

function useFilterFields(industries) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const yesNo = [{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }];
  return [
    { name: 'q', label: t('leads.freeText'), type: 'text' },
    { name: 'industry', label: t('company.industry'), type: 'select', options: industries.map((i) => ({ value: i, label: i })) },
    { name: 'india_activity', label: t('company.indiaActivity'), type: 'select', options: options('indiaActivity', INDIA_ACTIVITY) },
    { name: 'min_employees', label: t('leads.minEmployees'), type: 'number' },
    { name: 'max_employees', label: t('leads.maxEmployees'), type: 'number' },
    { name: 'exports', label: t('company.exports'), type: 'select', options: yesNo },
    { name: 'min_revenue', label: t('leads.minRevenue'), type: 'number' },
    { name: 'max_revenue', label: t('leads.maxRevenue'), type: 'number' },
    { name: 'is_client', label: t('company.isClient'), type: 'select', options: yesNo },
  ];
}

export function useCompanyColumns() {
  const { t } = useI18n();
  const format = useFormat();
  return [
    { key: 'name', label: t('company.name'), render: (c) => <Link className="font-medium text-link hover:underline" to={`/companies/${c.id}`}><bdi>{c.name}</bdi></Link> },
    { key: 'industry', label: t('company.industry') },
    { key: 'employee_count', label: t('company.employees'), numeric: true, render: (c) => format.number(c.employee_count) },
    { key: 'annual_revenue_usd', label: t('company.revenue'), numeric: true, render: (c) => format.usd(c.annual_revenue_usd) },
    { key: 'india_activity', label: t('company.indiaActivity'), render: (c) => <Badge tone={c.india_activity === 'none' ? 'neutral' : 'info'}>{t(`indiaActivity.${c.india_activity}`)}</Badge> },
    { key: 'triggers', label: t('leads.triggers'), render: (c) => (c.trigger_count > 0 ? <Badge tone="signal"><Zap aria-hidden="true" size={12} />{c.trigger_count} · {format.date(c.latest_trigger)}</Badge> : '—') },
    { key: 'verified_contacts', label: t('leads.verifiedContacts'), numeric: true, render: (c) => String(c.verified_contacts) },
  ];
}

function CriteriaSearch({ onNew }) {
  const { t } = useI18n();
  const industries = useLoad('/companies/industries');
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const results = useLoad(`/companies${toQuery(applied)}`);
  const fields = useFilterFields(industries.data ?? []);
  const columns = useCompanyColumns();
  const activeFilters = Object.values(applied).filter((value) => value !== '').length;

  return (
    <div className="space-y-6">
      <Card title={t('leads.criteria')} actions={activeFilters > 0 && <Badge tone="info">{t('leads.activeFilters', { count: activeFilters })}</Badge>}>
        <form onSubmit={(e) => { e.preventDefault(); setApplied(draft); }} role="search">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {fields.map((field) => (
              <FieldRow key={field.name} field={field} inputId={`filter-${field.name}`}>
                <FieldInput field={field} inputId={`filter-${field.name}`} value={draft[field.name]} onChange={(value) => setDraft((d) => ({ ...d, [field.name]: value }))} />
              </FieldRow>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" icon={Search} offlineOk>{t('common.search')}</Button>
            <Button variant="ghost" icon={X} offlineOk disabled={activeFilters === 0 && draft === EMPTY_FILTERS} onClick={() => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); }}>{t('common.clear')}</Button>
          </div>
        </form>
      </Card>
      <Card title={t('leads.results')} actions={results.data && <span className="tabular text-sm text-subtle">{t('leads.resultCount', { count: results.data.length })}</span>}>
        <Loaded result={results} skeleton={<SkeletonRows rows={5} />}>
          {(rows) => (
            <Table
              caption={t('leads.results')}
              columns={columns}
              rows={rows}
              empty={<EmptyState icon={Radar} title={t('leads.noResults')} action={<Button icon={Plus} onClick={onNew}>{t('leads.newCompany')}</Button>}>{t('leads.noResultsHint')}</EmptyState>}
            />
          )}
        </Loaded>
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
      <p className="mb-3 text-sm text-muted">{t('leads.searchHelperHelp')}</p>
      <label className="mb-4 block text-sm font-medium">{t('leads.keywords')}
        <input className={`${INPUT_CLASS} mt-1.5 border-line-strong`} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t('company.industry')} />
      </label>
      <ul className="grid gap-2 sm:grid-cols-2">
        {queries.map((query) => <li key={query.label} className="rounded-[6px] border border-line px-3 py-2 text-sm"><ExternalLink href={query.url}>{query.label}</ExternalLink></li>)}
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
    { key: 'company_name', label: t('company.name'), render: (r) => <Link className="text-link hover:underline" to={`/companies/${r.company_id}`}><bdi>{r.company_name}</bdi></Link> },
    { key: 'type', label: t('trigger.type'), render: (r) => <Badge tone="signal">{t(`triggerType.${r.type}`)}</Badge> },
    { key: 'description', label: t('trigger.description') },
    { key: 'source_url', label: t('trigger.sourceUrl'), render: (r) => <ExternalLink href={r.source_url}>{t('common.source')}</ExternalLink> },
  ];
  return (
    <Card title={t('leads.triggerLog')}>
      <Notice icon={Zap}>{t('leads.triggerLogHelp')}</Notice>
      <Loaded result={result}>
        {(rows) => <Table caption={t('leads.triggerLog')} columns={columns} rows={rows} empty={<EmptyState icon={Zap} title={t('leads.noTriggers')}>{t('leads.noTriggersHint')}</EmptyState>} />}
      </Loaded>
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
        successMessage={t('toast.companyCreated')}
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
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'search';
  const setTab = (key) => setParams(key === 'search' ? {} : { tab: key }, { replace: true });
  const tabs = TABS.map((key) => ({ key, label: t(`leads.tab.${key}`) }));
  return (
    <>
      <PageHeader title={t('nav.leads')} subtitle={t('leads.subtitle')} actions={tab !== 'new' && <Button icon={Plus} offlineOk onClick={() => setTab('new')}>{t('leads.newCompany')}</Button>} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('nav.leads')}>
        {tab === 'search' && <CriteriaSearch onNew={() => setTab('new')} />}
        {tab === 'triggers' && <TriggerLog />}
        {tab === 'new' && <NewCompany />}
      </Tabs>
    </>
  );
}
