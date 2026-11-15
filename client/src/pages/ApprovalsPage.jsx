// Human-in-the-loop approval queue. Items that change status animate out of the current list.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Inbox as InboxIcon } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { Card, Loaded, PageHeader, Tabs, Notice, StatusBadge, statusTone, EmptyState, SkeletonRows } from '../ui/index.js';
import { ApprovalEditor } from '../components/ApprovalEditor.jsx';
import { useCounts } from '../app/CountsProvider.jsx';
import { APPROVAL_STATUSES } from '../../../shared/enums.js';

const LEAVE_MS = 260;

function ApprovalCard({ item, onLeave, onReload }) {
  const { t } = useI18n();
  const format = useFormat();
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="collapse-out" data-leaving={leaving}>
      <div>
        <Card
          accent={item.status === 'pending' ? 'signal' : undefined}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={statusTone('approval', item.status)}>{t(`approvalStatus.${item.status}`)}</StatusBadge>
              <span>{t(`approvalKind.${item.kind}`)}</span>
              <span aria-hidden="true" className="text-subtle">·</span>
              <Link className="text-link hover:underline" to={`/companies/${item.company_id}`}><bdi>{item.company_name}</bdi></Link>
              {item.contact_name && <span className="text-sm font-normal text-muted">→ <bdi>{item.contact_name}</bdi></span>}
            </span>
          }
        >
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-subtle">
            <span>{t('approval.createdBy', { name: item.created_by_name, date: format.dateTime(item.created_at) })}</span>
            {item.reviewed_by_name && <span>{t('approval.reviewedBy', { name: item.reviewed_by_name, date: format.dateTime(item.reviewed_at) })}</span>}
            {item.review_note && <span>{t('approval.note')}: <bdi>{item.review_note}</bdi></span>}
            {item.deal_title && <span>{t('meeting.deal')}: <bdi>{item.deal_title}</bdi></span>}
          </div>
          <ApprovalEditor
            item={item}
            onDone={(nextStatus) => {
              const staysHere = nextStatus === item.status;
              if (staysHere) {
                onReload();
                return;
              }
              setLeaving(true);
              window.setTimeout(onLeave, LEAVE_MS);
            }}
          />
        </Card>
      </div>
    </div>
  );
}

export function ApprovalsPage() {
  const { t } = useI18n();
  const { counts } = useCounts();
  const [status, setStatus] = useState('pending');
  const result = useLoad(`/approvals?status=${status}`);
  const tabs = APPROVAL_STATUSES.map((key) => ({ key, label: t(`approvalStatus.${key}`), count: key === 'pending' ? counts.approvals : 0 }));
  return (
    <>
      <PageHeader title={t('nav.approvals')} subtitle={t('approval.subtitle')} />
      <Notice icon={ShieldCheck}>{t('approval.policy')}</Notice>
      <Tabs tabs={tabs} active={status} onChange={setStatus} label={t('nav.approvals')}>
        <Loaded result={result} skeleton={<Card><SkeletonRows rows={8} /></Card>}>
          {(items) => (items.length === 0
            ? <Card><EmptyState icon={InboxIcon} title={t('approval.none')}>{status === 'pending' ? t('approval.noneHint') : null}</EmptyState></Card>
            : (
              <div className="space-y-4">
                {items.map((item) => (
                  <ApprovalCard
                    key={`${item.id}-${item.status}`}
                    item={item}
                    onReload={result.reload}
                    onLeave={result.reload}
                  />
                ))}
              </div>
            ))}
        </Loaded>
      </Tabs>
    </>
  );
}
