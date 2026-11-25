// Import a company list from an Excel (.xlsx) or CSV file – including a company export from Apollo or Lusha:
// choose the encoding (CSV only), map the columns, preview, import.
// Creates a new watch list, or adds to an existing one when `list` is given. Duplicates are skipped by the server.

import { useMemo, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Dialog, Button, IconButton, ErrorBox, Table, Notice, FilePicker } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { readRows, isExcel, SPREADSHEET_ACCEPT } from '../../lib/spreadsheet.js';

const ENCODINGS = ['utf-8', 'windows-1255'];
const TARGETS = ['name', 'website', 'country', 'notes'];
// Header words that suggest a column, in English and Hebrew. Exact headers of Apollo and Lusha company exports
// ("Company", "Company Name", "Website", "Company Domain", "Company Country") are tried first, so a person's
// "First Name" or "Country" column is not picked by mistake.
const EXACT = {
  name: /^(company|company name|organization( name)?|account name|שם החברה|חברה)$/i,
  website: /^(website|company website|company domain|domain|אתר)$/i,
  country: /^(company country|country|מדינה)$/i,
  notes: /^(notes?|הערות?)$/i,
};
const GUESSES = {
  name: /^(?!.*(first|last) name).*(name|company|שם|חברה)/i,
  website: /web|site|url|domain|אתר/i,
  country: /country|מדינה/i,
  notes: /note|remark|comment|הערה|הערות|תיאור/i,
};

function guessMapping(header) {
  const used = new Set();
  return Object.fromEntries(TARGETS.map((target) => {
    const free = (i) => !used.has(i);
    const exact = header.findIndex((title, i) => free(i) && EXACT[target].test(title.trim()));
    const index = exact !== -1 ? exact : header.findIndex((title, i) => free(i) && GUESSES[target].test(title));
    if (index !== -1) used.add(index);
    return [target, index === -1 ? '' : String(index)];
  }));
}

