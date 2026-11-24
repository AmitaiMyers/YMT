// Client files (360°). Defaults to active clients; one toggle shows every company.

import { useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { toQuery } from '../../api.js';
import { ButtonLink, Card, Loaded, PageHeader, Table, EmptyState, SkeletonRows } from '../../ui/index.js';
import { INPUT_CLASS } from '../../components/EntityForm.jsx';
import { useCompanyColumns } from '../LeadsPage.jsx';

export function ClientsPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('clients');
  const result = useLoad(`/companies${toQuery({ q: query.trim(), is_client: scope === 'clients' ? 'yes' : '' })}`);
  const columns = useCompanyColumns();
  return (
    <>
      <PageHeader title={t('nav.clients')} subtitle={t('clients.subtitle')} actions={<ButtonLink to="/clients/new" variant="primary" icon={Plus}>{t('leads.newCompany')}</ButtonLink>} />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search aria-hidden="true" size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input type="search" aria-label={t('clients.search')} placeholder={t('clients.search')} className={`${INPUT_CLASS} border-line-strong ps-9`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div role="radiogroup" aria-label={t('clients.scope')} className="inline-flex rounded-[6px] border border-line-strong p-0.5">
            {['clients', 'all'].map((key) => (
              <button key={key} type="button" role="radio" aria-checked={scope === key} onClick={() => setScope(key)} className={`min-h-9 rounded-[4px] px-3 text-sm font-medium transition-colors transition-ui ${scope === key ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg'}`}>
                {t(`clients.scope.${key}`)}
              </button>
            ))}
          </div>
        </div>
        <Loaded result={result} skeleton={<SkeletonRows rows={6} />}>
          {(rows) => (
            <Table
              caption={t('nav.clients')}
              columns={columns}
              rows={rows}
              empty={<EmptyState icon={Building2} title={t('clients.none')}>{t('clients.noneHint')}</EmptyState>}
            />
          )}
        </Loaded>
      </Card>
    </>
  );
}
