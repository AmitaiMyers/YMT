// Human-in-the-loop approval queue. Every generated brief / email waits here for a person.
// Sending is always manual and one-by-one: staff open the draft in their own mail client and then confirm.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../hooks/useApi.js';
import { patch, post } from '../api.js';
import { Card, Loaded, PageHeader, Tabs, Badge, Button, ErrorBox, Notice, Empty } from '../components/ui.jsx';
import { INPUT_CLASS } from '../components/EntityForm.jsx';
import { CopyButton } from '../components/CopyButton.jsx';
import { APPROVAL_STATUSES, EMAIL_KINDS } from '../../../shared/enums.js';

const STATUS_COLORS = { pending: 'amber', approved: 'blue', rejected: 'red', sent: 'green' };

function mailtoHref(item) {
  const params = new URLSearchParams({ subject: item.subject ?? '', body: item.content });
  return `mailto:${encodeURIComponent(item.recipient_email)}?${params.toString().replace(/\+/g, '%20')}`;
}

function PendingEditor({ item, onDone }) {
  const { t } = useI18n();
  const isEmail = EMAIL_KINDS.includes(item.kind);
  const [draft, setDraft] = useState({ subject: item.subject ?? '', content: item.content, recipient_email: item.recipient_email ?? '' });
  const [note, setNote] = useState('');
  const changed = draft.subject !== (item.subject ?? '') || draft.content !== item.content || draft.recipient_email !== (item.recipient_email ?? '');

  const save = useAction(async () => {
    const body = isEmail ? { ...draft, recipient_email: draft.recipient_email || null } : { content: draft.content };
    await patch(`/approvals/${item.id}`, body);
    onDone();
  });
  const approve = useAction(async () => {
    await post(`/approvals/${item.id}/approve`, { note: note || null });
    onDone();
  });
  const reject = useAction(async () => {
    await post(`/approvals/${item.id}/reject`, { note });
    onDone();
  });

  return (
    <div className="space-y-3">
      <ErrorBox message={save.error ?? approve.error ?? reject.error} />
      {isEmail && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{t('approval.recipient')}
            <input type="email" className={INPUT_CLASS} value={draft.recipient_email} onChange={(e) => setDraft({ ...draft, recipient_email: e.target.value })} />
          </label>
          <label className="text-sm">{t('approval.subject')}
            <input className={INPUT_CLASS} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </label>
        </div>
      )}
      <textarea
        dir={item.language === 'he' ? 'rtl' : 'ltr'}
        rows={12}
        className={`${INPUT_CLASS}`}
        value={draft.content}
        onChange={(e) => setDraft({ ...draft, content: e.target.value })}
      />
      <input className={INPUT_CLASS} placeholder={t('approval.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!changed || save.busy} onClick={save.run}>{t('approval.saveEdits')}</Button>
        <Button variant="success" disabled={changed || approve.busy} onClick={() => window.confirm(t('approval.confirmApprove')) && approve.run()}>
          {t('approval.approve')}
        </Button>
        <Button variant="danger" disabled={!note || reject.busy} onClick={reject.run} title={t('approval.rejectNeedsNote')}>{t('approval.reject')}</Button>
      </div>
      {changed && <p className="text-xs text-amber-700">{t('approval.saveBeforeApprove')}</p>}
    </div>
  );
}

function ApprovedActions({ item, onDone }) {
  const { t } = useI18n();
  const markSent = useAction(async () => {
    await post(`/approvals/${item.id}/mark-sent`);
    onDone();
  });
  if (!EMAIL_KINDS.includes(item.kind)) return <p className="text-sm text-emerald-700">{t('approval.briefSaved')}</p>;
  return (
    <div className="space-y-2">
      <ErrorBox message={markSent.error} />
      <Notice color="amber">{t('approval.manualSendHelp')}</Notice>
      <div className="flex flex-wrap gap-2">
        <a className="inline-flex items-center rounded-md bg-brand-900 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700" href={mailtoHref(item)}>
          {t('approval.openInMail')}
        </a>
        <CopyButton text={`${item.subject ?? ''}\n\n${item.content}`} label={t('approval.copyText')} />
        <Button variant="success" disabled={markSent.busy} onClick={() => window.confirm(t('approval.confirmSent')) && markSent.run()}>
          {t('approval.markSent')}
        </Button>
      </div>
    </div>
  );
}

function ApprovalCard({ item, onDone }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Badge color={STATUS_COLORS[item.status]}>{t(`approvalStatus.${item.status}`)}</Badge>
          <span>{t(`approvalKind.${item.kind}`)}</span>
          <span className="text-slate-400">·</span>
          <Link className="text-brand-700 hover:underline" to={`/companies/${item.company_id}`}>{item.company_name}</Link>
          {item.contact_name && <span className="text-sm font-normal text-slate-500">→ {item.contact_name}</span>}
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{t('approval.createdBy', { name: item.created_by_name, date: format.dateTime(item.created_at) })}</span>
        {item.reviewed_by_name && <span>{t('approval.reviewedBy', { name: item.reviewed_by_name, date: format.dateTime(item.reviewed_at) })}</span>}
        {item.sent_by_name && <span>{t('approval.sentBy', { name: item.sent_by_name, date: format.dateTime(item.sent_at) })}</span>}
        {item.review_note && <span>{t('approval.note')}: {item.review_note}</span>}
        {item.deal_title && <span>{t('meeting.deal')}: {item.deal_title}</span>}
      </div>
      {item.status === 'pending' ? <PendingEditor item={item} onDone={onDone} /> : (
        <>
          {item.recipient_email && <p className="mb-1 text-sm"><strong>{t('approval.recipient')}:</strong> {item.recipient_email}</p>}
          {item.subject && <p className="mb-2 text-sm"><strong>{t('approval.subject')}:</strong> {item.subject}</p>}
          <pre dir={item.language === 'he' ? 'rtl' : 'ltr'} className="prose-pre mb-3 rounded-md bg-slate-50 p-3 text-sm">{item.content}</pre>
          {item.status === 'approved' && <ApprovedActions item={item} onDone={onDone} />}
        </>
      )}
    </Card>
  );
}

export function ApprovalsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('pending');
  const result = useLoad(`/approvals?status=${status}`);
  return (
    <>
      <PageHeader title={t('nav.approvals')} subtitle={t('approval.subtitle')} />
      <Notice>{t('approval.policy')}</Notice>
      <Tabs tabs={APPROVAL_STATUSES.map((key) => ({ key, label: t(`approvalStatus.${key}`) }))} active={status} onChange={setStatus} />
      <Loaded result={result}>
        {(items) => (items.length === 0 ? <Empty>{t('approval.none')}</Empty> : (
          <div className="space-y-4">
            {items.map((item) => <ApprovalCard key={`${item.id}-${item.status}`} item={item} onDone={result.reload} />)}
          </div>
        ))}
      </Loaded>
    </>
  );
}
