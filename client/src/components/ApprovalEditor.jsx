// The human-in-the-loop review surface, used on the Approvals page and inside the draft side sheet.
// Reversible: edit & save. Irreversible (approve, reject, mark as sent): confirmation dialog stating the consequence.

import { useMemo, useState } from 'react';
import { Check, X, Mail, Send, GitCompare, Save, MessageCircle, ExternalLink as ExternalLinkIcon, Scale } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useAction } from '../hooks/useApi.js';
import { patch, post } from '../api.js';
import { Button, ErrorBox, Notice, GeneratedText, useConfirm, useToast } from '../ui/index.js';
import { INPUT_CLASS } from './EntityForm.jsx';
import { CopyButton } from './CopyButton.jsx';
import { useCounts } from '../app/CountsProvider.jsx';
import { lineDiff } from '../lib/lineDiff.js';
import { MESSAGE_KINDS, COLD_KINDS } from '../../../shared/enums.js';
import { sendTarget, whatsappUrl } from '../lib/sendLinks.js';

const FIELD_CLASS = `${INPUT_CLASS} border-line-strong`;
const LINK_BUTTON_CLASS = 'inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-primary px-4 text-sm font-medium text-on-primary shadow-e1 hover:bg-primary-hover sm:min-h-10';

// Where each channel keeps its recipient, and how the field is typed.
const RECIPIENT = {
  email: { field: 'recipient_email', type: 'email' },
  linkedin: { field: 'recipient_linkedin', type: 'url' },
  whatsapp: { field: 'recipient_phone', type: 'tel' },
};

function recipientOf(item) {
  return item[RECIPIENT[item.channel].field];
}

function queryString(params) {
  return new URLSearchParams(params).toString().replace(/\+/g, '%20');
}

function mailtoHref(item) {
  return `mailto:${encodeURIComponent(item.recipient_email)}?${queryString({ subject: item.subject ?? '', body: item.content })}`;
}

/**
 * "Approve & send" (25.11.2026): one click approves the message, records it as sent and opens it in Gmail, WhatsApp or
 * LinkedIn for the person to press Send there. The new tab is opened during the click (browsers block it later) and
 * closed again if the server refuses; a blocked pop-up stops before anything is recorded.
 */
