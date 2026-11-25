// Shared pieces of the lead flow: stage and action metadata, the journey bar and the "needs you" logic.

import { Check, Search, FileSearch, UserPlus, PenLine, Send, Hourglass, Reply, MessageSquareReply, CalendarPlus, CalendarClock,
  NotebookPen, Handshake, Trophy, CircleX, UserCog } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { JOURNEY_STAGES } from '../../../../shared/enums.js';

// Actions where the owner is the one who moves the card; the others are waiting on someone else or done.
const NEEDS_YOU = ['decide', 'assign', 'pick_contact', 'draft_message', 'send', 'followup', 'answer', 'schedule', 'summarize', 'close'];

export const ACTION_ICONS = {
  decide: FileSearch, assign: UserCog, pick_contact: UserPlus, draft_message: PenLine, send: Send, wait: Hourglass, followup: Reply,
  answer: MessageSquareReply, schedule: CalendarPlus, meeting_upcoming: CalendarClock, summarize: NotebookPen, close: Handshake, done: Trophy,
};

export const STAGE_ICONS = {
  review: Search, approved: Check, message: PenLine, waiting: Hourglass, replied: MessageSquareReply, meeting: CalendarClock, closed: Handshake,
};

export function needsYou(next) {
  return NEEDS_YOU.includes(next.kind);
}

/** The short label of a next action, e.g. "Approve & send the message" or "Meeting on 3 Dec". */
export function useActionLabel() {
  const { t } = useI18n();
  return (next, format) => {
    if (next.kind === 'meeting_upcoming') return t('journeyAction.meeting_upcoming', { date: format.dateTime(next.at) });
    if (next.kind === 'done') return t(`journeyOutcome.${next.outcome}`);
    if (next.kind === 'send' && next.message_kind !== 'first_approach') return t('journeyAction.sendReply');
    return t(`journeyAction.${next.kind}`);
  };
}

/** Whole days since an ISO time (0 = today). */
export function daysSince(iso) {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

/**
 * The seven stages as a connected bar. Done stages are green with a check, the current stage is the brand blue with a
 * soft pulse, later stages are muted. A lost deal ends the bar in red.
 */
export function JourneyBar({ journey }) {
  const { t } = useI18n();
  const current = JOURNEY_STAGES.indexOf(journey.stage);
  const lost = journey.next.kind === 'done' && journey.next.outcome === 'lost';
  const won = journey.next.kind === 'done' && journey.next.outcome === 'won';
  return (
    <ol aria-label={t('journey.barLabel')} className="journey-bar grid grid-cols-7 gap-1">
      {JOURNEY_STAGES.map((stage, index) => {
        const state = index < current || won ? 'done' : index === current ? (lost ? 'lost' : 'current') : 'todo';
        const Icon = state === 'done' ? Check : state === 'lost' ? CircleX : STAGE_ICONS[stage];
        return (
          <li key={stage} aria-current={state === 'current' ? 'step' : undefined} className="flex min-w-0 flex-col items-center gap-1.5 text-center" data-state={state}>
            <span className="relative flex w-full items-center justify-center">
              {index > 0 && <span aria-hidden="true" className={`absolute end-1/2 top-1/2 h-0.5 w-full -translate-y-1/2 ${index <= current || won ? 'bg-success' : 'bg-line-strong'}`} />}
              <span className={`journey-dot relative z-[1] flex h-9 w-9 items-center justify-center rounded-full transition-colors transition-ui ${
                state === 'done' ? 'bg-success text-white' : state === 'current' ? 'bg-primary text-on-primary' : state === 'lost' ? 'bg-danger text-white' : 'border border-line-strong bg-surface text-subtle'
              }`}>
                <Icon aria-hidden="true" size={17} strokeWidth={2.25} className={state === 'done' ? 'animate-pop' : ''} />
              </span>
            </span>
            <span className={`text-[12.5px] leading-tight ${state === 'todo' ? 'text-subtle' : 'font-semibold text-fg'}`}>
              {t(`journeyStage.${stage}`)}
              <span className="sr-only"> – {t(`journey.state.${state}`)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
