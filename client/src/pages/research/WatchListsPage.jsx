// Watch lists: company lists imported from public sources. A mandate run can check these companies instead of
// searching the open web; checks rotate so repeated runs work through the whole list. Chosen companies can also be
// sent to Research review as cards (built from the card columns their file carried).

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Upload, Trash2, Search, Send, FileCheck2, Ban } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { del, post } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, PageHeader, Table, Button, SkeletonRows, EmptyState, ExternalLink, ErrorBox, Badge, useToast, useConfirm, usePrompt } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { ImportListDialog } from './ImportListDialog.jsx';
import { FindCompaniesDialog } from './FindCompaniesDialog.jsx';
import { SendToReviewDialog } from './SendToReviewDialog.jsx';

function useImportedToast() {
  const { t } = useI18n();
  const toast = useToast();
  return (result) => toast({ title: t('watch.imported', { added: result.added, skipped: result.skipped }) });
}

export function WatchListsPage() {
  const { t } = useI18n();
  const format = useFormat();
  const navigate = useNavigate();
  const importedToast = useImportedToast();
  const result = useLoad('/watch-lists');
  const [importing, setImporting] = useState(false);
  const [finding, setFinding] = useState(false);
  const columns = [
    { key: 'name', label: t('watch.listName'), render: (list) => (
      <div className="min-w-48">
        <Link className="font-medium text-link hover:underline" to={`/research/watch-lists/${list.id}`}><bdi>{list.name}</bdi></Link>
        {list.source_url && <div className="text-[13px] text-subtle" dir="ltr">{new URL(list.source_url).hostname}</div>}
      </div>
    ) },
    { key: 'entry_count', label: t('watch.companies'), numeric: true },
    { key: 'checked_count', label: t('watch.checked'), numeric: true },
    { key: 'cards_found', label: t('watch.cardsFound'), numeric: true },
    { key: 'created_by_name', label: t('watch.importedBy'), render: (list) => <div>{list.created_by_name ?? '—'}<div className="text-[13px] text-subtle">{format.date(list.created_at)}</div></div> },
  ];
  return (
    <>
      <PageHeader title={t('nav.watchLists')} subtitle={t('watch.subtitle')} actions={(
        <>
          <Button variant="secondary" icon={Search} onClick={() => setFinding(true)}>{t('findCompanies.open')}</Button>
          <Button icon={Upload} onClick={() => setImporting(true)}>{t('watch.import')}</Button>
        </>
      )} />
      <Card padded>
        <Loaded result={result} skeleton={<SkeletonRows rows={4} />}>
          {(lists) => <Table caption={t('nav.watchLists')} columns={columns} rows={lists} empty={<EmptyState icon={ClipboardList} title={t('watch.none')}>{t('watch.noneHint')}</EmptyState>} />}
        </Loaded>
      </Card>
      {finding && (
        <FindCompaniesDialog
          onClose={() => setFinding(false)}
          onDone={(found) => {
            setFinding(false);
            importedToast(found);
            navigate(`/research/watch-lists/${found.list_id}`);
          }}
        />
      )}
      {importing && (
        <ImportListDialog
          open
          onClose={() => setImporting(false)}
          onImported={(created) => {
            setImporting(false);
            importedToast(created);
            navigate(`/research/watch-lists/${created.id}`);
          }}
        />
      )}
    </>
  );
}

