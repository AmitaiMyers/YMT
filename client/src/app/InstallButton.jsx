// "Install app" – shown only where installation is possible and the app is not installed yet.

import { useState } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { Button, Dialog } from '../ui/index.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useInstallPrompt } from './pwa.js';

export function InstallButton({ variant = 'secondary', size = 'md', className = '' }) {
  const { t } = useI18n();
  const { mode, install } = useInstallPrompt();
  const [iosHelp, setIosHelp] = useState(false);
  if (mode === 'installed' || mode === 'unavailable') return null;
  return (
    <>
      <Button variant={variant} size={size} icon={Download} offlineOk className={className} onClick={() => (mode === 'prompt' ? install() : setIosHelp(true))}>
        {t('pwa.install')}
      </Button>
      <Dialog open={iosHelp} onClose={() => setIosHelp(false)} title={t('pwa.iosTitle')}>
        <ol className="space-y-3 text-sm">
          <li className="flex items-center gap-2">1. {t('pwa.iosStep1')} <Share aria-label={t('pwa.shareIcon')} size={18} /></li>
          <li className="flex items-center gap-2">2. {t('pwa.iosStep2')} <SquarePlus aria-hidden="true" size={18} /></li>
          <li>3. {t('pwa.iosStep3')}</li>
        </ol>
      </Dialog>
    </>
  );
}