function useApproveAndSend(item, onSent) {
  const { t } = useI18n();
  const confirm = useConfirm();
  return useAction(async () => {
    const ok = await confirm({
      title: t('approval.sendConfirmTitle'),
      body: t(`approval.sendConfirm.${item.channel}`, { recipient: recipientOf(item) }),
      confirmLabel: t('approval.approveAndSend'),
      tone: 'success',
    });
    if (!ok) return;
    const target = sendTarget(item);
    if (target.copy) await navigator.clipboard.writeText(item.content);
    const tab = window.open('', '_blank');
    if (tab === null) throw new Error(t('approval.popupBlocked'));
    await post(`/approvals/${item.id}/approve-and-send`).then(undefined, (error) => {
      tab.close();
      throw error;
    });
    tab.opener = null;
    tab.location.href = target.url;
    onSent(target.copy ? t('toast.sentLinkedin') : t(`toast.sentVia.${item.channel}`));
  });
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
  const isMessage = MESSAGE_KINDS.includes(item.kind);
  const hasSubject = isMessage && item.channel === 'email';
  const recipient = RECIPIENT[item.channel];
  const saved = { subject: item.subject ?? '', content: item.content, recipient: isMessage ? recipientOf(item) ?? '' : '' };
  const [draft, setDraft] = useState(saved);
  const [showChanges, setShowChanges] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const changed = draft.subject !== saved.subject || draft.content !== saved.content || draft.recipient !== saved.recipient;
  const differsFromGenerated = item.original_content !== null && draft.content !== item.original_content;

  const save = useAction(async () => {
    const body = isMessage
      ? { content: draft.content, [recipient.field]: draft.recipient || null, ...(hasSubject ? { subject: draft.subject } : {}) }
      : { content: draft.content };
    await patch(`/approvals/${item.id}`, body);
    complete(t('toast.saved'), 'pending');
  });
  const approve = useAction(async () => {
    const ok = await confirm({
      title: t('approval.confirmApproveTitle'),
      body: isMessage ? t('approval.confirmApproveMessage', { recipient: saved.recipient, channel: t(`channel.${item.channel}`) }) : t('approval.confirmApproveBrief'),
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
  const send = useApproveAndSend(item, (message) => complete(message, 'sent'));

  const missingRecipient = isMessage && !saved.recipient;
  const approveReason = changed ? t('approval.saveBeforeApprove') : missingRecipient ? t('approval.needsRecipient') : undefined;

  return (
    <div className="space-y-4">
      <ErrorBox message={save.error ?? approve.error ?? reject.error ?? send.error} />
      {COLD_KINDS.includes(item.kind) && <Notice icon={Scale}>{t('approval.legalHint')}</Notice>}
      {isMessage && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t(`approval.recipientOf.${item.channel}`)}
            <input type={recipient.type} dir="ltr" className={`${FIELD_CLASS} mt-1.5`} value={draft.recipient} onChange={(e) => setDraft({ ...draft, recipient: e.target.value })} />
          </label>
          {hasSubject && (
            <label className="block text-sm font-medium">{t('approval.subject')}
              <input dir="auto" className={`${FIELD_CLASS} mt-1.5`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </label>
          )}
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
            {isMessage ? (
              <Button variant="success" icon={Send} loading={send.busy} loadingLabel={t('approval.sending')} disabled={approveReason !== undefined} disabledReason={approveReason} onClick={send.run}>
                {t('approval.approveAndSend')}
              </Button>
            ) : (
              <Button variant="success" icon={Check} loading={approve.busy} loadingLabel={t('approval.approving')} disabled={approveReason !== undefined} disabledReason={approveReason} onClick={approve.run}>
                {t('approval.approve')}
              </Button>
            )}
            <Button variant="secondary" icon={Save} loading={save.busy} disabled={!changed} disabledReason={t('approval.nothingToSave')} onClick={save.run}>{t('approval.saveEdits')}</Button>
            <Button variant="ghost" icon={X} className="ms-auto text-danger-fg" offlineOk onClick={() => setRejecting(true)}>{t('approval.reject')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

/** The manual send step per channel: open the message in the person's own app, then confirm it was sent. */
function SendStep({ item }) {
  const { t } = useI18n();
  const text = item.channel === 'email' ? `${item.subject ?? ''}\n\n${item.content}` : item.content;
  const copy = <CopyButton text={text} label={t('approval.copyText')} />;
  if (item.channel === 'email') {
    return (
      <>
        <li><a className={LINK_BUTTON_CLASS} href={mailtoHref(item)}><Mail aria-hidden="true" size={16} />1. {t('approval.openInMail')}</a></li>
        <li>{copy}</li>
      </>
    );
  }
  if (item.channel === 'linkedin') {
    return (
      <>
        <li><CopyButton text={text} label={`1. ${t('approval.copyText')}`} /></li>
        <li><a className={LINK_BUTTON_CLASS} href={item.recipient_linkedin} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon aria-hidden="true" size={16} />2. {t('approval.openLinkedin')}</a></li>
      </>
    );
  }
  return (
    <>
      <li><a className={LINK_BUTTON_CLASS} href={whatsappUrl(item)} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" size={16} />1. {t('approval.openWhatsapp')}</a></li>
      <li>{copy}</li>
    </>
  );
}

function ApprovedActions({ item, onDone }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const complete = useCompletion(onDone);
  const markSent = useAction(async () => {
    const ok = await confirm({
      title: t('approval.confirmSentTitle'),
      body: t('approval.confirmSentMessage', { recipient: recipientOf(item), channel: t(`channel.${item.channel}`) }),
      confirmLabel: t('approval.markSent'),
      tone: 'success',
    });
    if (!ok) return;
    await post(`/approvals/${item.id}/mark-sent`);
    complete(t('toast.markedSent'), 'sent');
  });
  const send = useApproveAndSend(item, (message) => complete(message, 'sent'));
  if (!MESSAGE_KINDS.includes(item.kind)) return <Notice>{t('approval.briefSaved')}</Notice>;
  const lastStep = item.channel === 'linkedin' ? 3 : 2;
  return (
    <div className="space-y-3">
      <ErrorBox message={send.error ?? markSent.error} />
      <Button variant="success" icon={Send} loading={send.busy} loadingLabel={t('approval.sending')} onClick={send.run}>{t('approval.sendNow')}</Button>
      <details className="text-sm">
        <summary className="cursor-pointer text-link">{t('approval.sendManually')}</summary>
        <div className="mt-3 space-y-3">
          <Notice tone="signal" icon={Send}>{t(`approval.manualSend.${item.channel}`)}</Notice>
          <ol className="flex flex-wrap items-center gap-2">
            <SendStep item={item} />
            <li><Button variant="secondary" icon={Send} loading={markSent.busy} onClick={markSent.run}>{lastStep}. {t('approval.markSent')}</Button></li>
          </ol>
        </div>
      </details>
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
      {MESSAGE_KINDS.includes(item.kind) && recipientOf(item) && <p className="text-sm"><span className="text-subtle">{t(`approval.recipientOf.${item.channel}`)}:</span> <bdi dir="ltr">{recipientOf(item)}</bdi></p>}
      {item.subject && <p className="text-sm"><span className="text-subtle">{t('approval.subject')}:</span> <bdi className="font-medium">{item.subject}</bdi></p>}
      <div className="rounded-[6px] border border-line bg-canvas p-4"><GeneratedText text={item.content} language={item.language} /></div>
      {item.status === 'approved' && <ApprovedActions item={item} onDone={onDone} />}
      {item.status === 'sent' && <p className="text-sm text-success-fg">{t('approval.sentBy', { name: item.sent_by_name, date: format.dateTime(item.sent_at) })}</p>}
    </div>
  );
}
