// SHEPHA's exclusion list (decision 7): an admin imports SHEPHA's Excel file; it replaces the previous list.
// The file is read in the browser; only the chosen columns are sent. Companies on the list are dropped by the agent
// before any AI cost, and the list is never sent to the AI. Admins only: the list is confidential.

import { useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Loaded, SkeletonRows, Button, ErrorBox, Notice, Table, useToast } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';

const TARGETS = ['name', 'website', 'registry_number', 'note'];
// Header words that suggest a column, in English and Hebrew.
const GUESSES = {
  name: /name|company|שם|חברה/i,
  website: /web|site|url|domain|אתר/i,
  registry_number: /registr|number|ח\.?פ|מספר/i,
  note: /note|remark|comment|הערה|סיבה/i,
};
const PREVIEW_ROWS = 5;

function guessMapping(header) {
  const used = new Set();
  return Object.fromEntries(TARGETS.map((target) => {
    const index = header.findIndex((title, i) => !used.has(i) && GUESSES[target].test(title));
    if (index !== -1) used.add(index);
    return [target, index === -1 ? '' : String(index)];
  }));
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toRows(sheet, mapping) {
  return sheet.slice(1)
    .map((cells) => Object.fromEntries(TARGETS.filter((target) => mapping[target] !== '')
      .map((target) => [target, cellText(cells[Number(mapping[target])])])))
    .filter((row) => row.name !== '');
}

function ImportForm({ onImported }) {
  const { t } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const [mapping, setMapping] = useState(null);
  const read = useAction(async (file) => {
    const data = await readSheet(file);
    if (data.length < 2) throw new Error(t('shepha.emptyFile'));
    const header = data[0].map(cellText);
    setSheet(data);
    setMapping(guessMapping(header));
  });
  const send = useAction(async () => {
    const rows = toRows(sheet, mapping);
    const result = await post('/shepha-exclusions', { rows });
    toast({ title: t('shepha.imported', { count: result.count }) });
    setSheet(null);
    setMapping(null);
    onImported();
  });

  const header = sheet ? sheet[0].map(cellText) : [];
  const columnOptions = header.map((title, index) => ({ value: String(index), label: title || t('shepha.columnN', { n: index + 1 }) }));
  const rows = sheet && mapping.name !== '' ? toRows(sheet, mapping) : [];
  return (
    <div className="space-y-4">
      <FieldRow field={{ name: 'file', label: t('shepha.file'), help: t('shepha.fileHelp') }} inputId="shepha-file">
        <input
          id="shepha-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full text-sm"
          onChange={(event) => { if (event.target.files[0]) read.run(event.target.files[0]); }}
        />
      </FieldRow>
      <ErrorBox message={read.error} />
      {sheet && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TARGETS.map((target) => (
              <FieldRow key={target} field={{ name: target, label: t(`shepha.field.${target}`), required: target === 'name' }} inputId={`shepha-map-${target}`}>
                <FieldInput
                  field={{ name: target, type: 'select', required: target === 'name', options: columnOptions }}
                  inputId={`shepha-map-${target}`}
                  value={mapping[target]}
                  onChange={(value) => setMapping((previous) => ({ ...previous, [target]: value }))}
                />
              </FieldRow>
            ))}
          </div>
          {rows.length > 0 && (
            <Table
              caption={t('shepha.preview')}
              columns={TARGETS.filter((target) => mapping[target] !== '').map((target) => ({ key: target, label: t(`shepha.field.${target}`), render: (row) => <bdi>{row[target]}</bdi> }))}
              rows={rows.slice(0, PREVIEW_ROWS).map((row, index) => ({ ...row, id: index }))}
            />
          )}
          <Notice tone="signal">{t('shepha.replaceWarning', { count: rows.length })}</Notice>
          <Button icon={Upload} loading={send.busy} disabled={rows.length === 0} disabledReason={t('shepha.chooseName')} onClick={() => send.run()}>
            {t('shepha.import', { count: rows.length })}
          </Button>
          <ErrorBox message={send.error} />
        </>
      )}
    </div>
  );
}

export function ShephaSettings() {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad('/shepha-exclusions');
  return (
    <Card title={<span className="flex items-center gap-2"><FileSpreadsheet aria-hidden="true" size={18} />{t('shepha.title')}</span>}>
      <p className="mb-4 text-sm text-muted">{t('shepha.help')}</p>
      <Loaded result={result} skeleton={<SkeletonRows rows={3} />}>
        {(list) => (
          <div className="space-y-6">
            <p className="text-sm">
              {list.count === 0 ? t('shepha.none')
                : t('shepha.current', { count: list.count, date: format.dateTime(list.imported_at), name: list.imported_by_name ?? '—' })}
            </p>
            <ImportForm onImported={result.reload} />
            {list.count > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-link">{t('shepha.showList', { count: list.count })}</summary>
                <div className="mt-3">
                  <Table
                    caption={t('shepha.title')}
                    columns={[
                      { key: 'name', label: t('shepha.field.name'), render: (row) => <bdi>{row.name}</bdi> },
                      { key: 'domain', label: t('shepha.field.website'), render: (row) => row.domain ?? '—' },
                      { key: 'registry_number', label: t('shepha.field.registry_number'), render: (row) => row.registry_number ?? '—' },
                      { key: 'note', label: t('shepha.field.note'), render: (row) => (row.note ? <bdi>{row.note}</bdi> : '—') },
                    ]}
                    rows={list.rows.map((row, index) => ({ ...row, id: index }))}
                  />
                </div>
              </details>
            )}
          </div>
        )}
      </Loaded>
    </Card>
  );
}
