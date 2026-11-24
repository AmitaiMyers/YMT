// Small shared pieces for the research screens: status badges, flags, size and money formatting, budget bar.

import { Gauge } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { Badge, StatusBadge, statusTone, Notice, ProgressBar } from '../../ui/index.js';

export function OpportunityStatus({ status }) {
  const { t } = useI18n();
  return <StatusBadge tone={statusTone('opportunity', status)}>{t(`opportunityStatus.${status}`)}</StatusBadge>;
}

export function VerdictBadge({ verdict }) {
  const { t } = useI18n();
  if (verdict === null) return null;
  return <StatusBadge tone={statusTone('verdict', verdict)}>{t(`verdict.${verdict}`)}</StatusBadge>;
}

export function RunStatus({ status }) {
  const { t } = useI18n();
  return <StatusBadge tone={statusTone('run', status)}>{t(`runStatus.${status}`)}</StatusBadge>;
}

/** "74 · B": the 0–100 score and its tier (A ≥ 80, B ≥ 65); text carries the meaning, the tone only supports it. */
export function ScoreBadge({ score, tier }) {
  const { t } = useI18n();
  return <StatusBadge tone={statusTone('tier', tier)}><span className="tabular whitespace-nowrap" dir="ltr">{t('score.badge', { score, tier })}</span></StatusBadge>;
}

export function FlagBadges({ flags }) {
  const { t } = useI18n();
  return flags.map((flag) => <Badge key={flag} tone="signal">{t(`flag.${flag}`)}</Badge>);
}

/** "95 employees" or "40–70 employees"; unknown as a dash. */
export function useEmployeesText() {
  const { t } = useI18n();
  const format = useFormat();
  return (min, max) => {
    if (min === null && max === null) return '—';
    const value = min === max || max === null ? format.number(min) : min === null ? format.number(max) : `${format.number(min)}–${format.number(max)}`;
    return t('research.employeesValue', { value });
  };
}

/** Compact USD for small amounts like AI costs ($0.12). */
export function useCost() {
  const { language } = useI18n();
  const locale = language === 'he' ? 'he-IL' : 'en-GB';
  return (value) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Monthly AI spend vs cap, with a warning from 80%. */
export function BudgetBar({ budget }) {
  const { t } = useI18n();
  const cost = useCost();
  const percent = Math.min(100, Math.round(budget.ratio * 100));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-fg">{t('research.budget')}</span>
        <span className="tabular text-muted">{t('research.budgetValue', { spent: cost(budget.spent), cap: cost(budget.cap) })}</span>
      </div>
      <ProgressBar value={percent} max={100} tone={budget.ratio >= 0.8 ? 'signal' : 'chart'} label={t('research.budget')} />
      {budget.ratio >= 0.8 && <Notice tone="signal" icon={Gauge}>{budget.ratio >= 1 ? t('research.budgetUsedUp') : t('research.budgetWarning')}</Notice>}
    </div>
  );
}
