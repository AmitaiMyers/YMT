// Draft a follow-up for a lead: choose contact + language, then review it in the draft sheet.
// The touchpoint cap (max 3) is shown up-front and enforced by the server.

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../hooks/useApi.js';
import { post } from '../api.js';
import { Dialog, Loaded, Button, ErrorBox, Notice, ProgressBar } from '../ui/index.js';
import { INPUT_CLASS } from './EntityForm.jsx';
import { useEnumOptions } from '../enumOptions.js';
import { LANGUAGES } from '../../../shared/enums.js';

const FIELD_CLASS = `${INPUT_CLASS} border-line-strong mt-1.5`;

function FollowupForm({ deal, onDrafted }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const withEmail = deal.contacts.filter((c) => c.email);
  const [contactId, setContactId] = useState(withEmail[0] ? String(withEmail[0].id) : '');
  const [language, setLanguage] = useState(withEmail[0]?.preferred_language ?? 'he');
  const draft = useAction(async () => {
    const { id } = await post(`/deals/${deal.id}/followup`, { contact_id: Number(contactId), language });
    onDrafted(id);
  });
  const used = deal.followups_committed;
  const capReached = used >= deal.max_followups;

  useEffect(() => {
    const contact = withEmail.find((c) => String(c.id) === contactId);
    if (contact) setLanguage(contact.preferred_language);
  }, [contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex justify-between text-sm"><span>{t('followup.touchpoints')}</span><span className="tabular font-semibold">{used} / {deal.max_followups}</span></div>
        <ProgressBar value={used} max={deal.max_followups} tone={capReached ? 'signal' : 'chart'} label={t('followup.touchpoints')} />
      </div>
      <ErrorBox message={draft.error} />
      {capReached && <Notice tone="signal">{t('followup.capReachedHint')}</Notice>}
      {withEmail.length === 0 ? <Notice tone="signal">{t('followup.noEmailContact')}</Notice> : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t('interaction.contact')}
            <select className={FIELD_CLASS} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {withEmail.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">{t('contact.language')}
            <select className={FIELD_CLASS} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {options('language', LANGUAGES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      )}
      <Button
        icon={Send}
        loading={draft.busy}
        loadingLabel={t('followup.drafting')}
        disabled={capReached || withEmail.length === 0}
        disabledReason={capReached ? t('followup.capReached') : t('followup.noEmailContact')}
        onClick={draft.run}
      >
        {t('followup.draftNumber', { number: used + 1, max: deal.max_followups })}
      </Button>
    </div>
  );
}

export function FollowupDialog({ dealId, onClose, onDrafted }) {
  const { t } = useI18n();
  const result = useLoad(dealId === null ? null : `/deals/${dealId}`);
  return (
    <Dialog open={dealId !== null} onClose={onClose} title={t('followup.title')} description={result.data ? <bdi>{result.data.company_name} – {result.data.title}</bdi> : undefined}>
      <Loaded result={result}>{(deal) => <FollowupForm deal={deal} onDrafted={onDrafted} />}</Loaded>
    </Dialog>
  );
}
