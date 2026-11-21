// Company research tab: every research card for this company (owners see their own, admins all).

import { Link } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, Table, EmptyState, SkeletonRows } from '../../ui/index.js';
import { OpportunityStatus, VerdictBadge } from '../research/researchUi.jsx';

export function ResearchTab({ data }) {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/companies/${data.company.id}/research`);
  const columns = [
    { key: 'business_need', label: t('research.businessNeed'), render: (card) => <Link className="text-link hover:underline" to={`/research/cards/${card.id}`}><bdi>{card.business_need}</bdi></Link> },
    { key: 'mandate_code', label: t('research.mandate'), render: (card) => card.mandate_code ?? '—' },
    { key: 'status', label: t('research.status'), render: (card) => <div className="flex flex-wrap gap-1"><OpportunityStatus status={card.status} /><VerdictBadge verdict={card.verdict} /></div> },
    { key: 'evidence_date', label: t('research.evidenceDate'), render: (card) => format.date(card.evidence_date) },
    { key: 'owner_name', label: t('research.owner'), render: (card) => card.owner_name ?? '—' },
  ];
  return (
    <Card padded>
      <Loaded result={result} skeleton={<SkeletonRows rows={3} />}>
        {(cards) => <Table caption={t('companyTab.research')} columns={columns} rows={cards} empty={<EmptyState icon={ScanSearch} title={t('research.noCompanyCards')} />} />}
      </Loaded>
    </Card>
  );
}
