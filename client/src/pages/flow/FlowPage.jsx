// Lead flow (25.11.2026): the home of the Focused view. One column per step of YMT's flow, from the agent's find to the
// closed deal; every card says the one thing to do next. "Run agent" starts a search right here and the board shows
// the agents still searching. "Import CSV" puts a company list (e.g. the SHEPHA tracker) on the board, each company at
// its step; "Select" picks cards to run their agent on together. Desktop first: columns scroll sideways inside the board.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Bot, Sparkles, Download, Upload, ListChecks, Check, X } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { toQuery, post, get } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { PageHeader, Button, Loaded, SkeletonRows, ErrorBox, useToast, useConfirm } from '../../ui/index.js';
import { ScoreBadge } from '../research/researchUi.jsx';
import { usePolling } from '../research/MandatesPage.jsx';
import { RunAgentDialog } from './RunAgentDialog.jsx';
import { ImportListDialog } from '../research/ImportListDialog.jsx';
import { SendToReviewDialog, useSentToast } from '../research/SendToReviewDialog.jsx';
import { ACTION_ICONS, STAGE_ICONS, needsYou, useActionLabel, daysSince } from './journey.jsx';
import { JOURNEY_STAGES } from '../../../../shared/enums.js';

const CARD_CLASS = 'flow-card group block rounded-[10px] border bg-surface p-3 shadow-e1 transition-[transform,box-shadow,border-color] transition-ui hover:-translate-y-0.5 hover:shadow-e2';

/** A card on the board: opens the company's page – or, while selecting, ticks the card. */
function FlowCard({ card, showOwner, selection }) {
  const urgent = needsYou(card.journey.next);
  const edge = urgent ? 'border-line border-s-[3px] border-s-signal' : 'border-line';
  if (selection === null) {
    return (
      <li>
        <Link to={`/research/cards/${card.id}`} className={`${CARD_CLASS} focus-visible:-translate-y-0.5 ${edge}`}>
          <FlowCardBody card={card} showOwner={showOwner} />
        </Link>
      </li>
    );
  }
  const checked = selection.has(card.id);
  return (
    <li>
      <label className={`${CARD_CLASS} relative cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-link ${checked ? 'border-link bg-info-soft' : edge}`}>
        <input type="checkbox" className="sr-only" checked={checked} onChange={() => selection.toggle([card.id])} />
        <span aria-hidden="true" className={`absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-[4px] border ${checked ? 'border-link bg-link text-white' : 'border-line-strong bg-surface'}`}>
          {checked && <Check size={14} />}
        </span>
        <FlowCardBody card={card} showOwner={showOwner} />
      </label>
    </li>
  );
}

function FlowCardBody({ card, showOwner }) {
  const { t } = useI18n();
  const format = useFormat();
  const actionLabel = useActionLabel();
  const { next } = card.journey;
  const ActionIcon = ACTION_ICONS[next.kind];
  const urgent = needsYou(next);
  const days = daysSince(card.journey.since);
  return (
    <>
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 pe-6">
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
    </>
  );
}

function Column({ stage, index, cards, showOwner, onRun, selection }) {
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
        {selection !== null && cards.length > 0 && (
          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-link">
            <input type="checkbox" className="h-3.5 w-3.5" checked={cards.every((card) => selection.has(card.id))} onChange={(event) => selection.toggle(cards.map((card) => card.id), event.target.checked)} />
            {t('flow.selectColumn')}
          </label>
        )}
      </header>
      {cards.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong p-2.5 text-center text-[12.5px] leading-snug text-subtle">
          {t(`flowEmpty.${stage}`)}
          {stage === 'review' && <Button size="sm" icon={Play} onClick={onRun}>{t('flow.runAgent')}</Button>}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">{cards.map((card) => <FlowCard key={card.id} card={card} showOwner={showOwner} selection={selection} />)}</ul>
      )}
    </section>
  );
}

const RUN_LINES_SHOWN = 4;

function RunningAgents({ runs }) {
  const { t } = useI18n();
  if (runs.length === 0) return null;
  return (
    <div role="status" className="animate-rise mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-info-line bg-info-soft px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-semibold text-link"><Bot aria-hidden="true" size={18} className="animate-pulse motion-reduce:animate-none" />{t('flow.agentsSearching', { count: runs.length })}</span>
      {runs.slice(0, RUN_LINES_SHOWN).map((run) => (
        <span key={run.id} className="text-muted">
          {run.company_name === null ? t('flow.runLine', { code: run.mandate_code, count: run.batch_size }) : t('flow.runCompanyLine', { code: run.mandate_code, company: run.company_name })}
        </span>
      ))}
      {runs.length > RUN_LINES_SHOWN && <span className="text-muted">{t('flow.moreRuns', { count: runs.length - RUN_LINES_SHOWN })}</span>}
      <span className="text-[13px] text-subtle">{t('flow.runHint')}</span>
    </div>
  );
}

/**
 * Every company card (also rejected and deferred ones) with everything the CRM knows about it, as one CSV file in the
 * CRM's data folder (data/exports) – built on the server so nothing is left out. Its first columns are the ones the
 * watch-list import recognises, so the file also loads back as a list.
 */
