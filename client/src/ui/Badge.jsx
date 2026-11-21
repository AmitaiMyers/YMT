// Badges. StatusBadge always shows icon + text (status is never conveyed by color alone).

import { CircleCheck, CircleX, Clock, Info, Circle } from 'lucide-react';

const TONES = {
  neutral: 'bg-sunken text-muted',
  info: 'bg-info-soft text-link',
  signal: 'bg-signal-soft text-signal-fg',
  success: 'bg-success-soft text-success-fg',
  danger: 'bg-danger-soft text-danger-fg',
};
const TONE_ICONS = { neutral: Circle, info: Info, signal: Clock, success: CircleCheck, danger: CircleX };

// Semantic status → tone, in one place (docs/DESIGN_SYSTEM.md §1.1).
export const STATUS_TONES = {
  approval: { pending: 'signal', approved: 'info', rejected: 'danger', sent: 'success' },
  deal: { open: 'info', won: 'success', lost: 'danger' },
  document: { draft: 'neutral', finalized: 'signal', signed: 'success' },
  meeting: { scheduled: 'info', done: 'success', cancelled: 'neutral' },
  share: { active: 'success', expired: 'neutral', revoked: 'danger' },
  opportunity: { draft: 'signal', needs_review: 'signal', manual_assignment: 'signal', accepted: 'success', verify: 'info', deferred: 'neutral', rejected: 'danger' },
  run: { queued: 'neutral', running: 'info', done: 'success', failed: 'danger', waiting_budget: 'signal' },
  verdict: { match: 'success', weak: 'signal', no_match: 'danger' },
  mandate: { active: 'success', paused: 'neutral' },
  discovery: { open: 'info', answered: 'success', expired: 'neutral', revoked: 'danger' },
};

export function statusTone(domain, status) {
  const tone = STATUS_TONES[domain][status];
  if (!tone) throw new Error(`No tone for ${domain}.${status}`);
  return tone;
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  if (!TONES[tone]) throw new Error(`Unknown badge tone: ${tone}`);
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium leading-5 ${TONES[tone]} ${className}`}>{children}</span>;
}

export function StatusBadge({ tone, children }) {
  const Icon = TONE_ICONS[tone];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden="true" size={13} strokeWidth={2.25} />
      {children}
    </Badge>
  );
}

/** Small numeric counter (navigation badges). Announced via its label. */
export function CountBadge({ count, tone = 'signal', label }) {
  if (!count) return null;
  return (
    <span aria-label={label} className={`tabular min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5 ${tone === 'signal' ? 'bg-signal text-on-signal' : 'bg-sidebar-active text-sidebar-fg'}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
