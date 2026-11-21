// Pilot measurement per mandate: cards reviewed, acceptance rate, duplicates, wrong-market matches, review time
// and AI cost per accepted card (YMT's review protocol).

import { useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { toQuery } from '../../api.js';
import { Card, Loaded, PageHeader, Table, SkeletonRows, EmptyState } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { useCost } from './researchUi.jsx';

const isoDay = (date) => date.toISOString().slice(0, 10);

export function MetricsPage() {
  const { t } = useI18n();
  const format = useFormat();
  const cost = useCost();
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const result = useLoad(`/research/metrics${toQuery({ from, to })}`);
  const percent = (value) => (value === null ? '—' : `${Math.round(value * 100)}%`);

  const columns = [
    { key: 'code', label: t('research.mandate'), render: (row) => (row.code
      ? <div><span className="font-semibold">{row.code}</span><div className="text-[13px] text-subtle">{row.owner_name ?? t('research.noOwner')}</div></div>
      : t('research.noMandate')) },
    { key: 'reviewed', label: t('metrics.reviewed'), numeric: true },
    { key: 'accepted', label: t('metrics.accepted'), numeric: true },
    { key: 'acceptance_rate', label: t('metrics.acceptanceRate'), numeric: true, render: (row) => percent(row.acceptance_rate) },
    { key: 'duplicates', label: t('metrics.duplicates'), numeric: true },
    { key: 'wrong_market', label: t('metrics.wrongMarket'), numeric: true },
    { key: 'avg_review_minutes', label: t('metrics.minutesPerCard'), numeric: true, render: (row) => (row.avg_review_minutes === null ? '—' : format.number(Math.round(row.avg_review_minutes * 10) / 10)) },
    { key: 'pending', label: t('research.pending'), numeric: true },
    { key: 'cost_usd', label: t('research.cost'), numeric: true, render: (row) => cost(row.cost_usd) },
    { key: 'cost_per_accepted', label: t('metrics.costPerAccepted'), numeric: true, render: (row) => (row.cost_per_accepted === null ? '—' : cost(row.cost_per_accepted)) },
    { key: 'reject_reasons', label: t('metrics.rejectReasons'), render: (row) => {
      const entries = Object.entries(row.reject_reasons);
      return entries.length === 0 ? '—' : <span className="text-[13px]">{entries.map(([reason, n]) => `${t(`rejectReason.${reason}`)} ${n}`).join(' · ')}</span>;
    } },
  ];

  return (
    <>
      <PageHeader title={t('nav.researchMetrics')} subtitle={t('metrics.subtitle')} />
      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-xl">
          <FieldRow field={{ name: 'from', label: t('metrics.from') }} inputId="metrics-from">
            <FieldInput field={{ name: 'from', type: 'date' }} inputId="metrics-from" value={from} onChange={setFrom} />
          </FieldRow>
          <FieldRow field={{ name: 'to', label: t('metrics.to') }} inputId="metrics-to">
            <FieldInput field={{ name: 'to', type: 'date' }} inputId="metrics-to" value={to} onChange={setTo} />
          </FieldRow>
        </div>
      </Card>
      <Card padded>
        <Loaded result={result} skeleton={<SkeletonRows rows={7} />}>
          {(data) => <Table caption={t('nav.researchMetrics')} rowKey="code" columns={columns} rows={data.rows} empty={<EmptyState icon={ChartColumn} title={t('metrics.none')} />} />}
        </Loaded>
      </Card>
    </>
  );
}
