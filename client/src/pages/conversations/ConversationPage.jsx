// Release 4: the conversation with one person. Messages we sent and replies we received in time order; each reply shows
// the AI's reading (kind, summary, what is missing → task) and the drafted answer, which goes through the same
// approval editor as every other message. Opt-outs found in a reply wait for the owner's decision.

import { Link, useParams } from 'react-router-dom';
import { Sparkles, PenLine, Check, Ban, RotateCcw, Inbox as InboxIcon, Send, ListTodo } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { useCounts } from '../../app/CountsProvider.jsx';
import { Card, Loaded, PageHeader, Badge, StatusBadge, statusTone, Button, ErrorBox, Notice, SkeletonRows, GeneratedText, useConfirm, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { ApprovalEditor } from '../../components/ApprovalEditor.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { ReplyClassBadge } from './conversationUi.jsx';
import { OUTREACH_CHANNELS } from '../../../../shared/enums.js';

const OPEN_STATUSES = ['pending', 'approved'];

function OutboundItem({ item, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <li className="rounded-[8px] border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Send aria-hidden="true" size={15} className="text-subtle" />
        <span className="font-medium">{t(`approvalKind.${item.kind}`)}</span>
        <Badge tone="neutral">{t(`channel.${item.channel}`)}</Badge>
        <StatusBadge tone={statusTone('approval', item.status)}>{t(`approvalStatus.${item.status}`)}</StatusBadge>
        <span className="text-[13px] text-subtle">{format.dateTime(item.sent_at ?? item.created_at)}</span>
        {item.review_note && <span className="text-[13px] text-subtle">· <bdi>{item.review_note}</bdi></span>}
      </div>
      {OPEN_STATUSES.includes(item.status) ? <ApprovalEditor item={item} onDone={onChanged} /> : (
        <details>
          <summary className="cursor-pointer text-[13px] text-link">{t('conversation.showText')}</summary>
          <div className="mt-2 rounded-[6px] border border-line bg-canvas p-3">
            {item.subject && <p className="mb-2 text-sm font-medium"><bdi>{item.subject}</bdi></p>}
            <GeneratedText text={item.content} language={item.language} />
          </div>
        </details>
      )}
    </li>
  );
}

function ReplyItem({ reply, contactName, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const confirm = useConfirm();
  const toast = useToast();
  const { refresh } = useCounts();
  const done = (title) => {
    toast({ title });
    refresh();
    onChanged();
  };
  const analyse = useAction(async () => {
    await post(`/replies/${reply.id}/analyze`);
    onChanged();
  });
  const decide = useAction(async (decision) => {
    if (decision === 'confirm') {
      const ok = await confirm({ title: t('reply.confirmOptOutTitle', { name: contactName }), body: t('contact.optOutBody'), confirmLabel: t('reply.confirmOptOut'), tone: 'danger' });
      if (!ok) return;
    }
    await post(`/replies/${reply.id}/opt-out`, { decision });
    done(decision === 'confirm' ? t('contact.optedOutToast') : t('reply.optOutDismissed'));
  });
  const handled = useAction(async () => {
    await post(`/replies/${reply.id}/handled`);
    done(t('reply.handledToast'));
  });
  return (
    <li className={`rounded-[8px] border p-3 ${reply.status === 'new' ? 'border-signal' : 'border-line'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <InboxIcon aria-hidden="true" size={15} className="text-subtle" />
        <span className="font-medium"><bdi>{contactName}</bdi></span>
        <Badge tone="neutral">{t(`channel.${reply.channel}`)}</Badge>
        <span className="text-[13px] text-subtle">{t(`replySource.${reply.source}`)} · {format.dateTime(reply.received_at)}</span>
        <ReplyClassBadge value={reply.classification} />
        {reply.status === 'handled' && <StatusBadge tone="success">{t('reply.handled')}</StatusBadge>}
      </div>
      {reply.subject && <p className="mb-1 text-sm font-medium"><bdi>{reply.subject}</bdi></p>}
      <p dir="auto" className="whitespace-pre-wrap rounded-[6px] bg-sunken p-3 text-sm leading-relaxed">{reply.body}</p>
      {reply.summary && <p className="mt-2 text-sm"><span className="text-subtle">{t('reply.summary')}:</span> <bdi>{reply.summary}</bdi></p>}
      {reply.missing.length > 0 && (
        <div className="mt-2 text-sm">
          <p className="flex items-center gap-1.5 text-subtle"><ListTodo aria-hidden="true" size={15} />{t('reply.missing')}</p>
          <ul className="ms-6 list-disc">{reply.missing.map((item) => <li key={item}><bdi>{item}</bdi></li>)}</ul>
        </div>
      )}
      {reply.analysis_error && (
        <div className="mt-2 space-y-2">
          <ErrorBox message={t('reply.analysisFailed', { error: reply.analysis_error })} />
          <Button size="sm" variant="secondary" icon={RotateCcw} loading={analyse.busy} loadingLabel={t('reply.analysing')} onClick={() => analyse.run()}>{t('reply.analyseAgain')}</Button>
        </div>
      )}
      {reply.opt_out_state === 'pending' && (
        <div className="mt-3 rounded-[8px] border border-danger-fg bg-danger-soft p-3 text-sm">
          <p className="mb-2 font-medium text-danger-fg">{t('reply.optOutQuestion')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" icon={Ban} loading={decide.busy} onClick={() => decide.run('confirm')}>{t('reply.confirmOptOut')}</Button>
            <Button size="sm" variant="secondary" loading={decide.busy} onClick={() => decide.run('dismiss')}>{t('reply.notOptOut')}</Button>
          </div>
        </div>
      )}
      {reply.opt_out_state === 'confirmed' && <p className="mt-2 text-sm text-danger-fg">{t('reply.optOutConfirmed')}</p>}
      {reply.status === 'new' && reply.opt_out_state !== 'pending' && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" icon={Check} loading={handled.busy} onClick={() => handled.run()}>{t('reply.markHandled')}</Button>
        </div>
      )}
      <ErrorBox message={analyse.error ?? decide.error ?? handled.error} />
    </li>
  );
}

function AddReplyCard({ conversation, onAdded }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const { refresh } = useCounts();
  return (
    <Card title={t('reply.addTitle')}>
      <p className="mb-3 text-[13px] text-subtle">{t('reply.addHint')}</p>
      <EntityForm
        columns={1}
        fields={[
          { name: 'channel', label: t('outreach.channel'), type: 'select', required: true, options: options('channel', OUTREACH_CHANNELS) },
          { name: 'received_at', label: t('reply.receivedAt'), type: 'datetime', required: true },
          { name: 'body', label: t('reply.text'), type: 'textarea', required: true },
        ]}
        initial={{ channel: conversation.channel, received_at: new Date().toISOString() }}
        resetOnSuccess
        submitLabel={t('reply.save')}
        submittingLabel={t('reply.analysing')}
        successMessage={t('reply.saved')}
        onSubmit={async (values) => {
          const reply = await post(`/conversations/${conversation.contact.id}/replies`, values);
          refresh();
          onAdded();
          return reply;
        }}
      />
    </Card>
  );
}

function FollowupCard({ conversation, onDrafted }) {
  const { t } = useI18n();
  const format = useFormat();
  const { refresh } = useCounts();
  const { followup } = conversation;
  const draft = useAction(async (mode) => {
    await post(`/conversations/${conversation.contact.id}/followup`, { mode });
    refresh();
    onDrafted();
  });
  const blocked = conversation.contact.channel_problem;
  return (
    <Card title={t('approachFollowup.title')}>
      <p className="mb-3 text-sm text-muted">
        {followup.due ? t('approachFollowup.due', { number: followup.number, max: followup.max }) : t(`followupBlocker.${followup.blocker ?? 'waiting'}`, { date: format.date(followup.due_at) })}
      </p>
      {followup.due && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Sparkles} loading={draft.busy} loadingLabel={t('outreach.drafting')} disabled={blocked !== null || conversation.ai_problem !== null}
            disabledReason={blocked ? t(`outreachBlock.${blocked}`) : conversation.ai_problem} onClick={() => draft.run('ai')}>{t('approachFollowup.draftWithAi')}</Button>
          <Button size="sm" variant="secondary" icon={PenLine} disabled={blocked !== null || draft.busy} disabledReason={blocked ? t(`outreachBlock.${blocked}`) : undefined} onClick={() => draft.run('blank')}>{t('outreach.writeMyself')}</Button>
        </div>
      )}
      <ErrorBox message={draft.error} />
    </Card>
  );
}

export function ConversationPage() {
  const { contactId } = useParams();
  const { t } = useI18n();
  const result = useLoad(`/conversations/${contactId}`);
  return (
    <Loaded result={result} skeleton={<Card><SkeletonRows rows={8} /></Card>}>
      {(conversation) => {
        const items = [
          ...conversation.messages.map((message) => ({ key: `m${message.id}`, at: message.sent_at ?? message.created_at, message })),
          ...conversation.replies.map((reply) => ({ key: `r${reply.id}`, at: reply.received_at, reply })),
        ].sort((a, b) => a.at.localeCompare(b.at));
        return (
          <>
            <PageHeader
              eyebrow={<Link className="text-link hover:underline" to="/conversations">{t('nav.conversations')}</Link>}
              title={conversation.contact.full_name}
              subtitle={(
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {conversation.contact.job_title && <bdi>{conversation.contact.job_title}</bdi>}
                  <Link className="text-link hover:underline" to={`/companies/${conversation.company.id}`}><bdi>{conversation.company.name}</bdi></Link>
                  <Link className="text-link hover:underline" to={`/research/cards/${conversation.opportunity_id}`}>{t('research.openCard')}</Link>
                </span>
              )}
            />
            {conversation.opt_out_pending && <div className="mb-6"><Notice tone="signal" icon={Ban}>{t('conversation.optOutNotice')}</Notice></div>}
            {conversation.contact.opted_out_at && <div className="mb-6"><Notice icon={Ban}>{t('conversation.optedOutNotice')}</Notice></div>}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Card title={t('conversation.thread')}>
                  <ul className="space-y-3">
                    {items.map((entry) => (entry.message
                      ? <OutboundItem key={`${entry.key}-${entry.message.status}`} item={entry.message} onChanged={result.reload} />
                      : <ReplyItem key={entry.key} reply={entry.reply} contactName={conversation.contact.full_name} onChanged={result.reload} />))}
                  </ul>
                </Card>
              </div>
              <div className="space-y-6">
                <AddReplyCard conversation={conversation} onAdded={result.reload} />
                <FollowupCard conversation={conversation} onDrafted={result.reload} />
              </div>
            </div>
          </>
        );
      }}
    </Loaded>
  );
}
