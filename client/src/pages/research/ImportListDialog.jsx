// Import a company list from a CSV file: choose the encoding, map the columns, preview, import.
// Creates a new watch list, or adds to an existing one when `list` is given. Duplicates are skipped by the server.

import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Dialog, Button, ErrorBox, Table, Notice } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { detectDelimiter, parseCsv } from '../../lib/csv.js';

const ENCODINGS = ['utf-8', 'windows-1255'];
const TARGETS = ['name', 'website', 'country', 'notes'];
// Header words that suggest a column, in English and Hebrew.
const GUESSES = {
  name: /name|company|שם|חברה/i,
  website: /web|site|url|domain|אתר/i,
  country: /country|מדינה/i,
  notes: /note|remark|comment|הערה|הערות|תיאור/i,
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

export function ImportListDialog({ open, list = null, onClose, onImported }) {
  const { t } = useI18n();
  const [file, setFile] = useState(null);
  const [encoding, setEncoding] = useState('utf-8');
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState(null);
  const [name, setName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceNote, setSourceNote] = useState('');

  async function readFile(nextFile, nextEncoding) {
    setFile(nextFile);
    if (!nextFile) return;
    const decoded = new TextDecoder(nextEncoding).decode(await nextFile.arrayBuffer());
    setText(decoded);
    const [header] = parseCsv(decoded, detectDelimiter(decoded));
    setMapping(guessMapping(header ?? []));
    if (!list && name === '') setName(nextFile.name.replace(/\.[^.]+$/, ''));
  }

  const rows = useMemo(() => (text ? parseCsv(text, detectDelimiter(text)) : []), [text]);
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const entries = useMemo(() => (mapping && mapping.name !== '' ? body.map((row) => Object.fromEntries(
    TARGETS.map((target) => [target, mapping[target] === '' ? null : (row[Number(mapping[target])] ?? '') || null]),
  )).filter((entry) => entry.name !== null) : []), [body, mapping]);

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
            <input id="watch-file" type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(event) => readFile(event.target.files[0] ?? null, encoding)} />
          </FieldRow>
          <FieldRow field={{ name: 'encoding', label: t('watch.encoding'), help: t('watch.encodingHelp') }} inputId="watch-encoding" errorId="watch-encoding-hint">
            <FieldInput
              field={{ name: 'encoding', type: 'select', required: true, options: ENCODINGS.map((value) => ({ value, label: t(`watch.encoding.${value}`) })) }}
              inputId="watch-encoding" errorId="watch-encoding-hint" value={encoding}
              onChange={(value) => { setEncoding(value); readFile(file, value); }}
            />
          </FieldRow>
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
            <p className="mb-2 text-sm text-muted">{t('watch.preview', { count: entries.length })}</p>
            <Table
              caption={t('watch.previewCaption')}
              rowKey="key"
              columns={TARGETS.map((target) => ({ key: target, label: t(`watch.field.${target}`) }))}
              rows={entries.slice(0, PREVIEW_ROWS).map((entry, index) => ({ ...entry, key: index }))}
              empty={<Notice tone="signal">{t('watch.noRows')}</Notice>}
            />
          </div>
        )}
        {submit.error && <ErrorBox message={submit.error} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={Upload} loading={submit.busy} disabled={!ready} disabledReason={t('watch.notReady')}>{t('watch.importCount', { count: entries.length })}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
