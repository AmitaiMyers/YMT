// "Run agent" on one card (25.11.2026): the card's agent researches its company again – a fresh dated initiative,
// the company profile with cited facts, its verdict – and looks for decision makers. The same card is updated.

import { Bot } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Button, ErrorBox, useToast } from '../../ui/index.js';

const ACTIVE = ['queued', 'running', 'waiting_budget'];

export const isAgentResearching = (card) => card.agent_run !== null && ACTIVE.includes(card.agent_run.status);

export function CardAgentButton({ card, onStarted }) {
  const { t } = useI18n();
  const toast = useToast();
  const start = useAction(async () => {
    await post(`/opportunities/${card.id}/research`);
    toast({ title: t('cardAgent.started', { code: card.mandate_code }) });
    onStarted();
  });
  const busy = isAgentResearching(card);
  return (
    <>
      <Button
        variant="secondary" icon={Bot} loading={start.busy || busy} loadingLabel={t('cardAgent.researching')}
        disabled={card.mandate_id === null} disabledReason={t('cardAgent.needsAgent')} onClick={() => start.run()}
      >
        {t('cardAgent.run')}
      </Button>
      {start.error && <ErrorBox message={start.error} />}
    </>
  );
}

/** What the agent is doing for this card now, or how its last research on it ended. */
export function CardAgentStatus({ card }) {
  const { t } = useI18n();
  const format = useFormat();
  const run = card.agent_run;
  if (run === null) return null;
  if (isAgentResearching(card)) {
    return (
      <div role="status" className="animate-rise mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-info-line bg-info-soft px-4 py-3 text-sm">
        <Bot aria-hidden="true" size={18} className="animate-pulse text-link motion-reduce:animate-none" />
        <span className="font-semibold text-link">{run.status === 'waiting_budget' ? t('cardAgent.waitingBudget') : t('cardAgent.researching')}</span>
        <span className="text-muted">{t('cardAgent.researchingHint')}</span>
      </div>
    );
  }
  if (run.status === 'failed') return <div className="mb-4"><ErrorBox message={t('cardAgent.failed', { error: run.error })} /></div>;
  return (
    <p className="mb-4 text-[13px] text-subtle">
      {run.candidates_found > 0
        ? t('cardAgent.doneFresh', { date: format.dateTime(run.finished_at) })
        : t('cardAgent.doneSame', { date: format.dateTime(run.finished_at) })}
    </p>
  );
}
