// Owner review queue: evidence-backed cards waiting for Accept / Verify / Defer / Reject.
// Admins also see the manual-assignment queue and can switch to everyone's cards.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ScanSearch, Plus } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { toQuery } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, PageHeader, Tabs, Table, EmptyState, SkeletonRows, Button, Badge } from '../../ui/index.js';
import { useCounts } from '../../app/CountsProvider.jsx';
import { OpportunityStatus, VerdictBadge, FlagBadges, ScoreBadge, useEmployeesText } from './researchUi.jsx';
import { AddOpportunityDialog } from './AddOpportunityDialog.jsx';
import { MyTasks } from './MyTasks.jsx';

// 'tasks' is "My tasks": the owner's open tasks and follow-ups (it replaces the Inbox's task list in the Focused view).
const VIEWS = ['queue', 'tasks', 'manual', 'followup', 'accepted', 'rejected'];

export function ReviewPage() {
  const { t } = useI18n();
  const format = useFormat();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { counts, refresh } = useCounts();
  const isAdmin = user.role === 'admin';
  const [view, setView] = useState('queue');
  const [scope, setScope] = useState('me');
  const [adding, setAdding] = useState(false);
  const employeesText = useEmployeesText();
  const views = VIEWS.filter((key) => key !== 'manual' || isAdmin);
  const result = useLoad(view === 'tasks' ? null : `/research/review${toQuery({ view, owner: view === 'manual' ? '' : scope })}`);
  const myWork = useLoad('/my-work?scope=me'); // the overdue count on the "My tasks" tab

  const columns = [
    { key: 'company_name', label: t('research.company'), render: (card) => (
      <div className="min-w-48">
        <Link className="font-medium text-link hover:underline" to={`/research/cards/${card.id}`}><bdi>{card.company_name}</bdi></Link>
        <div className="mt-0.5 text-[13px] text-subtle"><bdi>{card.business_need}</bdi></div>
      </div>
    ) },
    { key: 'score', label: t('score.title'), render: (card) => (
      <div className="space-y-1">
        <ScoreBadge score={card.score} tier={card.tier} />
        {!card.has_trigger && <div className="text-[13px] text-subtle">{t('score.noTrigger')}</div>}
      </div>
    ) },
    { key: 'mandate_code', label: t('research.mandate'), render: (card) => card.mandate_code ?? '—' },
    { key: 'status', label: t('research.status'), render: (card) => (
      <div className="flex flex-wrap gap-1"><OpportunityStatus status={card.status} /><VerdictBadge verdict={card.verdict} /><FlagBadges flags={card.flags} /></div>
    ) },
    { key: 'target', label: t('research.target'), render: (card) => (
      <div><bdi>{card.target_country}</bdi><div className="text-[13px] text-subtle">{t(`needType.${card.need_type}`)}</div></div>
    ) },
    { key: 'company', label: t('research.classification'), render: (card) => (
      <div className="text-[13px]">
        <div>{card.israel_connection ? t(`israelConnection.${card.israel_connection}`) : '—'}</div>
        <div className="text-subtle">{employeesText(card.employees_min, card.employees_max)}</div>
      </div>
    ) },
    { key: 'evidence_date', label: t('research.evidenceDate'), render: (card) => format.date(card.evidence_date) },
    ...(scope === 'all' || view === 'manual' ? [{ key: 'owner_name', label: t('research.owner'), render: (card) => card.owner_name ?? <Badge tone="signal">{t('research.noOwner')}</Badge> }] : []),
  ];

  const tabCount = (key) => {
    if (key === 'queue') return scope === 'me' ? counts.research : 0;
    if (key === 'tasks') return myWork.data ? myWork.data.overdue : 0;
    return 0;
  };
  const tabs = views.map((key) => ({ key, label: t(`research.view.${key}`), count: tabCount(key) }));
  return (
    <>
      <PageHeader
        title={t('nav.research')}
        subtitle={t('research.reviewSubtitle')}
        actions={(
          <>
            {isAdmin && view !== 'tasks' && (
              <Button variant="ghost" onClick={() => setScope(scope === 'me' ? 'all' : 'me')} aria-pressed={scope === 'all'}>
                {scope === 'me' ? t('research.showAll') : t('research.showMine')}
              </Button>
            )}
            <Button icon={Plus} onClick={() => setAdding(true)}>{t('research.addOpportunity')}</Button>
          </>
        )}
      />
      <Tabs tabs={tabs} active={view} onChange={setView} label={t('nav.research')}>
        {view === 'tasks' ? <MyTasks onChanged={myWork.reload} /> : (
        <Card padded>
          <Loaded result={result} skeleton={<SkeletonRows rows={6} />}>
            {(cards) => (
              <Table
                caption={t(`research.view.${view}`)}
                columns={columns}
                rows={cards}
                empty={<EmptyState icon={ScanSearch} title={t('research.emptyQueue')}>{view === 'queue' ? t('research.emptyQueueHint') : null}</EmptyState>}
              />
            )}
          </Loaded>
        </Card>
        )}
      </Tabs>
      <AddOpportunityDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(card) => {
          setAdding(false);
          refresh();
          navigate(`/research/cards/${card.id}`);
        }}
      />
    </>
  );
}
