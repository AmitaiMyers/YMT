// "Next step" guidance on the client file: the most useful 1–3 actions, computed from the file's state.

import { useNavigate } from 'react-router-dom';
import { Sparkles, ClipboardCheck, UserCheck, FileText, Send, CalendarClock, NotebookPen, Handshake } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Button, ErrorBox } from '../../ui/index.js';
import { useViewMode } from '../../app/viewMode.jsx';

const MAX_STEPS = 3;

/** Pure: ordered list of suggested steps for this company. */
export function suggestNextSteps(data, now = new Date().toISOString()) {
  const steps = [];
  const pending = data.approvals.filter((a) => a.status === 'pending');
  const verifiedWithEmail = data.contacts.filter((c) => c.verified && c.email);
  const outreachEver = data.approvals.some((a) => a.kind === 'outreach_email');
  const scheduled = data.meetings.filter((m) => m.status === 'scheduled');
  const past = scheduled.find((m) => m.scheduled_at < now);
  const upcoming = scheduled.filter((m) => m.scheduled_at >= now).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

  if (pending.length > 0) steps.push({ kind: 'review', approvalId: pending[0].id, count: pending.length });
  if (past) steps.push({ kind: 'summarize', meeting: past });
  if (upcoming) steps.push({ kind: 'prep', meeting: upcoming });
  if (verifiedWithEmail.length === 0) steps.push({ kind: 'verify' });
  if (!data.company.approved_brief && !pending.some((a) => a.kind === 'company_brief')) steps.push({ kind: 'brief' });
  if (verifiedWithEmail.length > 0 && !outreachEver) steps.push({ kind: 'outreach', contact: verifiedWithEmail[0] });
  if (data.deals.length === 0) steps.push({ kind: 'deal' });
  return steps.slice(0, MAX_STEPS);
}

const ICONS = { review: ClipboardCheck, summarize: NotebookPen, prep: CalendarClock, verify: UserCheck, brief: FileText, outreach: Send, deal: Handshake };

export function NextStepPanel({ data, flow, onTab, onChanged }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { shows } = useViewMode();
  // Focus mode: no link to the hidden prep sheet, and no old brief/template-email generators.
  const steps = suggestNextSteps(data).filter((step) => (step.kind === 'prep' ? shows('meetingPrep')
    : ['brief', 'outreach'].includes(step.kind) ? shows('companyGenerators') : true));
  const generate = useAction(async (step) => {
    const body = step.kind === 'brief'
      ? { path: `/companies/${data.company.id}/brief`, payload: { language } }
      : { path: `/companies/${data.company.id}/outreach`, payload: { contact_id: step.contact.id, language: step.contact.preferred_language } };
    const { id } = await post(body.path, body.payload);
    onChanged();
    flow.openDraft(id);
  });
  if (steps.length === 0) return null;

  const run = {
    review: (step) => flow.openDraft(step.approvalId),
    summarize: (step) => navigate(`/meetings/${step.meeting.id}/complete`),
    prep: (step) => navigate(`/meetings/${step.meeting.id}/prep`),
    verify: () => onTab('contacts'),
    brief: (step) => generate.run(step),
    outreach: (step) => generate.run(step),
    deal: () => onTab('pipeline'),
  };
  const label = (step) => ({
    review: t('next.review', { count: step.count }),
    summarize: t('next.summarize', { title: step.meeting?.title }),
    prep: t('next.prep', { title: step.meeting?.title }),
    verify: t('next.verify'),
    brief: t('next.brief'),
    outreach: t('next.outreach', { name: step.contact?.full_name }),
    deal: t('next.deal'),
  })[step.kind];

  return (
    <section aria-labelledby="next-step-title" className="mb-6 rounded-[10px] border border-info-line bg-info-soft p-4">
      <h2 id="next-step-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <Sparkles aria-hidden="true" size={16} className="text-link" />{t('next.title')}
      </h2>
      <ErrorBox message={generate.error} />
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, index) => (
          <li key={step.kind}>
            <Button
              variant={index === 0 ? 'primary' : 'secondary'}
              size="sm"
              icon={ICONS[step.kind]}
              offlineOk={['verify', 'deal', 'prep', 'summarize'].includes(step.kind)}
              loading={generate.busy && ['brief', 'outreach'].includes(step.kind)}
              onClick={() => run[step.kind](step)}
            >
              <bdi>{label(step)}</bdi>
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
