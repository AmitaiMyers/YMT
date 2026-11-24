// Status and fit of the company in each Asian market (spec of 22.11.2026). The agent fills them with a source;
// staff add or correct them here, with an optional source link. Every market is listed, unknown until set.

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { put } from '../../api.js';
import { Card, Button, ErrorBox, ExternalLink } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { MARKETS, MARKET_STATUSES, MARKET_FITS } from '../../../../shared/enums.js';

const UNKNOWN = { status: 'unknown', fit: 'unknown', note: null, source_url: null, checked_at: null };

function MarketForm({ companyId, market, row, onSaved, onCancel }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const [form, setForm] = useState({ status: row.status, fit: row.fit, note: row.note ?? '', source_url: row.source_url ?? '' });
  const set = (field) => (value) => setForm((previous) => ({ ...previous, [field]: value }));
  const save = useAction(async () => {
    await put(`/companies/${companyId}/markets/${market}`, {
      status: form.status, fit: form.fit, note: form.note.trim() || null, source_url: form.source_url.trim() || null,
    });
    onSaved();
  });
  const id = (field) => `market-${market}-${field}`;
  return (
    <form className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.run(); }}>
      <FieldRow field={{ name: 'status', label: t('markets.status'), required: true }} inputId={id('status')}>
        <FieldInput field={{ name: 'status', type: 'select', required: true, options: options('marketStatus', MARKET_STATUSES) }} inputId={id('status')} value={form.status} onChange={set('status')} />
      </FieldRow>
      <FieldRow field={{ name: 'fit', label: t('markets.fit'), required: true }} inputId={id('fit')}>
        <FieldInput field={{ name: 'fit', type: 'select', required: true, options: options('marketFit', MARKET_FITS) }} inputId={id('fit')} value={form.fit} onChange={set('fit')} />
      </FieldRow>
      <FieldRow field={{ name: 'note', label: t('research.note') }} inputId={id('note')}>
        <FieldInput field={{ name: 'note', type: 'text' }} inputId={id('note')} value={form.note} onChange={set('note')} />
      </FieldRow>
      <FieldRow field={{ name: 'source_url', label: t('markets.sourceOptional') }} inputId={id('source')}>
        <FieldInput field={{ name: 'source_url', type: 'url' }} inputId={id('source')} value={form.source_url} onChange={set('source_url')} />
      </FieldRow>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" size="sm" loading={save.busy}>{t('common.save')}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
      <div className="sm:col-span-2"><ErrorBox message={save.error} /></div>
    </form>
  );
}

export function MarketsCard({ companyId, markets, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const [editing, setEditing] = useState(null);
  const byMarket = new Map(markets.map((row) => [row.market, row]));
  return (
    <Card title={t('markets.title')}>
      <p className="mb-2 text-[13px] text-subtle">{t('markets.editHelp')}</p>
      <ul className="divide-y divide-line">
        {MARKETS.map((market) => {
          const row = byMarket.get(market) ?? UNKNOWN;
          return (
            <li key={market} className="py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-fg">{t(`market.${market}`)}</div>
                  <div className="text-muted">
                    {row.status === 'unknown' && row.fit === 'unknown' && row.note === null
                      ? t('markets.notSet')
                      : <>{t(`marketStatus.${row.status}`)} · {t(`marketFit.${row.fit}`)}{row.note ? <> · <bdi>{row.note}</bdi></> : null}</>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-subtle">
                    {row.source_url && <ExternalLink href={row.source_url}>{new URL(row.source_url).hostname.replace(/^www\./, '')}</ExternalLink>}
                    {row.checked_at && <span>{t('research.checkedAt')}: {format.date(row.checked_at)}</span>}
                  </div>
                </div>
                {editing !== market && (
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(market)} aria-label={t('markets.editOf', { market: t(`market.${market}`) })}>
                    {t('common.edit')}
                  </Button>
                )}
              </div>
              {editing === market && (
                <MarketForm companyId={companyId} market={market} row={row} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
