// One mandate: settings (admin), current criteria and versions (owner or admin), runs, saved examples and
// before/after calibrations ("change one variable at a time, compare on the same examples").

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, Pencil, Trash2, Scale, CircleCheck, CircleX } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post, patch, del } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import {
  Card, Loaded, PageHeader, DefinitionList, Table, Button, Dialog, ErrorBox, SkeletonRows, StatusBadge, statusTone, Badge,
  useToast, usePrompt, useConfirm,
} from '../../ui/index.js';
import { EntityForm, FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { RunStatus, VerdictBadge, useCost } from './researchUi.jsx';
import { CriteriaForm } from './CriteriaForm.jsx';
import { RunDialog, usePolling } from './MandatesPage.jsx';
import { MANDATE_STATUSES, MANDATE_SCHEDULES, WEEKDAYS } from '../../../../shared/enums.js';

const ACTIVE = ['queued', 'running'];

function SettingsCard({ mandate, onSaved }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const toast = useToast();
  const users = useLoad('/users');
  const lists = useLoad('/watch-lists');
  return (
    <Card title={t('research.settingsTitle')}>
      <Loaded result={users} skeleton={<SkeletonRows rows={4} />}>
        {(list) => (
          <Loaded result={lists} skeleton={<SkeletonRows rows={1} />}>
          {(watchLists) => (
          <EntityForm
            fields={[
              { name: 'name', label: t('criteria.name'), type: 'text', required: true, wide: true },
              { name: 'owner_id', label: t('research.owner'), type: 'select', options: list.filter((u) => u.active).map((u) => ({ value: String(u.id), label: u.display_name })) },
              { name: 'status', label: t('research.status'), type: 'select', required: true, options: options('mandateStatus', MANDATE_STATUSES) },
              { name: 'schedule', label: t('research.schedule'), type: 'select', required: true, options: options('mandateSchedule', MANDATE_SCHEDULES) },
              { name: 'schedule_weekday', label: t('research.weekday'), type: 'select', required: true, options: WEEKDAYS.map((day) => ({ value: String(day), label: t(`weekday.${day}`) })) },
              { name: 'default_batch', label: t('research.defaultBatch'), type: 'number', required: true, min: 1 },
              { name: 'freshness_days', label: t('research.freshnessDays'), type: 'number', required: true, min: 7, help: t('research.freshnessHelp') },
              { name: 'weekly_watch_list_id', label: t('research.weeklySource'), type: 'select', help: t('research.weeklySourceHelp'),
                options: watchLists.filter((w) => w.entry_count > 0).map((w) => ({ value: String(w.id), label: w.name })) },
            ]}
            initial={mandate}
            onSubmit={async (values) => {
              await patch(`/mandates/${mandate.id}`, {
                ...values,
                owner_id: values.owner_id === null ? null : Number(values.owner_id),
                schedule_weekday: Number(values.schedule_weekday),
                weekly_watch_list_id: values.weekly_watch_list_id === null ? null : Number(values.weekly_watch_list_id),
              });
              toast({ title: t('toast.saved') });
              onSaved();
            }}
          />
          )}
          </Loaded>
        )}
      </Loaded>
    </Card>
  );
}

function CriteriaCard({ mandate, canEdit, onEdit }) {
  const { t } = useI18n();
  const format = useFormat();
  const v = mandate.version;
  const range = (min, max, money) => {
    if (min === null && max === null) return t('research.anySize');
    const show = (value) => (money ? format.usd(value) : format.number(value));
    return `${min === null ? '0' : show(min)}–${max === null ? '∞' : show(max)}`;
  };
  return (
    <Card
      title={t('research.criteriaTitle', { version: v.version })}
      actions={canEdit ? <Button size="sm" icon={Pencil} onClick={onEdit}>{t('research.editCriteria')}</Button> : null}
    >
      <DefinitionList items={[
        [t('criteria.target_countries'), v.target_countries.join(', ')],
        [t('criteria.need_types'), v.need_types.map((need) => t(`needType.${need}`)).join(', ')],
        [t('criteria.accept_rule'), v.accept_rule],
        [t('criteria.false_positives'), v.false_positives.join(' · ') || null],
        [t('research.preferredEmployees'), range(v.employees_min, v.employees_max, false)],
        [t('research.preferredRevenue'), range(v.revenue_min_usd, v.revenue_max_usd, true)],
        [t('criteria.sectors'), v.sectors.length ? v.sectors.map((sector) => t(`sector.${sector}`)).join(', ') : t('research.anySector')],
        [t('criteria.search_terms'), v.search_terms.join(', ') || null],
        [t('criteria.exclusions'), v.exclusions.join(', ') || null],
        [t('criteria.proposed_service'), v.proposed_service],
      ]} />
    </Card>
  );
}

function CalibrationCard({ mandate, canEdit, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const cost = useCost();
  const toast = useToast();
  const prompt = usePrompt();
  const confirm = useConfirm();
  // Defaults follow the data (newest vs the one before) until the owner picks something, so a newly saved
  // version is preselected without a page reload.
  const [fromChoice, setFromId] = useState('');
  const [toChoice, setToId] = useState('');
  const fromId = fromChoice || (mandate.versions.length > 1 ? String(mandate.versions[1].id) : '');
  const toId = toChoice || String(mandate.versions[0].id);
  const versionOptions = mandate.versions.map((v) => ({ value: String(v.id), label: `v${v.version} · ${v.change_note}` }));
  const compare = useAction(async () => {
    await post(`/mandates/${mandate.id}/calibrations`, { from_version_id: Number(fromId), to_version_id: Number(toId) });
    toast({ title: t('research.calibrationQueued') });
    onChanged();
  });
  const removeExample = useAction(async (example) => {
    const ok = await confirm({ title: t('research.removeExample'), body: t('research.removeExampleBody', { name: example.company_name }), confirmLabel: t('research.removeExample'), tone: 'danger' });
    if (!ok) return;
    await del(`/mandates/${mandate.id}/examples/${example.id}`);
    onChanged();
  });
  const addNote = useAction(async (calibration) => {
    const note = await prompt({ title: t('research.tuningNote'), label: t('research.tuningNoteLabel'), confirmLabel: t('common.save') });
    if (note === null) return;
    await patch(`/calibrations/${calibration.id}`, { owner_note: note });
    onChanged();
  });
  const correctIcon = (ok) => (ok
    ? <span className="inline-flex items-center gap-1 text-success-fg"><CircleCheck aria-hidden="true" size={15} />{t('research.correct')}</span>
    : <span className="inline-flex items-center gap-1 text-danger-fg"><CircleX aria-hidden="true" size={15} />{t('research.incorrect')}</span>);
  const side = (result) => (
    <div className="flex flex-col items-start gap-1">
      <VerdictBadge verdict={result.verdict} />
      <span className="text-[13px] text-subtle">{result.inScope ? t('research.inScope') : t('research.outOfScope')}</span>
      {correctIcon(result.correct)}
    </div>
  );

  return (
    <Card title={<span className="flex items-center gap-2"><Scale aria-hidden="true" size={18} />{t('research.calibrationTitle')}</span>}>
      <p className="mb-4 text-sm text-muted">{t('research.calibrationHint')}</p>
      <h3 className="mb-2 text-sm font-semibold text-fg">{t('research.examples')}</h3>
      {mandate.examples.length === 0
        ? <p className="mb-4 text-sm text-subtle">{t('research.noExamples')}</p>
        : (
          <ul className="mb-4 space-y-2 text-sm">
            {mandate.examples.map((example) => (
              <li key={example.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={example.label === 'good' ? 'success' : 'danger'}>{t(`exampleLabel.${example.label}`)}</Badge>
                <Link className="text-link hover:underline" to={`/research/cards/${example.opportunity_id}`}><bdi>{example.company_name}</bdi></Link>
                <span className="text-subtle"><bdi>{example.business_need}</bdi></span>
                {canEdit && <Button variant="ghost" size="sm" icon={Trash2} onClick={() => removeExample.run(example)}>{t('research.removeExample')}</Button>}
              </li>
            ))}
          </ul>
        )}
      {canEdit && mandate.versions.length > 1 && mandate.examples.length > 0 && (
        <form className="mb-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); compare.run(); }}>
          <FieldRow field={{ name: 'from', label: t('research.fromVersion'), required: true }} inputId="cal-from">
            <FieldInput field={{ name: 'from', type: 'select', required: true, options: versionOptions }} inputId="cal-from" value={fromId} onChange={setFromId} />
          </FieldRow>
          <FieldRow field={{ name: 'to', label: t('research.toVersion'), required: true }} inputId="cal-to">
            <FieldInput field={{ name: 'to', type: 'select', required: true, options: versionOptions }} inputId="cal-to" value={toId} onChange={setToId} />
          </FieldRow>
          <Button type="submit" icon={Scale} loading={compare.busy} disabled={fromId === '' || fromId === toId} disabledReason={t('research.chooseTwoVersions')}>{t('research.compare')}</Button>
        </form>
      )}
      {compare.error && <ErrorBox message={compare.error} />}
      {mandate.calibrations.map((calibration) => {
        const before = calibration.rows.filter((row) => row.before.correct).length;
        const after = calibration.rows.filter((row) => row.after.correct).length;
        return (
          <section key={calibration.id} className="mt-4 rounded-[8px] border border-line p-4" aria-label={t('research.comparison', { from: calibration.from_version, to: calibration.to_version })}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{t('research.comparison', { from: calibration.from_version, to: calibration.to_version })}</span>
              <RunStatus status={calibration.status} />
              <span className="text-subtle">{format.dateTime(calibration.created_at)} · {cost(calibration.cost_usd)}</span>
              {calibration.status === 'done' && <span className="tabular">{t('research.correctSummary', { before, after, total: calibration.rows.length })}</span>}
            </div>
            {calibration.error && <ErrorBox message={calibration.error} />}
            {calibration.status === 'done' && (
              <Table
                caption={t('research.comparison', { from: calibration.from_version, to: calibration.to_version })}
                rowKey="opportunity_id"
                columns={[
                  { key: 'company', label: t('research.company'), render: (row) => <div><bdi>{row.company}</bdi><div><Badge tone={row.label === 'good' ? 'success' : 'danger'}>{t(`exampleLabel.${row.label}`)}</Badge></div></div> },
                  { key: 'before', label: t('research.before', { version: calibration.from_version }), render: (row) => side(row.before) },
                  { key: 'after', label: t('research.after', { version: calibration.to_version }), render: (row) => side(row.after) },
                ]}
                rows={calibration.rows}
                empty={t('research.noExamples')}
              />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {calibration.owner_note && <span><strong>{t('research.tuningNote')}:</strong> <bdi>{calibration.owner_note}</bdi></span>}
              {canEdit && calibration.status === 'done' && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => addNote.run(calibration)}>{t('research.tuningNote')}</Button>}
            </div>
          </section>
        );
      })}
    </Card>
  );
}

export function MandatePage() {
  const { id } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const cost = useCost();
  const toast = useToast();
  const { user } = useAuth();
  const result = useLoad(`/mandates/${id}`);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const active = Boolean(result.data && (result.data.runs.some((r) => ACTIVE.includes(r.status)) || result.data.calibrations.some((c) => ACTIVE.includes(c.status))));
  usePolling(result, active);

  return (
    <Loaded result={result} skeleton={<Card><SkeletonRows rows={10} /></Card>}>
      {(mandate) => {
        const isAdmin = user.role === 'admin';
        const canEdit = isAdmin || mandate.owner_id === user.id;
        const runColumns = [
          { key: 'created_at', label: t('research.runAt'), render: (r) => (
            <div>
              {format.dateTime(r.created_at)}
              <div className="text-[13px] text-subtle">{t(`runTrigger.${r.trigger}`)} · v{r.version} · {r.requested_by_name ?? t('research.schedule')}</div>
              <div className="text-[13px] text-subtle">{r.watch_list_name ? t('research.checkedFromList', { count: r.companies_checked, name: r.watch_list_name }) : t('research.openSearch')}</div>
            </div>
          ) },
          { key: 'status', label: t('research.status'), render: (r) => <div className="flex flex-col items-start gap-1"><RunStatus status={r.status} />{r.error && <span className="text-[13px] text-danger-fg"><bdi>{r.error}</bdi></span>}</div> },
          { key: 'batch_size', label: t('research.batch'), numeric: true },
          { key: 'cards_created', label: t('research.cards'), numeric: true },
          { key: 'duplicates', label: t('research.duplicates'), numeric: true },
          { key: 'filtered', label: t('research.filtered'), numeric: true },
          { key: 'cost_usd', label: t('research.cost'), render: (r) => cost(r.cost_usd) },
        ];
        return (
          <>
            <PageHeader
              eyebrow={<Link className="text-link hover:underline" to="/research/mandates">{t('nav.mandates')}</Link>}
              title={`${mandate.code} · ${mandate.name}`}
              subtitle={(
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone('mandate', mandate.status)}>{t(`mandateStatus.${mandate.status}`)}</StatusBadge>
                  <span>{mandate.owner_name ?? t('research.noOwner')}</span>
                  <span>· {mandate.schedule === 'weekly' ? t('research.weeklyOn', { day: t(`weekday.${mandate.schedule_weekday}`) }) : t('mandateSchedule.off')}</span>
                </span>
              )}
              actions={canEdit ? (
                <Button icon={Play} disabled={mandate.owner_id === null} disabledReason={t('research.needsOwner')} onClick={() => setRunning(true)}>{t('research.run')}</Button>
              ) : null}
            />
            <div className="space-y-6">
              <CriteriaCard mandate={mandate} canEdit={canEdit} onEdit={() => setEditing(true)} />
              <Card title={t('research.runsTitle')} padded>
                <Table caption={t('research.runsTitle')} columns={runColumns} rows={mandate.runs} empty={t('research.noRuns')} />
              </Card>
              <CalibrationCard mandate={mandate} canEdit={canEdit} onChanged={result.reload} />
              {isAdmin && <SettingsCard mandate={mandate} onSaved={result.reload} />}
              <Card title={t('research.versionsTitle')} padded>
                <Table
                  caption={t('research.versionsTitle')}
                  columns={[
                    { key: 'version', label: t('research.version'), render: (v) => `v${v.version}` },
                    { key: 'change_note', label: t('criteria.change_note') },
                    { key: 'created_by_name', label: t('research.changedBy'), render: (v) => v.created_by_name ?? t('research.systemUser') },
                    { key: 'created_at', label: t('common.created'), render: (v) => format.dateTime(v.created_at) },
                  ]}
                  rows={mandate.versions}
                  empty={t('research.noRuns')}
                />
              </Card>
            </div>
            {running && (
              <RunDialog
                mandate={mandate}
                onClose={() => setRunning(false)}
                onQueued={() => {
                  setRunning(false);
                  toast({ title: t('research.runQueued') });
                  result.reload();
                }}
              />
            )}
            <Dialog open={editing} onClose={() => setEditing(false)} title={t('research.editCriteria')} description={t('research.editCriteriaHint')} width="max-w-3xl">
              {editing && (
                <CriteriaForm
                  mode="version"
                  initial={mandate.version}
                  onCancel={() => setEditing(false)}
                  onSubmit={async (payload) => {
                    await post(`/mandates/${mandate.id}/versions`, payload);
                    setEditing(false);
                    toast({ title: t('research.versionSaved') });
                    result.reload();
                  }}
                />
              )}
            </Dialog>
          </>
        );
      }}
    </Loaded>
  );
}
