// Mandates: who owns each search, its status and schedule, the last run, and a Run button.
// Admins create mandates and manage AI settings (monthly cap, provider and model per task, prices).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Target, Bot } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post, patch, api } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, PageHeader, Table, Button, Dialog, Notice, ErrorBox, SkeletonRows, EmptyState, StatusBadge, statusTone, Badge, useToast } from '../../ui/index.js';
import { EntityForm, FieldRow, FieldInput, INPUT_CLASS } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { BudgetBar, RunStatus, useCost } from './researchUi.jsx';
import { CriteriaForm } from './CriteriaForm.jsx';
import { AI_TASKS, MAX_RUN_BATCH } from '../../../../shared/enums.js';

const POLL_MS = 5000;
const ACTIVE_RUN = ['queued', 'running'];

/** Reload `result` every few seconds while `active` is true (runs in progress). */
export function usePolling(result, active) {
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(result.reload, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, result.reload]);
}

/** How many cards and from which source: the form of one agent run (in the agent's dialog and on the lead-flow board). */
export function RunForm({ mandate, onQueued, onCancel }) {
  const { t } = useI18n();
  const [size, setSize] = useState(String(mandate.default_batch));
  const [listId, setListId] = useState('');
  const lists = useLoad('/watch-lists');
  const run = useAction(async () => onQueued(await post(`/mandates/${mandate.id}/runs`, { batch_size: Number(size), watch_list_id: listId === '' ? null : Number(listId) })));
  const valid = Number.isInteger(Number(size)) && Number(size) >= 1 && Number(size) <= MAX_RUN_BATCH;
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); run.run(); }}>
      <FieldRow field={{ name: 'batch', label: t('research.batchSize', { max: MAX_RUN_BATCH }), required: true }} inputId="run-batch">
        <FieldInput field={{ name: 'batch', type: 'number', required: true, min: 1 }} inputId="run-batch" value={size} onChange={setSize} />
      </FieldRow>
      <FieldRow field={{ name: 'source', label: t('research.searchSource'), help: t('research.searchSourceHelp') }} inputId="run-source" errorId="run-source-hint">
        <select id="run-source" aria-describedby="run-source-hint" className={`${INPUT_CLASS} border-line-strong`} value={listId} onChange={(event) => setListId(event.target.value)}>
          <option value="">{t('research.openSearch')}</option>
          {(lists.data ?? []).filter((list) => list.entry_count > 0).map((list) => (
            <option key={list.id} value={String(list.id)}>{t('research.watchListOption', { name: list.name, count: list.entry_count })}</option>
          ))}
        </select>
      </FieldRow>
      {run.error && <ErrorBox message={run.error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={Play} loading={run.busy} disabled={!valid} disabledReason={t('research.batchInvalid', { max: MAX_RUN_BATCH })}>{t('research.runNow')}</Button>
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export function RunDialog({ mandate, onClose, onQueued }) {
  const { t } = useI18n();
  return (
    <Dialog open onClose={onClose} title={t('research.runTitle', { code: mandate.code })} description={t('research.runHint')}>
      <RunForm mandate={mandate} onQueued={onQueued} onCancel={onClose} />
    </Dialog>
  );
}

function AiSettingsCard({ ai, onChanged }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const toast = useToast();
  const taskFields = AI_TASKS.flatMap((task) => [
    { name: `${task}_provider`, label: t('ai.provider', { task: t(`aiTask.${task}`) }), type: 'select', required: true, options: options('aiProvider', ['claude', 'openai']) },
    { name: `${task}_model`, label: t('ai.model', { task: t(`aiTask.${task}`) }), type: 'text', required: true },
  ]);
  const settingsFields = [{ name: 'ai_monthly_cap_usd', label: t('ai.cap'), type: 'number', required: true, min: 1, help: t('ai.capHelp') }, ...taskFields];
  const initial = { ai_monthly_cap_usd: ai.budget.cap, ...Object.fromEntries(AI_TASKS.flatMap((task) => [[`${task}_provider`, ai.tasks[task].provider], [`${task}_model`, ai.tasks[task].model]])) };
  const priceFields = [
    { name: 'model', label: t('ai.priceModel'), type: 'text', required: true, wide: true },
    { name: 'input', label: t('ai.priceInput'), type: 'number', required: true },
    { name: 'output', label: t('ai.priceOutput'), type: 'number', required: true },
    { name: 'cache_read', label: t('ai.priceCacheRead'), type: 'number', required: true },
    { name: 'search', label: t('ai.priceSearch'), type: 'number', required: true },
  ];
  const priceRows = Object.entries(ai.prices).map(([model, price]) => ({ model, ...price }));
  return (
    <Card title={<span className="flex items-center gap-2"><Bot aria-hidden="true" size={18} />{t('ai.title')}</span>}>
      <EntityForm
        fields={settingsFields}
        initial={initial}
        onSubmit={async (values) => {
          onChanged(await patch('/research/ai', values));
          toast({ title: t('toast.saved') });
        }}
      />
      <h3 className="mb-2 mt-6 text-sm font-semibold text-fg">{t('ai.prices')}</h3>
      <Table
        caption={t('ai.prices')}
        rowKey="model"
        columns={[
          { key: 'model', label: t('ai.priceModel'), render: (row) => <code dir="ltr">{row.model}</code> },
          { key: 'input', label: t('ai.priceInput'), numeric: true },
          { key: 'output', label: t('ai.priceOutput'), numeric: true },
          { key: 'cache_read', label: t('ai.priceCacheRead'), numeric: true },
          { key: 'search', label: t('ai.priceSearch'), numeric: true },
        ]}
        rows={priceRows}
        empty={t('ai.noPrices')}
      />
      <h3 className="mb-2 mt-6 text-sm font-semibold text-fg">{t('ai.addPrice')}</h3>
      <EntityForm
        fields={priceFields}
        resetOnSuccess
        submitLabel={t('ai.savePrice')}
        onSubmit={async ({ model, ...price }) => {
          onChanged(await api('PUT', `/research/ai/prices/${encodeURIComponent(model)}`, price));
          toast({ title: t('toast.saved') });
        }}
      />
    </Card>
  );
}

export function MandatesPage() {
  const { t } = useI18n();
  const format = useFormat();
  const cost = useCost();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const mandates = useLoad('/mandates');
  const ai = useLoad('/research/ai');
  const [running, setRunning] = useState(null);
  const [creating, setCreating] = useState(false);
  usePolling(mandates, Boolean(mandates.data && mandates.data.some((m) => m.last_run && ACTIVE_RUN.includes(m.last_run.status))));

  const columns = [
    { key: 'code', label: t('research.mandate'), render: (m) => (
      <div className="min-w-48">
        <Link className="font-semibold text-link hover:underline" to={`/research/mandates/${m.id}`}>{m.code}</Link>
        <div className="text-[13px] text-subtle"><bdi>{m.name}</bdi></div>
      </div>
    ) },
    { key: 'owner_name', label: t('research.owner'), render: (m) => m.owner_name ?? <Badge tone="signal">{t('research.noOwner')}</Badge> },
    { key: 'status', label: t('research.status'), render: (m) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone={statusTone('mandate', m.status)}>{t(`mandateStatus.${m.status}`)}</StatusBadge>
        <span className="text-[13px] text-subtle">{m.schedule === 'weekly' ? t('research.weeklyOn', { day: t(`weekday.${m.schedule_weekday}`) }) : t('mandateSchedule.off')}</span>
      </div>
    ) },
    { key: 'pending_cards', label: t('research.pending'), numeric: true },
    { key: 'last_run', label: t('research.lastRun'), render: (m) => (m.last_run ? (
      <div className="flex flex-col items-start gap-1">
        <RunStatus status={m.last_run.status} />
        <span className="text-[13px] text-subtle">{format.dateTime(m.last_run.created_at)} · {t('research.cardsCount', { count: m.last_run.cards_created })} · {cost(m.last_run.cost_usd)}</span>
      </div>
    ) : '—') },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (m) => {
      const canRun = isAdmin || m.owner_id === user.id;
      if (!canRun) return null;
      return (
        <Button size="sm" icon={Play} disabled={m.owner_id === null} disabledReason={t('research.needsOwner')} onClick={() => setRunning(m)}>
          {t('research.run')}
        </Button>
      );
    } },
  ];

  return (
    <>
      <PageHeader
        title={t('nav.mandates')}
        subtitle={t('research.mandatesSubtitle')}
        actions={isAdmin ? <Button icon={Plus} onClick={() => setCreating(true)}>{t('research.newMandate')}</Button> : null}
      />
      <Loaded result={ai} skeleton={null}>
        {(status) => (
          <>
            {Object.values(status.problems).some(Boolean) && <Notice tone="signal">{t('research.aiNotReady', { problem: Object.values(status.problems).find(Boolean) })}</Notice>}
            <Card className="mb-6"><BudgetBar budget={status.budget} /></Card>
          </>
        )}
      </Loaded>
      <Card padded>
        <Loaded result={mandates} skeleton={<SkeletonRows rows={7} />}>
          {(list) => <Table caption={t('nav.mandates')} columns={columns} rows={list} empty={<EmptyState icon={Target} title={t('research.noMandates')} />} />}
        </Loaded>
      </Card>
      {isAdmin && ai.data && <div className="mt-6"><AiSettingsCard ai={ai.data} onChanged={() => ai.reload()} /></div>}
      {running && (
        <RunDialog
          mandate={running}
          onClose={() => setRunning(null)}
          onQueued={() => {
            setRunning(null);
            toast({ title: t('research.runQueued') });
            mandates.reload();
          }}
        />
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title={t('research.newMandate')} width="max-w-3xl">
        {creating && (
          <CriteriaForm
            mode="create"
            initial={{}}
            onCancel={() => setCreating(false)}
            onSubmit={async (payload) => {
              await post('/mandates', payload);
              setCreating(false);
              toast({ title: t('toast.saved') });
              mandates.reload();
            }}
          />
        )}
      </Dialog>
    </>
  );
}
