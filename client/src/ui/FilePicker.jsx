// A clear file chooser: a dashed box with a "Choose file" button and the chosen file's name. A file can also be
// dropped on it. The native input stays in the page (visually hidden) so the label, keyboard and screen readers work.

import { useState } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { buttonClasses } from './Button.jsx';

/**
 * @param {object} props
 * @param {string} props.id input id (the field label points at it)
 * @param {string} props.accept
 * @param {File|null} props.file the chosen file, shown by name
 * @param {(file: File) => void} props.onFile
 */
export function FilePicker({ id, accept, file, onFile }) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-[10px] border-2 border-dashed p-3 transition-colors transition-ui ${dragging ? 'border-link bg-info-soft' : 'border-line-strong bg-sunken/50'}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length > 0) onFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        className="peer sr-only"
        onChange={(event) => { if (event.target.files.length > 0) onFile(event.target.files[0]); }}
      />
      <label htmlFor={id} className={buttonClasses({ variant: 'primary', className: 'cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-link peer-focus-visible:ring-offset-2' })}>
        <Upload aria-hidden="true" size={16} />
        {file ? t('filePicker.change') : t('filePicker.choose')}
      </label>
      {file ? (
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg">
          <FileSpreadsheet aria-hidden="true" size={16} className="shrink-0 text-success-fg" />
          <bdi className="min-w-0 break-all">{file.name}</bdi>
        </span>
      ) : (
        <span className="text-sm text-subtle">{t('filePicker.drop')}</span>
      )}
    </div>
  );
}
