// Module 2: CRM pipeline board per workflow. Drag & drop with pointer or keyboard
// (Space to lift, ←/→ to change column — mirrored in RTL — Space to drop), optimistic move + Undo.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { GripVertical, Plus, Handshake, Trophy } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { patch, toQuery } from '../api.js';
import { Button, Card, Loaded, PageHeader, Tabs, Badge, Table, Dialog, EmptyState, Skeleton, useToast } from '../ui/index.js';
import { NewDealForm } from './company/PipelineTab.jsx';
import { DEAL_STATUSES } from '../../../shared/enums.js';

/** Idle "heat": calm until action is needed. */
function idleTone(days, staleDays) {
  if (days > staleDays) return 'danger';
  if (days > staleDays / 2) return 'signal';
  return 'neutral';
}

function daysSince(iso) {
  return Math.floor((Date.now() - Date.parse(iso)) / 86400000);
}

/** Keyboard: jump one column per arrow press, in visual order (RTL aware). */
function columnCoordinateGetter(stages, dir) {
  return (event, { context: { active, over, droppableRects, collisionRect } }) => {
    const next = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const previous = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.code !== next && event.code !== previous) return undefined;
    event.preventDefault();
    const current = over ? over.id : active && active.data.current.stage;
    const index = stages.indexOf(current) + (event.code === next ? 1 : -1);
    const target = droppableRects.get(stages[Math.max(0, Math.min(stages.length - 1, index))]);
    if (!target || !collisionRect) return undefined;
    return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 48 };
  };
}

