import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { Button } from './ui.jsx';

/** Copy text to the clipboard (a manual, human action: nothing is sent). */
export function CopyButton({ text, label, className = '' }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </Button>
  );
}
