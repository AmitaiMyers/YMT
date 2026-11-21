// Small shared pieces of the Release 4 conversation screens.

import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge } from '../../ui/index.js';

const CLASS_TONES = {
  interested: 'success', question: 'info', not_now: 'neutral', not_interested: 'neutral', opt_out: 'danger',
  referral: 'info', out_of_office: 'neutral', other: 'neutral',
};

/** The AI's reading of a reply; "not analysed" while there is none. */
export function ReplyClassBadge({ value }) {
  const { t } = useI18n();
  if (value === null) return <Badge tone="signal">{t('reply.notAnalysed')}</Badge>;
  return <Badge tone={CLASS_TONES[value]}>{t(`replyClass.${value}`)}</Badge>;
}
