// Lead flow (25.11.2026): the home of the Focused view. One column per step of YMT's flow, from the agent's find to the
// closed deal; every card says the one thing to do next. "Run agent" starts a search right here and the board shows
// the agents still searching. Desktop first: columns scroll sideways inside the board, never the page.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Bot, Sparkles } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { toQuery } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { PageHeader, Button, Loaded, SkeletonRows, useToast } from '../../ui/index.js';
import { ScoreBadge } from '../research/researchUi.jsx';
import { usePolling } from '../research/MandatesPage.jsx';
import { RunAgentDialog } from './RunAgentDialog.jsx';
import { ACTION_ICONS, STAGE_ICONS, needsYou, useActionLabel, daysSince } from './journey.jsx';
import { JOURNEY_STAGES } from '../../../../shared/enums.js';

function FlowCard({ card, showOwner }) {
  const { t } = useI18n();
  const format = useFormat();
  const actionLabel = useActionLabel();
  const { next } = card.journey;
  const ActionIcon = ACTION_ICONS[next.kind];
  const urgent = needsYou(next);
  const days = daysSince(card.journey.since);
  return (
    <li>
      <Link
        to={`/research/cards/${card.id}`}
        className={`flow-card group block rounded-[10px] border bg-surface p-3 shadow-e1 transition-[transform,box-shadow,border-color] transition-ui hover:-translate-y-0.5 hover:shadow-e2 focus-visible:-translate-y-0.5 ${urgent ? 'border-line border-s-[3px] border-s-signal' : 'border-line'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <bdi className="min-w-0 font-semibold leading-snug text-fg group-hover:text-link">{card.company_name}</bdi>
          {card.score !== undefined && <ScoreBadge score={card.score} tier={card.tier} />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-subtle">
          {card.mandate_code && <span className="font-medium">{card.mandate_code}</span>}
          <bdi>{card.target_country}</bdi>
          <span aria-label={t('flow.daysInStage', { days })}>· {t('flow.daysShort', { days })}</span>
          {showOwner && <span>· {card.owner_name ?? t('research.noOwner')}</span>}
        </div>
        <div className={`mt-2.5 flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-[13px] font-medium ${urgent ? 'bg-signal-soft text-signal-fg' : next.kind === 'done' && next.outcome === 'won' ? 'bg-success-soft text-success-fg' : 'bg-sunken text-muted'}`}>
          <ActionIcon aria-hidden="true" size={15} className="shrink-0" />
          <span className="min-w-0 truncate">{actionLabel(next, format)}</span>
        </div>
      </Link>
    </li>
  );
}

function Column({ stage, index, cards, showOwner, onRun }) {
  const { t } = useI18n();
  const Icon = STAGE_ICONS[stage];
  const waiting = cards.filter((card) => needsYou(card.journey.next)).length;
  const headingId = `flow-${stage}`;
  return (
    <section
      aria-labelledby={headingId}
      // Steps with cards share the width (never below 232px: then the board scrolls); empty steps stay narrow.
      className={`flow-column flex shrink-0 flex-col rounded-[12px] bg-sunken/70 p-2 transition-[flex-basis] transition-ui ${cards.length === 0 ? 'w-[124px]' : 'min-w-[208px] flex-1 basis-[208px]'}`}
    >
      <header className="mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[12px] font-bold text-muted shadow-e1">{index + 1}</span>
          <Icon aria-hidden="true" size={15} className="shrink-0 text-subtle" />
          <span className="tabular ms-auto rounded-full bg-surface px-2 text-[12px] font-semibold text-muted shadow-e1" aria-label={t('flow.countLabel', { count: cards.length })}>{cards.length}</span>
        </div>
        <h2 id={headingId} className="mt-1.5 text-sm font-semibold leading-snug text-fg">{t(`journeyStage.${stage}`)}</h2>
        {cards.length > 0 && <p className="mt-0.5 text-[12px] leading-snug text-subtle">{t(`flowHint.${stage}`)}</p>}
        {waiting > 0 && <p className="mt-1 text-[12px] font-medium text-signal-fg">{t('flow.needsYou', { count: waiting })}</p>}
      </header>
      {cards.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong p-2.5 text-center text-[12.5px] leading-snug text-subtle">
          {t(`flowEmpty.${stage}`)}
          {stage === 'review' && <Button size="sm" icon={Play} onClick={onRun}>{t('flow.runAgent')}</Button>}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">{cards.map((card) => <FlowCard key={card.id} card={card} showOwner={showOwner} />)}</ul>
      )}
    </section>
  );
}

function RunningAgents({ runs }) {
  const { t } = useI18n();
  if (runs.length === 0) return null;
  return (
    <div role="status" className="animate-rise mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-info-line bg-info-soft px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-semibold text-link"><Bot aria-hidden="true" size={18} className="animate-pulse motion-reduce:animate-none" />{t('flow.agentsSearching', { count: runs.length })}</span>
      {runs.map((run) => <span key={run.id} className="text-muted">{t('flow.runLine', { code: run.mandate_code, count: run.batch_size })}</span>)}
      <span className="text-[13px] text-subtle">{t('flow.runHint')}</span>
    </div>
  );
}

export function FlowPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [scope, setScope] = useState('me');
  const [running, setRunning] = useState(false);
  const result = useLoad(`/flow${toQuery({ owner: scope })}`);
  usePolling(result, Boolean(result.data && result.data.runs.length > 0));

  const header = (
    <PageHeader
      title={t('nav.flow')}
      subtitle={t('flow.subtitle')}
      actions={(
        <>
          {isAdmin && (
            <Button variant="ghost" aria-pressed={scope === 'all'} onClick={() => setScope(scope === 'me' ? 'all' : 'me')}>
              {scope === 'me' ? t('research.showAll') : t('research.showMine')}
            </Button>
          )}
          <Button icon={Sparkles} onClick={() => setRunning(true)}>{t('flow.runAgent')}</Button>
        </>
      )}
    />
  );
  return (
    <>
      {header}
      <Loaded result={result} skeleton={<SkeletonRows rows={6} />}>
        {(data) => {
          const byStage = Object.fromEntries(JOURNEY_STAGES.map((stage) => [stage, data.cards.filter((card) => card.journey.stage === stage)]));
          return (
            <>
              <RunningAgents runs={data.runs} />
              <div className="flow-board -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6" tabIndex={0} aria-label={t('flow.boardLabel')}>
                <div className="flex items-stretch gap-3">
                  {JOURNEY_STAGES.map((stage, index) => (
                    <Column key={stage} stage={stage} index={index} cards={byStage[stage]} showOwner={scope === 'all'} onRun={() => setRunning(true)} />
                  ))}
                </div>
              </div>
            </>
          );
        }}
      </Loaded>
      {running && (
        <RunAgentDialog
          onClose={() => setRunning(false)}
          onQueued={(run) => {
            setRunning(false);
            toast({ title: t('flow.runStarted', { code: run.mandate_code }) });
            result.reload();
          }}
        />
      )}
    </>
  );
}