export function WatchListPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const importedToast = useImportedToast();
  const { user } = useAuth();
  const toast = useToast();
  const prompt = usePrompt();
  const result = useLoad(`/watch-lists/${id}`);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const toggle = (entryIds, on) => setSelected((previous) => {
    const next = new Set(previous);
    for (const entryId of entryIds) {
      if (on) next.add(entryId);
      else next.delete(entryId);
    }
    return next;
  });
  const block = useAction(async (entryIds) => {
    const reason = await prompt({ title: t('blocked.blockTitle', { count: entryIds.length }), label: t('blocked.reasonOptional'), confirmLabel: t('blocked.block'), minLength: 0 });
    if (reason === null) return;
    const done = await post(`/watch-lists/${id}/block`, { entry_ids: entryIds.map(String), reason: reason.trim() || null });
    setSelected(new Set());
    toast({ title: t('blocked.blockedCount', { count: done.blocked }) });
    result.reload();
  });
  const remove = useAction(async (list) => {
    const ok = await confirm({ title: t('watch.delete'), body: t('watch.deleteBody', { name: list.name }), confirmLabel: t('watch.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/watch-lists/${list.id}`);
    navigate('/research/watch-lists');
  });

  return (
    <Loaded result={result} skeleton={<Card><SkeletonRows rows={8} /></Card>}>
      {(list) => {
        const canDelete = user.role === 'admin' || list.created_by === user.id;
        const needle = query.trim().toLowerCase();
        const shown = needle ? list.entries.filter((entry) => `${entry.name} ${entry.website ?? ''}`.toLowerCase().includes(needle)) : list.entries;
        // Companies on the "Don't suggest" list cannot be chosen (remove them there first).
        const choosable = shown.filter((entry) => !entry.blocked).map((entry) => entry.id);
        const allShownChosen = choosable.length > 0 && choosable.every((entryId) => selected.has(entryId));
        const chosen = list.entries.filter((entry) => selected.has(entry.id) && !entry.blocked).map((entry) => entry.id);
        return (
          <>
            <PageHeader
              eyebrow={<Link className="text-link hover:underline" to="/research/watch-lists">{t('nav.watchLists')}</Link>}
              title={list.name}
              subtitle={(
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{t('watch.countLine', { count: list.entries.length })}</span>
                  {list.source_note && <bdi>{list.source_note}</bdi>}
                  {list.source_url && <ExternalLink href={list.source_url}>{t('watch.sourceUrl')}</ExternalLink>}
                </span>
              )}
              actions={(
                <>
                  <Button icon={Upload} onClick={() => setImporting(true)}>{t('watch.importMoreShort')}</Button>
                  {canDelete && <Button variant="danger" icon={Trash2} loading={remove.busy} onClick={() => remove.run(list)}>{t('watch.delete')}</Button>}
                </>
              )}
            />
            {remove.error && <ErrorBox message={remove.error} />}
            {block.error && <ErrorBox message={block.error} />}
            <Card padded>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div className="w-full max-w-sm">
                  <FieldRow field={{ name: 'q', label: t('common.search') }} inputId="watch-search">
                    <FieldInput field={{ name: 'q', type: 'text' }} inputId="watch-search" value={query} onChange={setQuery} />
                  </FieldRow>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted" aria-live="polite">{t('watch.chosenCount', { count: chosen.length })}</span>
                  <Button variant="secondary" icon={Ban} loading={block.busy} disabled={chosen.length === 0} disabledReason={t('watch.chooseFirst')} onClick={() => block.run(chosen)}>
                    {t('blocked.block')}
                  </Button>
                  <Button icon={Send} disabled={chosen.length === 0} disabledReason={t('watch.chooseFirst')} onClick={() => setSending(true)}>
                    {t('watch.sendToReview')}
                  </Button>
                </div>
              </div>
              <Table
                caption={list.name}
                columns={[
                  {
                    key: 'choose',
                    label: (
                      <input
                        type="checkbox" className="h-4 w-4 align-middle" aria-label={t('watch.chooseAll')}
                        checked={allShownChosen} disabled={choosable.length === 0} onChange={(event) => toggle(choosable, event.target.checked)}
                      />
                    ),
                    render: (entry) => (!entry.blocked ? (
                      <input
                        type="checkbox" className="h-4 w-4 align-middle" aria-label={t('watch.choose', { name: entry.name })}
                        checked={selected.has(entry.id)} onChange={(event) => toggle([entry.id], event.target.checked)}
                      />
                    ) : <span aria-hidden="true" />),
                  },
                  { key: 'name', label: t('watch.field.name') },
                  { key: 'website', label: t('watch.field.website'), render: (entry) => (entry.website ? <span dir="ltr">{entry.website}</span> : '—') },
                  { key: 'country', label: t('watch.field.country') },
                  { key: 'notes', label: t('watch.field.notes') },
                  { key: 'last_checked_at', label: t('watch.lastChecked'), render: (entry) => (entry.last_checked_at ? format.date(entry.last_checked_at) : t('watch.notYet')) },
                  {
                    key: 'card',
                    label: t('watch.card'),
                    render: (entry) => {
                      if (entry.blocked) return <Link to="/research/blocked"><Badge tone="danger"><Ban aria-hidden="true" size={13} />{t('blocked.badge')}</Badge></Link>;
                      if (entry.opportunity_id !== null) return <Link className="whitespace-nowrap font-medium text-link hover:underline" to={`/research/cards/${entry.opportunity_id}`}>{t('watch.openCard')}</Link>;
                      if (entry.has_card_data) return <Badge tone="info"><FileCheck2 aria-hidden="true" size={13} />{t('watch.cardInFile')}</Badge>;
                      return '—';
                    },
                  },
                ]}
                rows={shown}
                empty={t('watch.noMatches')}
              />
            </Card>
            {sending && (
              <SendToReviewDialog
                list={list}
                entryIds={chosen}
                onClose={() => setSending(false)}
                onSent={(sent) => {
                  setSending(false);
                  setSelected(new Set());
                  toast({ title: t('watch.sent', { count: sent.created.length }), body: sent.existing.length > 0 ? t('watch.alreadyHadCard', { count: sent.existing.length }) : undefined });
                  result.reload();
                }}
              />
            )}
            {importing && (
              <ImportListDialog
                open
                list={list}
                onClose={() => setImporting(false)}
                onImported={(imported) => {
                  setImporting(false);
                  importedToast(imported);
                  result.reload();
                }}
              />
            )}
          </>
        );
      }}
    </Loaded>
  );
}
