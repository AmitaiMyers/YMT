// The human-in-the-loop review surface, used on the Approvals page and inside the draft side sheet.
// Reversible: edit & save. Irreversible (approve, reject, mark as sent): confirmation dialog stating the consequence.

import { useMemo, useState } from 'react';
import { Check, X, Mail, Send, GitCompare, Save } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useAction } from '../hooks/useApi.js';
import { patch, post } from '../api.js';
import { Button, ErrorBox, Notice, GeneratedText, useConfirm, useToast } from '../ui/index.js';
import { INPUT_CLASS } from './EntityForm.jsx';
import { CopyButton } from './CopyButton.jsx';
import { useCounts } from '../app/CountsProvider.jsx';
import { lineDiff } from '../lib/lineDiff.js';
import { EMAIL_KINDS } from '../../../shared/enums.js';

const FIELD_CLASS = `${INPUT_CLASS} border-line-strong`;

function mailtoHref(item) {
  const params = new URLSearchParams({ subject: item.subject ?? '', body: item.content });
  return `mailto:${encodeURIComponent(item.recipient_email)}?${params.toString().replace(/\+/g, '%20')}`;
}

function DiffView({ before, after, language }) {
  const { t } = useI18n();
  const rows = useMemo(() => lineDiff(before, after), [before, after]);
  const styles = { same: 'text-muted', added: 'bg-success-soft text-success-fg', removed: 'bg-danger-soft text-danger-fg line-through' };
  const marks = { same: ' ', added: '+', removed: '−' };
  return (
    <div lang={language} dir={language === 'he' ? 'rtl' : 'ltr'} aria-label={t('approval.changes')} className="rounded-[6px] border border-line bg-canvas p-3 text-sm">
      {rows.map((row, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <p key={index} dir="auto" className={`whitespace-pre-wrap rounded px-1 ${styles[row.type]}`}>
          <span aria-hidden="true" className="me-2 inline-block w-3 font-mono">{marks[row.type]}</span>
          <span className="sr-only">{row.type === 'same' ? '' : t(`approval.diff.${row.type}`)}</span>
          {row.text || ' '}
        </p>
      ))}
    </div>
  );
}

/** Shared after-action feedback: toast + badge refresh + notify the parent. */
function useCompletion(onDone) {
  const toast = useToast();
  const { refresh } = useCounts();
  return (title, nextStatus) => {
    toast({ title });
    refresh();
    onDone(nextStatus);
  };
}