export function ImportListDialog({ open, list = null, onClose, onImported }) {
  const { t } = useI18n();
  const [file, setFile] = useState(null);
  const [encoding, setEncoding] = useState('utf-8');
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState(null);
  const [name, setName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  // Rows the user left out (indexes into the file's rows), so one unwanted company does not need a new file.
  const [removed, setRemoved] = useState(() => new Set());

  const read = useAction(async (nextFile, nextEncoding) => {
    setFile(nextFile);
    if (!nextFile) return;
    const nextRows = await readRows(nextFile, nextEncoding);
    setRows(nextRows);
    setRemoved(new Set());
    setMapping(guessMapping(nextRows[0] ?? []));
    if (!list && name === '') setName(nextFile.name.replace(/\.[^.]+$/, ''));
  });
  const readFile = (nextFile, nextEncoding) => read.run(nextFile, nextEncoding);

  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const mapped = useMemo(() => (mapping && mapping.name !== '' ? body.map((row, index) => ({
    key: index,
    ...Object.fromEntries(TARGETS.map((target) => [target, mapping[target] === '' ? null : (row[Number(mapping[target])] ?? '') || null])),
  })).filter((row) => row.name !== null) : []), [body, mapping]);
  const kept = mapped.filter((row) => !removed.has(row.key));
  const entries = kept.map((row) => Object.fromEntries(TARGETS.map((target) => [target, row[target]])));
  const leaveOut = (key) => setRemoved((previous) => new Set(previous).add(key));

  const submit = useAction(async () => {
    const result = list
      ? await post(`/watch-lists/${list.id}/import`, { entries })
      : await post('/watch-lists', { name, source_url: sourceUrl || null, source_note: sourceNote || null, entries });
    onImported(result);
  });

  const columnOptions = header.map((title, index) => ({ value: String(index), label: title || t('watch.column', { n: index + 1 }) }));
  const ready = entries.length > 0 && (list || name.trim() !== '');
  return (
    <Dialog open={open} onClose={onClose} title={list ? t('watch.importMore', { name: list.name }) : t('watch.import')} description={t('watch.importHint')} width="max-w-3xl">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit.run(); }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow field={{ name: 'file', label: t('watch.file'), required: true }} inputId="watch-file">
            <FilePicker id="watch-file" accept={SPREADSHEET_ACCEPT} file={file} onFile={(nextFile) => readFile(nextFile, encoding)} />
          </FieldRow>
          {(file === null || !isExcel(file)) && <FieldRow field={{ name: 'encoding', label: t('watch.encoding'), help: t('watch.encodingHelp') }} inputId="watch-encoding" errorId="watch-encoding-hint">
            <FieldInput
              field={{ name: 'encoding', type: 'select', required: true, options: ENCODINGS.map((value) => ({ value, label: t(`watch.encoding.${value}`) })) }}
              inputId="watch-encoding" errorId="watch-encoding-hint" value={encoding}
              onChange={(value) => { setEncoding(value); readFile(file, value); }}
            />
          </FieldRow>}
          {!list && (
            <>
              <FieldRow field={{ name: 'list-name', label: t('watch.listName'), required: true }} inputId="watch-name">
                <FieldInput field={{ name: 'list-name', type: 'text', required: true }} inputId="watch-name" value={name} onChange={setName} />
              </FieldRow>
              <FieldRow field={{ name: 'source', label: t('watch.sourceUrl'), help: t('watch.sourceUrlHelp') }} inputId="watch-source" errorId="watch-source-hint">
                <FieldInput field={{ name: 'source', type: 'url' }} inputId="watch-source" errorId="watch-source-hint" value={sourceUrl} onChange={setSourceUrl} />
              </FieldRow>
              <FieldRow field={{ name: 'note', label: t('watch.sourceNote'), wide: true }} inputId="watch-note">
                <FieldInput field={{ name: 'note', type: 'text' }} inputId="watch-note" value={sourceNote} onChange={setSourceNote} />
              </FieldRow>
            </>
          )}
        </div>
        {mapping && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-fg">{t('watch.mapColumns')}</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {TARGETS.map((target) => (
                <FieldRow key={target} field={{ name: target, label: t(`watch.field.${target}`), required: target === 'name' }} inputId={`map-${target}`}>
                  <FieldInput
                    field={{ name: target, type: 'select', required: target === 'name', options: columnOptions }}
                    inputId={`map-${target}`} value={mapping[target]}
                    onChange={(value) => setMapping((previous) => ({ ...previous, [target]: value }))}
                  />
                </FieldRow>
              ))}
            </div>
          </fieldset>
        )}
        {mapping && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{t('watch.preview', { count: entries.length })}</span>
              {removed.size > 0 && (
                <>
                  <span>· {t('watch.leftOut', { count: removed.size })}</span>
                  <Button variant="ghost" size="sm" onClick={() => setRemoved(new Set())}>{t('watch.bringBack')}</Button>
                </>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              <Table
                caption={t('watch.previewCaption')}
                rowKey="key"
                columns={[
                  ...TARGETS.map((target) => ({ key: target, label: t(`watch.field.${target}`) })),
                  { key: 'leave-out', label: <span className="sr-only">{t('watch.leaveOutColumn')}</span>, render: (row) => (
                    <IconButton icon={X} label={t('watch.leaveOut', { name: row.name })} className="-my-2" onClick={() => leaveOut(row.key)} />
                  ) },
                ]}
                rows={kept}
                empty={<Notice tone="signal">{t('watch.noRows')}</Notice>}
              />
            </div>
          </div>
        )}
        {read.error && <ErrorBox message={read.error} />}
        {submit.error && <ErrorBox message={submit.error} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={Upload} loading={submit.busy} disabled={!ready} disabledReason={t('watch.notReady')}>{t('watch.importCount', { count: entries.length })}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
