import { Dialog } from '../ui/index.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { NAV_ITEMS } from './navigation.js';

function Keys({ combo }) {
  return (
    <span dir="ltr" className="flex gap-1">
      {combo.split(' ').map((key) => <kbd key={key} className="min-w-6 rounded border border-line-strong bg-sunken px-1.5 text-center font-mono text-xs">{key}</kbd>)}
    </span>
  );
}

export function ShortcutsDialog({ open, onClose }) {
  const { t } = useI18n();
  const rows = [
    ['Ctrl K', t('shortcuts.palette')],
    ['/', t('shortcuts.palette')],
    ['?', t('shortcuts.help')],
    ...NAV_ITEMS.map((item) => [item.hotkey, t(item.key)]),
  ];
  return (
    <Dialog open={open} onClose={onClose} title={t('shortcuts.title')} description={t('shortcuts.note')}>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-sm">
        {rows.map(([combo, label]) => (
          <div key={`${combo}-${label}`} className="contents">
            <dt><Keys combo={combo} /></dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