function useExportCsv() {
  const { t } = useI18n();
  const toast = useToast();
  return useAction(async (owner) => {
    const { path, count } = await post('/exports/companies', { owner });
    toast({ title: t('flow.exported', { count }), body: <bdi dir="ltr" className="break-all">{path}</bdi>, duration: 12_000 });
  });
}

/** Ticked cards while selecting: a set of card ids with toggle(ids, on?) (on omitted = flip). */
function useSelection() {
  const [ids, setIds] = useState(() => new Set());
  return {
    size: ids.size,
    ids: [...ids],
    has: (id) => ids.has(id),
    clear: () => setIds(new Set()),
    toggle: (cardIds, on) => setIds((previous) => {
      const next = new Set(previous);
      for (const id of cardIds) {
        if (on ?? !next.has(id)) next.add(id);
        else next.delete(id);
      }
      return next;
    }),
  };
}

/** "Run agent on N companies": each card's own agent researches its company; the board shows the runs. */
function useRunSelected(onDone) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  return useAction(async (ids) => {
    const ok = await confirm({ title: t('flow.runSelectedTitle', { count: ids.length }), body: t('flow.runSelectedBody', { count: ids.length }), confirmLabel: t('flow.runSelectedConfirm') });
    if (!ok) return;
    const result = await post('/opportunities/research', { opportunity_ids: ids.map(String) });
    toast({
      title: t('flow.runSelectedStarted', { count: result.queued.length }),
      body: result.skipped.length > 0 && <span className="block">{t('flow.runSelectedSkipped', { count: result.skipped.length, reasons: [...new Set(result.skipped.map((row) => row.reason))].join(' · ') })}</span>,
    });
    onDone();
  });
}

export function FlowPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const sentToast = useSentToast();
  const isAdmin = user.role === 'admin';
  const [scope, setScope] = useState('me');
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(null); // { list, entryIds } after an import
  const [selecting, setSelecting] = useState(false);
  const selection = useSelection();
  const result = useLoad(`/flow${toQuery({ owner: scope })}`);
  const exportCsv = useExportCsv();
  const stopSelecting = () => { setSelecting(false); selection.clear(); };
  const runSelected = useRunSelected(() => { stopSelecting(); result.reload(); });
  const afterImport = useAction(async (imported) => {
    const list = await get(`/watch-lists/${imported.id}`);
    setImporting(false);
    setSending({ list, entryIds: list.entries.filter((entry) => !entry.blocked).map((entry) => entry.id) });
  });
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
          <Button variant="secondary" icon={Download} loading={exportCsv.busy} onClick={() => exportCsv.run(scope)}>
            {t('flow.exportCsv')}
          </Button>
          <Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>{t('flow.importCsv')}</Button>
          <Button variant={selecting ? 'primary' : 'secondary'} icon={selecting ? X : ListChecks} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? t('flow.selectDone') : t('flow.select')}
          </Button>
          <Button icon={Sparkles} onClick={() => setRunning(true)}>{t('flow.runAgent')}</Button>
        </>
      )}
    />
  );
  return (
    <>
      {header}
      {exportCsv.error && <div className="mb-4"><ErrorBox message={exportCsv.error} /></div>}
      {afterImport.error && <div className="mb-4"><ErrorBox message={afterImport.error} /></div>}
      {selecting && (
        <div role="region" aria-label={t('flow.selectBar')} className="animate-rise sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-link bg-surface px-4 py-3 text-sm shadow-e2">
          <span className="font-semibold text-fg" aria-live="polite">{t('flow.selectedCount', { count: selection.size })}</span>
          <span className="text-muted">{t('flow.selectHint')}</span>
          <span className="ms-auto flex flex-wrap gap-2">
            <Button variant="ghost" onClick={selection.clear} disabled={selection.size === 0} disabledReason={t('flow.nothingSelected')}>{t('flow.clearSelection')}</Button>
            <Button icon={Bot} loading={runSelected.busy} disabled={selection.size === 0} disabledReason={t('flow.nothingSelected')} onClick={() => runSelected.run(selection.ids)}>
              {t('flow.runSelected', { count: selection.size })}
            </Button>
          </span>
          {runSelected.error && <div className="w-full"><ErrorBox message={runSelected.error} /></div>}
        </div>
      )}
      <Loaded result={result} skeleton={<SkeletonRows rows={6} />}>
        {(data) => {
          const byStage = Object.fromEntries(JOURNEY_STAGES.map((stage) => [stage, data.cards.filter((card) => card.journey.stage === stage)]));
          return (
            <>
              <RunningAgents runs={data.runs} />
              <div className="flow-board -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6" tabIndex={0} aria-label={t('flow.boardLabel')}>
                <div className="flex items-stretch gap-3">
                  {JOURNEY_STAGES.map((stage, index) => (
                    <Column key={stage} stage={stage} index={index} cards={byStage[stage]} showOwner={scope === 'all'} onRun={() => setRunning(true)} selection={selecting ? selection : null} />
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
      {importing && <ImportListDialog open onClose={() => setImporting(false)} onImported={(imported) => afterImport.run(imported)} />}
      {sending && (
        <SendToReviewDialog
          list={sending.list}
          entryIds={sending.entryIds}
          onClose={() => setSending(null)}
          onSent={(sent) => {
            setSending(null);
            sentToast(sent);
            result.reload();
          }}
        />
      )}
    </>
  );
}