function DealCardBody({ deal, staleDays, dragging = false, handleProps = {} }) {
  const { t } = useI18n();
  const format = useFormat();
  const idle = daysSince(deal.last_activity_at);
  return (
    <div className={`rounded-[10px] border border-line bg-surface p-3 shadow-e1 transition-shadow transition-ui ${dragging ? 'rotate-1 shadow-e3 ring-2 ring-focus' : 'hover:shadow-e2'}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...handleProps}
          aria-label={t('pipeline.dragHandle', { name: deal.company_name })}
          className="-ms-1 mt-0.5 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-subtle hover:bg-hover hover:text-fg active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <Link to={`/deals/${deal.id}`} dir="auto" className="block truncate align-parent font-semibold text-fg hover:text-link hover:underline">{deal.company_name}</Link>
          <span dir="auto" className="block truncate align-parent text-[13px] text-muted">{deal.title}</span>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={idleTone(idle, staleDays)}>{t('pipeline.idleDays', { days: idle })}</Badge>
            <span className="tabular text-[13px] text-subtle">{format.usd(deal.expected_value_usd)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraggableDeal({ deal, staleDays }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, data: { stage: deal.stage } });
  return (
    <li ref={setNodeRef} className={isDragging ? 'opacity-40' : ''}>
      <DealCardBody deal={deal} staleDays={staleDays} handleProps={{ ...attributes, ...listeners }} />
    </li>
  );
}

function StageColumn({ stage, deals, staleDays }) {
  const { t } = useI18n();
  const format = useFormat();
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((sum, deal) => sum + deal.expected_value_usd, 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={t(`stage.${stage}`)}
      className={`flex w-64 shrink-0 flex-col rounded-[10px] p-2 transition-colors transition-ui ${isOver ? 'bg-info-soft ring-2 ring-info-line' : 'bg-sunken'}`}
    >
      <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
        <h2 className="text-sm font-semibold text-fg">{t(`stage.${stage}`)}</h2>
        <span className="tabular rounded-full bg-surface px-2 text-xs font-semibold text-muted">{deals.length}</span>
      </header>
      <div className="mb-2 px-1.5 text-[12px] text-subtle tabular">{format.usd(total)}</div>
      <ul className="flex min-h-24 flex-1 flex-col gap-2">
        {deals.map((deal) => <DraggableDeal key={deal.id} deal={deal} staleDays={staleDays} />)}
        {deals.length === 0 && <li className="flex flex-1 items-center justify-center rounded-[6px] border border-dashed border-line-strong p-4 text-center text-[13px] text-subtle">{t('pipeline.dropHere')}</li>}
      </ul>
    </section>
  );
}

function Board({ workflow, staleDays }) {
  const { t, dir } = useI18n();
  const toast = useToast();
  const result = useLoad(`/deals${toQuery({ status: 'open', workflow_id: workflow.id })}`);
  const [overrides, setOverrides] = useState({});
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinateGetter(workflow.stages, dir) }),
  );
  const stageName = (id) => t(`stage.${id}`);

  const deals = useMemo(
    () => (result.data ?? []).map((deal) => (deal.id in overrides ? { ...deal, stage: overrides[deal.id] } : deal)),
    [result.data, overrides],
  );
  const dealName = (id) => deals.find((deal) => deal.id === id).company_name;

  async function moveDeal(deal, toStage, { undoable }) {
    const fromStage = deal.stage;
    setOverrides((current) => ({ ...current, [deal.id]: toStage }));
    const ok = await patch(`/deals/${deal.id}`, { stage: toStage }).then(() => true, (error) => {
      setOverrides((current) => ({ ...current, [deal.id]: fromStage }));
      toast({ tone: 'error', title: t('toast.failed'), body: error.message });
      return false;
    });
    if (ok && undoable) {
      toast({
        title: t('pipeline.moved', { name: deal.company_name, stage: stageName(toStage) }),
        action: { label: t('common.undo'), onClick: () => moveDeal({ ...deal, stage: toStage }, fromStage, { undoable: false }) },
        duration: 6000,
      });
    }
  }

  const announcements = {
    onDragStart: ({ active }) => t('pipeline.a11y.picked', { name: dealName(active.id) }),
    onDragOver: ({ active, over }) => (over ? t('pipeline.a11y.over', { name: dealName(active.id), stage: stageName(over.id) }) : t('pipeline.a11y.noTarget')),
    onDragEnd: ({ active, over }) => (over ? t('pipeline.a11y.dropped', { name: dealName(active.id), stage: stageName(over.id) }) : t('pipeline.a11y.cancelled')),
    onDragCancel: () => t('pipeline.a11y.cancelled'),
  };

  const activeDeal = deals.find((deal) => deal.id === activeId);
  return (
    <Loaded result={result} skeleton={<div className="flex gap-3">{workflow.stages.map((stage) => <Skeleton key={stage} className="h-72 w-64 shrink-0 rounded-[10px]" />)}</div>}>
      {() => (
        <DndContext
          sensors={sensors}
          accessibility={{ announcements, screenReaderInstructions: { draggable: t('pipeline.a11y.instructions') } }}
          onDragStart={({ active }) => setActiveId(active.id)}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={({ active, over }) => {
            setActiveId(null);
            const deal = deals.find((item) => item.id === active.id);
            if (over && over.id !== deal.stage) moveDeal(deal, over.id, { undoable: true });
          }}
        >
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
            {workflow.stages.map((stage) => (
              <StageColumn key={stage} stage={stage} staleDays={staleDays} deals={deals.filter((deal) => deal.stage === stage)} />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(.2,0,0,1)' }}>
            {activeDeal ? <DealCardBody deal={activeDeal} staleDays={staleDays} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </Loaded>
  );
}

function ClosedDeals({ status }) {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/deals?status=${status}`);
  const columns = [
    { key: 'company_name', label: t('company.name'), render: (d) => <Link className="text-link hover:underline" to={`/deals/${d.id}`}><bdi>{d.company_name}</bdi></Link> },
    { key: 'title', label: t('deal.title') },
    { key: 'deal_model', label: t('deal.model'), render: (d) => t(`dealModel.${d.deal_model}`) },
    { key: 'actual_revenue_usd', label: t('deal.actualRevenue'), numeric: true, render: (d) => format.usd(d.actual_revenue_usd) },
    { key: 'closed_at', label: t('deal.closedAt'), render: (d) => format.date(d.closed_at) },
  ];
  return (
    <Card>
      <Loaded result={result}>
        {(rows) => <Table caption={t(`dealStatus.${status}`)} columns={columns} rows={rows} empty={<EmptyState icon={status === 'won' ? Trophy : Handshake} title={t('deal.none')} />} />}
      </Loaded>
    </Card>
  );
}

function NewDealDialog({ open, onClose, workflows, onCreated }) {
  const { t } = useI18n();
  const companies = useLoad(open ? '/companies' : null);
  return (
    <Dialog open={open} onClose={onClose} title={t('deal.add')}>
      <Loaded result={companies}>
        {(rows) => <NewDealForm workflows={workflows} companies={rows} onCreated={() => { onCreated(); onClose(); }} />}
      </Loaded>
    </Dialog>
  );
}

export function PipelinePage() {
  const { t, language } = useI18n();
  const workflows = useLoad('/workflows');
  const settings = useLoad('/settings');
  const [view, setView] = useState(null);
  const [boardVersion, setBoardVersion] = useState(0);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader title={t('nav.pipeline')} subtitle={t('pipeline.subtitle')} actions={<Button icon={Plus} offlineOk onClick={() => setCreating(true)}>{t('deal.add')}</Button>} />
      <Loaded result={workflows}>
        {(rows) => {
          const active = rows.filter((w) => w.active);
          const currentView = view ?? `wf-${active[0].id}`;
          const tabs = [
            ...active.map((w) => ({ key: `wf-${w.id}`, label: language === 'he' ? w.name_he : w.name_en })),
            ...DEAL_STATUSES.filter((s) => s !== 'open').map((s) => ({ key: s, label: t(`dealStatus.${s}`) })),
          ];
          const workflow = active.find((w) => `wf-${w.id}` === currentView);
          const staleDays = Number(settings.data ? settings.data.stale_days : Infinity);
          return (
            <>
              <Tabs tabs={tabs} active={currentView} onChange={setView} label={t('deal.workflow')}>
                {workflow ? <Board key={`${workflow.id}-${boardVersion}`} workflow={workflow} staleDays={staleDays} /> : <ClosedDeals status={currentView} />}
              </Tabs>
              <NewDealDialog open={creating} onClose={() => setCreating(false)} workflows={active} onCreated={() => setBoardVersion((v) => v + 1)} />
            </>
          );
        }}
      </Loaded>
    </>
  );
}
