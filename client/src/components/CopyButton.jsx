import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { Button, useToast } from '../ui/index.js';

/** Copy text to the clipboard (a manual, human action: nothing is sent). */
export function CopyButton({ text, label, size = 'md', variant = 'secondary' }) {
  const { t } = useI18n();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      offlineOk
      icon={copied ? Check : Copy}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast({ title: t('common.copied') });
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {label ?? t('common.copy')}
    </Button>
  );
}
