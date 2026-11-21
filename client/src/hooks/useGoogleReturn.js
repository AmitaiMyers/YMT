// Result of the Google sign-in round trip (?google=connected|denied|error&reason=…), shown once as a toast.

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useToast } from '../ui/index.js';

export function useGoogleReturn() {
  const { t } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const outcome = params.get('google');
    if (!outcome) return;
    const messages = {
      connected: { title: t('google.connected') },
      denied: { tone: 'info', title: t('google.denied') },
      error: { tone: 'error', title: t('google.connectFailed'), body: params.get('reason') ?? undefined },
    };
    toast(messages[outcome] ?? messages.error);
    const next = new URLSearchParams(params);
    next.delete('google');
    next.delete('reason');
    setParams(next, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
