// "Next step" on a company's journey page: the one action that moves this lead on, with its button right here.
// Big and first on the page; everything else on the page supports it.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowDown, Trophy, CircleX, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post, patch } from '../../api.js';
import { Button, ButtonLink, ErrorBox, useToast } from '../../ui/index.js';
import { useCounts } from '../../app/CountsProvider.jsx';
import { useDraftFlow } from '../../components/useDraftFlow.jsx';
import { ScheduleMeetingDialog } from '../../components/ScheduleMeetingDialog.jsx';
import { ACTION_ICONS, needsYou, useActionLabel, daysSince } from './journey.jsx';
import { JOURNEY_STAGES } from '../../../../shared/enums.js';

/** Bring a section of the page into view and flash it, so the eye lands on it. */
export function focusSection(id) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  element.classList.remove('section-flash');
  void element.offsetWidth; // restart the animation
  element.classList.add('section-flash');
  const target = element.querySelector('button, select, input, a');
  if (target) target.focus({ preventScroll: true });
}

function Actions({ card, onChanged, openDraft, onSchedule }) {
  const { t } = useI18n();
  const toast = useToast();
  const { refresh } = useCounts();
  const { next } = card.journey;
  const approve = useAction(async () => {
    await post(`/opportunities/${card.id}/decision`, { decision: 'accept' });
    toast({ title: t('nextAction.approved') });
    refresh();
    onChanged();
  });
  const followup = useAction(async () => {
    const { id } = await post(`/conversations/${next.contact_id}/followup`, { mode: 'ai' });
    onChanged();
    openDraft(id);
  });
  const close = useAction(async (status) => {
    await patch(`/deals/${next.deal_id}`, { status });
    toast({ title: status === 'won' ? t('nextAction.wonToast') : t('nextAction.lostToast') });
    onChanged();
  });
  const error = approve.error ?? followup.error ?? close.error;
  const scroll = (id, label) => <Button variant="primary" icon={ArrowDown} onClick={() => focusSection(id)}>{label}</Button>;

  const buttons = {
    decide: (
      <>
        <Button variant="success" icon={Check} loading={approve.busy} onClick={() => approve.run()}>{t('nextAction.approve')}</Button>
        <Button variant="secondary" onClick={() => focusSection('decision-panel')}>{t('nextAction.otherDecision')}</Button>
      </>
    ),
    assign: scroll('assign-panel', t('nextAction.assign')),
    pick_contact: scroll('decision-makers', t('nextAction.pickContact')),
    draft_message: scroll('first-approach', t('nextAction.draftMessage')),
    send: <Button variant="primary" icon={ACTION_ICONS.send} onClick={() => openDraft(next.approval_id)}>{t('nextAction.reviewAndSend')}</Button>,
    wait: <ButtonLink variant="secondary" to={`/conversations/${next.contact_id}`}>{t('nextAction.logReply')}</ButtonLink>,
    followup: (
      <>
        <Button variant="primary" icon={ACTION_ICONS.followup} loading={followup.busy} loadingLabel={t('outreach.drafting')} onClick={() => followup.run()}>{t('nextAction.writeFollowup')}</Button>
        <ButtonLink variant="secondary" to={`/conversations/${next.contact_id}`}>{t('nextAction.logReply')}</ButtonLink>
      </>
    ),
    answer: <ButtonLink variant="primary" icon={ACTION_ICONS.answer} to={`/conversations/${next.contact_id}`}>{t('nextAction.answer')}</ButtonLink>,
    schedule: <Button variant="primary" icon={ACTION_ICONS.schedule} onClick={onSchedule}>{t('nextAction.schedule')}</Button>,
    meeting_upcoming: <ButtonLink variant="secondary" to="/calendar">{t('nextAction.openCalendar')}</ButtonLink>,
    summarize: <ButtonLink variant="primary" icon={ACTION_ICONS.summarize} to={`/meetings/${next.meeting_id}/complete`}>{t('nextAction.summarize')}</ButtonLink>,
    close: next.deal_id === null ? <ButtonLink variant="secondary" to="/pipeline">{t('nextAction.openPipeline')}</ButtonLink> : (
      <>
        <Button variant="success" icon={Trophy} loading={close.busy} onClick={() => close.run('won')}>{t('nextAction.won')}</Button>
        <Button variant={next.suggested === 'lost' ? 'danger' : 'secondary'} icon={CircleX} loading={close.busy} onClick={() => close.run('lost')}>{t('nextAction.lost')}</Button>
      </>
    ),
    done: next.deal_id ? <ButtonLink variant="secondary" icon={ExternalLinkIcon} to={`/deals/${next.deal_id}`}>{t('nextAction.openDeal')}</ButtonLink> : null,
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">{buttons[next.kind]}</div>
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
    </>
  );
}

export function NextAction({ card, canAct, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const actionLabel = useActionLabel();
  const flow = useDraftFlow(onChanged);
  const [scheduling, setScheduling] = useState(false);
  const { journey } = card;
  const { next } = journey;
  const Icon = ACTION_ICONS[next.kind];
  const urgent = needsYou(next);
  const won = next.kind === 'done' && next.outcome === 'won';
  const help = next.kind === 'wait'
    ? (next.due_at === null ? t('nextActionHelp.waitLimit')
      : daysSince(journey.since) === 0 ? t('nextActionHelp.waitDueToday', { date: format.date(next.due_at) })
        : t('nextActionHelp.waitDue', { date: format.date(next.due_at), days: daysSince(journey.since) }))
    : t(`nextActionHelp.${next.kind === 'done' ? `done_${next.outcome}` : next.kind}`);
  return (
    <section
      aria-labelledby="next-action-title"
      className={`next-action animate-rise relative overflow-hidden rounded-[14px] border bg-surface p-5 shadow-e2 ${won ? 'border-success' : urgent ? 'border-link' : 'border-line'}`}
    >
      <span aria-hidden="true" className="next-action-accent absolute inset-y-0 start-0 w-1.5" />
      <div className="flex flex-wrap items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${won ? 'bg-success text-white animate-pop' : urgent ? 'bg-primary text-on-primary' : 'bg-sunken text-muted'}`}>
          <Icon aria-hidden="true" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-subtle">
            {next.kind === 'done'
              ? t('nextAction.eyebrowDone', { total: JOURNEY_STAGES.length })
              : t('nextAction.eyebrow', { step: JOURNEY_STAGES.indexOf(journey.stage) + 1, total: JOURNEY_STAGES.length, stage: t(`journeyStage.${journey.stage}`) })}
          </p>
          <h2 id="next-action-title" className="mt-0.5 text-xl font-bold text-fg">{actionLabel(next, format)}</h2>
          <p className="mt-1 text-sm text-muted">{help}</p>
          {canAct && <div className="mt-4"><Actions card={card} onChanged={onChanged} openDraft={flow.openDraft} onSchedule={() => setScheduling(true)} /></div>}
        </div>
      </div>
      {flow.elements}
      <ScheduleMeetingDialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        onScheduled={() => { setScheduling(false); onChanged(); }}
        company={{ id: card.company.id, name: card.company.name, deals: card.deal ? [card.deal] : [] }}
        initialDealId={card.deal ? card.deal.id : null}
      />
    </section>
  );
}
