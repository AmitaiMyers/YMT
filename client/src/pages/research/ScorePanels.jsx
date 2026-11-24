// Card panels of the lead-finding agent spec (22.11.2026): the 0–100 score with every point traced to a level,
// the live check of job postings and distributor pages, and the company's status in each Asian market.

import { CircleCheck, CircleX } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Button, ErrorBox, Table, ExternalLink, Badge } from '../../ui/index.js';
import { ScoreBadge } from './researchUi.jsx';

const PART_ORDER = ['subsector', 'trigger', 'decision_maker', 'service', 'evidence'];
// The label prefix of each part's level (levels are codes from the server).
const LEVEL_PREFIX = { subsector: 'subsectorFit', trigger: 'triggerKind', decision_maker: 'score.dm', service: 'score.service', evidence: 'score.evidence' };

function hostOf(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

/** Job postings and distributor pages count only while still live on the review day: the owner checks the link. */
function LiveCheck({ card, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const check = useAction(async (live) => {
    await post(`/opportunities/${card.id}/trigger-check`, { live });
    onChanged();
  });
  const checkedOn = card.trigger_checked_at ? format.date(card.trigger_checked_at) : null;
  const state = card.trigger_live === null ? t('score.liveUnchecked')
    : card.trigger_live === 1 ? t('score.liveYes', { date: checkedOn }) : t('score.liveNo', { date: checkedOn });
  return (
    <div className="mt-4 rounded-[6px] bg-sunken p-3">
      <p className="text-sm font-medium text-fg">{t('score.liveTitle')}</p>
      <p className="mt-1 text-[13px] text-muted">{t('score.liveHint')}</p>
      <p className="mt-2 text-sm">{state}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={CircleCheck} loading={check.busy} onClick={() => check.run(true)}>{t('score.markLive')}</Button>
        <Button size="sm" variant="secondary" icon={CircleX} loading={check.busy} onClick={() => check.run(false)}>{t('score.markGone')}</Button>
      </div>
      {check.error && <div className="mt-2"><ErrorBox message={check.error} /></div>}
    </div>
  );
}

export function ScorePanel({ card, canAct, onChanged }) {
  const { t } = useI18n();
  const { score } = card;
  const triggerAge = (part) => {
    if (part.level === 'none' || card.trigger_live === 0) return null;
    return part.factor === 0.5 ? t('score.triggerHalf') : part.factor === 0 ? t('score.triggerOld') : null;
  };
  return (
    <Card title={t('score.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <ScoreBadge score={score.total} tier={score.tier} />
        {!score.has_trigger && <Badge tone="neutral">{t('score.noTrigger')}</Badge>}
      </div>
      <dl className="mt-3 divide-y divide-border text-sm">
        {PART_ORDER.map((key) => {
          const part = score.parts[key];
          const age = key === 'trigger' ? triggerAge(part) : null;
          return (
            <div key={key} className="flex items-start justify-between gap-3 py-2">
              <dt>
                <span className="block font-medium text-fg">{t(`score.part.${key}`)}</span>
                <span className="block text-[13px] text-muted">{t(`${LEVEL_PREFIX[key]}.${part.level}`)}{age ? ` · ${age}` : ''}</span>
              </dt>
              <dd className="tabular shrink-0 text-muted">{t('score.points', { points: part.points, max: part.max })}</dd>
            </div>
          );
        })}
        {score.deduction > 0 && (
          <div className="flex items-start justify-between gap-3 py-2">
            <dt className="font-medium text-fg">{t('flag.lower_priority')}</dt>
            <dd className="tabular text-muted">−{score.deduction}</dd>
          </div>
        )}
      </dl>
      {card.live_check && canAct && <LiveCheck card={card} onChanged={onChanged} />}
    </Card>
  );
}

export function MarketsPanel({ markets }) {
  const { t } = useI18n();
  const format = useFormat();
  const columns = [
    { key: 'market', label: t('markets.market'), render: (row) => t(`market.${row.market}`) },
    { key: 'status', label: t('markets.status'), render: (row) => t(`marketStatus.${row.status}`) },
    { key: 'fit', label: t('markets.fit'), render: (row) => t(`marketFit.${row.fit}`) },
    { key: 'note', label: t('research.note'), render: (row) => (row.note ? <bdi>{row.note}</bdi> : '—') },
    { key: 'source_url', label: t('common.source'), render: (row) => (row.source_url
      ? <span className="whitespace-nowrap"><ExternalLink href={row.source_url}>{hostOf(row.source_url)}</ExternalLink></span> : '—') },
    { key: 'checked_at', label: t('research.checkedAt'), render: (row) => format.date(row.checked_at) },
  ];
  return (
    <Card title={t('markets.title')} padded>
      <Table caption={t('markets.title')} columns={columns} rows={markets.map((row) => ({ ...row, id: row.market }))} empty={t('markets.none')} />
    </Card>
  );
}
