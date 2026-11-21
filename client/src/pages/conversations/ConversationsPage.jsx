// Release 4: everyone YMT approached, with what needs the owner now: replies to answer and follow-ups that are due.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessagesSquare, Mail, RefreshCw } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useCounts } from '../../app/CountsProvider.jsx';
import { useGoogleReturn } from '../../hooks/useGoogleReturn.js';
import { Card, Loaded, PageHeader, Tabs, Table, Badge, EmptyState, SkeletonRows, Button, ErrorBox, useToast } from '../../ui/index.js';
import { ReplyClassBadge } from './conversationUi.jsx';
import { CONVERSATION_VIEWS } from '../../../../shared/enums.js';

/** Read-only Gmail: connect once, then the server checks every 15 minutes; "Check now" runs it at once. */
function GmailCard() {
  const { t } = useI18n();
  const format = useFormat();
  const toast = useToast();
  const { refresh } = useCounts();
  const status = useLoad('/google/status');
  const check = useAction(async () => {
    const result = await post('/gmail/sync');
    toast({ title: t('gmail.checked', { added: result.added }) });
    status.reload();
    refresh();
    return result;
  });
  return (
    <Loaded result={status} skeleton={<Card><SkeletonRows rows={2} /></Card>}>
      {(google) => (google.configured ? (
        <Card title={<span className="flex items-center gap-2"><Mail aria-hidden="true" size={18} />{t('gmail.title')}</span>}>
          {google.gmail_read ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">{google.gmail_checked_at ? t('gmail.lastChecked', { email: google.email, date: format.dateTime(google.gmail_checked_at) }) : t('gmail.notChecked', { email: google.email })}</span>
              <Button size="sm" variant="secondary" icon={RefreshCw} loading={check.busy} onClick={() => check.run()}>{t('gmail.checkNow')}</Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted">{t('gmail.help')}</p>
              <a className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-line-strong bg-surface px-3 font-medium hover:bg-hover" href="/api/google/connect?gmail=1">
                <Mail aria-hidden="true" size={16} />{t('gmail.connect')}
              </a>
            </div>
          )}
          {google.gmail_error && <div className="mt-3"><ErrorBox message={google.gmail_error} /></div>}
          <ErrorBox message={check.error} />
        </Card>
      ) : null)}
    </Loaded>
  );
}

export function ConversationsPage() {
  const { t } = useI18n();
  const format = useFormat();
  const { user } = useAuth();
  const [view, setView] = useState('needs_answer');
  const [everyone, setEveryone] = useState(false);
  const result = useLoad(`/conversations?view=${view}${everyone ? '&owner=all' : ''}`);
  const counts = useLoad('/conversations/counts');
  useGoogleReturn();
  const tabCount = { needs_answer: counts.data ? counts.data.needs_answer : 0, followup_due: counts.data ? counts.data.followup_due : 0, all: 0 };
  const columns = [
    { key: 'person', label: t('conversation.person'), render: (row) => (
      <div>
        <Link className="font-medium text-link hover:underline" to={`/conversations/${row.contact_id}`}><bdi>{row.full_name}</bdi></Link>
        <div className="text-[13px] text-subtle"><bdi>{row.company_name}</bdi>{row.job_title && <> · <bdi>{row.job_title}</bdi></>}</div>
      </div>
    ) },
    { key: 'channel', label: t('outreach.channel'), render: (row) => t(`channel.${row.channel}`) },
    { key: 'state', label: t('conversation.state'), render: (row) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {row.opt_out_pending && <Badge tone="danger">{t('conversation.optOutPending')}</Badge>}
        {row.new_replies > 0 && <Badge tone="signal">{t('conversation.newReplies', { count: row.new_replies })}</Badge>}
        {row.followup_due && <Badge tone="info">{t('conversation.followupDue', { number: row.followup.number })}</Badge>}
        {row.opted_out_at && <Badge tone="neutral">{t('contact.optedOut')}</Badge>}
        {!row.needs_answer && !row.followup_due && !row.opted_out_at && <span className="text-[13px] text-subtle">{t(`followupBlocker.${row.followup.blocker ?? 'waiting'}`, { date: format.date(row.followup.due_at) })}</span>}
      </div>
    ) },
    { key: 'last', label: t('conversation.lastReply'), render: (row) => (row.last_reply ? (
      <div className="text-[13px]">
        <ReplyClassBadge value={row.last_reply.classification} />
        {row.last_reply.summary && <div className="mt-1 text-muted"><bdi>{row.last_reply.summary}</bdi></div>}
      </div>
    ) : <span className="text-[13px] text-subtle">{t('conversation.noReply', { date: format.date(row.first_sent_at) })}</span>) },
    ...(everyone ? [{ key: 'owner', label: t('research.owner'), render: (row) => row.owner_name ?? '—' }] : []),
  ];
  return (
    <>
      <PageHeader title={t('nav.conversations')} subtitle={t('conversation.subtitle')} />
      <div className="space-y-6">
        <GmailCard />
        <Tabs tabs={CONVERSATION_VIEWS.map((key) => ({ key, label: t(`conversation.view.${key}`), count: tabCount[key] }))} active={view} onChange={setView} label={t('nav.conversations')}>
          {user.role === 'admin' && (
            <label className="mb-3 flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={everyone} onChange={(event) => setEveryone(event.target.checked)} />
              {t('conversation.everyone')}
            </label>
          )}
          <Card padded={false}>
            <Loaded result={result} skeleton={<div className="p-4"><SkeletonRows rows={6} /></div>}>
              {(rows) => <Table caption={t('nav.conversations')} columns={columns} rows={rows.map((row) => ({ ...row, id: row.contact_id }))} empty={<EmptyState icon={MessagesSquare} title={t(`conversation.empty.${view}`)}>{t('conversation.emptyHint')}</EmptyState>} />}
            </Loaded>
          </Card>
        </Tabs>
      </div>
    </>
  );
}
