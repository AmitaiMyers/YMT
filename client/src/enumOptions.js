// Turn a shared enum list into translated <select> options: options('stage', PIPELINE_STAGES).

import { useCallback } from 'react';
import { useI18n } from './i18n/I18nProvider.jsx';

export function useEnumOptions() {
  const { t } = useI18n();
  return useCallback((prefix, values) => values.map((value) => ({ value, label: t(`${prefix}.${value}`) })), [t]);
}