function PendingEditor({ item, onDone }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const complete = useCompletion(onDone);
  const isEmail = EMAIL_KINDS.includes(item.kind);
  const saved = { subject: item.subject ?? '', content: item.content, recipient_email: item.recipient_email ?? '' };
  const [draft, setDraft] = useState(saved);
  const [showChanges, setShowChanges] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const changed = draft.subject !== saved.subject || draft.content !== saved.content || draft.recipient_email !== saved.recipient_email;
  const differsFromGenerated = item.original_content !== null && draft.content !== item.original_content;

  const save = useAction(async () => {
    const body = isEmail ? { ...draft, recipient_email: draft.recipient_email || null } : { content: draft.content };
    await patch(`/approvals/${item.id}`, body);
    complete(t('toast.saved'), 'pending');
  });
  const approve = useAction(async () => {
    const ok = await confirm({
      title: t('approval.confirmApproveTitle'),
      body: isEmail ? t('approval.confirmApproveEmail', { recipient: item.recipient_email }) : t('approval.confirmApproveBrief'),
      confirmLabel: t('approval.approve'),
      tone: 'success',
    });
    if (!ok) return;
    await post(`/approvals/${item.id}/approve`, { note: note || null });
    complete(t('toast.approved'), 'approved');
  });
  const reject = useAction(async () => {
    await post(`/approvals/${item.id}/reject`, { note });
    complete(t('toast.rejected'), 'rejected');
  });

  const missingRecipient = isEmail && !saved.recipient_email;
  const approveReason = changed ? t('approval.saveBeforeApprove') : missingRecipient ? t('approval.needsRecipient') : undefined;

  return (
    <div className="space-y-4">
      <ErrorBox message={save.error ?? approve.error ?? reject.error} />
      {isEmail && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t('approval.recipient')}
            <input type="email" dir="ltr" className={`${FIELD_CLASS} mt-1.5`} value={draft.recipient_email} onChange={(e) => setDraft({ ...draft, recipient_email: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">{t('approval.subject')}
            <input dir="auto" className={`${FIELD_CLASS} mt-1.5`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </label>
        </div>
      )}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t('approval.text')}</span>
          {item.original_content !== null && (
            <button type="button" aria-pressed={showChanges} onClick={() => setShowChanges((v) => !v)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-[6px] px-2 text-[13px] font-medium ${showChanges ? 'bg-info-soft text-link' : 'text-muted hover:bg-hover'}`}>
              <GitCompare aria-hidden="true" size={15} />{t('approval.showChanges')}
              {differsFromGenerated && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />}
            </button>
          )}
        </div>
        {showChanges
          ? <DiffView before={item.original_content} after={draft.content} language={item.language} />
          : (
            <textarea
              aria-label={t('approval.text')}
              dir={item.language === 'he' ? 'rtl' : 'ltr'}
              lang={item.language}
              rows={14}
              className={`${FIELD_CLASS} leading-relaxed ${changed ? 'border-signal' : ''}`}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            />
          )}
        {changed && <p className="mt-1.5 text-[13px] font-medium text-signal-fg">{t('approval.unsaved')}</p>}
      </div>

      {rejecting && (
        <label className="block text-sm font-medium animate-rise">{t('approval.rejectReason')}
          <input autoFocus className={`${FIELD_CLASS} mt-1.5`} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {rejecting ? (
          <>
            <Button variant="danger" icon={X} loading={reject.busy} disabled={!note} disabledReason={t('approval.rejectNeedsNote')} onClick={reject.run}>{t('approval.confirmReject')}</Button>
            <Button variant="ghost" offlineOk onClick={() => { setRejecting(false); setNote(''); }}>{t('common.cancel')}</Button>
          </>
        ) : (
          <>
            <Button variant="success" icon={Check} loading={approve.busy} loadingLabel={t('approval.approving')} disabled={approveReason !== undefined} disabledReason={approveReason} onClick={approve.run}>
              {t('approval.approve')}
            </Button>
            <Button variant="secondary" icon={Save} loading={save.busy} disabled={!changed} disabledReason={t('approval.nothingToSave')} onClick={save.run}>{t('approval.saveEdits')}</Button>
            <Button variant="ghost" icon={X} className="ms-auto text-danger-fg" offlineOk onClick={() => setRejecting(true)}>{t('approval.reject')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function ApprovedActions({ item, onDone }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const complete = useCompletion(onDone);
  const markSent = useAction(async () => {
    const ok = await confirm({
      title: t('approval.confirmSentTitle'),
      body: t('approval.confirmSentBody', { recipient: item.recipient_email }),
      confirmLabel: t('approval.markSent'),
      tone: 'success',
    });
    if (!ok) return;
    await post(`/approvals/${item.id}/mark-sent`);
    complete(t('toast.markedSent'), 'sent');
  });
  if (!EMAIL_KINDS.includes(item.kind)) return <Notice>{t('approval.briefSaved')}</Notice>;
  return (
    <div className="space-y-3">
      <ErrorBox message={markSent.error} />
      <Notice tone="signal" icon={Mail}>{t('approval.manualSendHelp')}</Notice>
      <ol className="flex flex-wrap items-center gap-2">
        <li><a className="inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-primary px-4 text-sm font-medium text-on-primary shadow-e1 hover:bg-primary-hover sm:min-h-10" href={mailtoHref(item)}>
          <Mail aria-hidden="true" size={16} />1. {t('approval.openInMail')}
        </a></li>
        <li><CopyButton text={`${item.subject ?? ''}\n\n${item.content}`} label={t('approval.copyText')} /></li>
        <li><Button variant="success" icon={Send} loading={markSent.busy} onClick={markSent.run}>2. {t('approval.markSent')}</Button></li>
      </ol>
    </div>
  );
}

/** Full review card body for one approval item. `onDone(nextStatus)` fires after a successful action. */
export function ApprovalEditor({ item, onDone }) {
  const { t } = useI18n();
  const format = useFormat();
  if (item.status === 'pending') return <PendingEditor key={item.content} item={item} onDone={onDone} />;
  return (
    <div className="space-y-4">
      {item.recipient_email && <p className="text-sm"><span className="text-subtle">{t('approval.recipient')}:</span> <bdi dir="ltr">{item.recipient_email}</bdi></p>}
      {item.subject && <p className="text-sm"><span className="text-subtle">{t('approval.subject')}:</span> <bdi className="font-medium">{item.subject}</bdi></p>}
      <div className="rounded-[6px] border border-line bg-canvas p-4"><GeneratedText text={item.content} language={item.language} /></div>
      {item.status === 'approved' && <ApprovedActions item={item} onDone={onDone} />}
      {item.status === 'sent' && <p className="text-sm text-success-fg">{t('approval.sentBy', { name: item.sent_by_name, date: format.dateTime(item.sent_at) })}</p>}
    </div>
  );
}
