// Send chosen watch-list companies to Research review: each becomes a card for you, built from the card columns its
// file carried (e.g. this CRM's own export) – or, for a plain list, a card that says where it came from. The agent you
// pick is the card's agent unless the file names one. "Run agent" on the card researches the company afterwards.
// A company that cannot become a card is skipped; the result lists it with the reason.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Dialog, Loaded, SkeletonRows, Notice, Button, ErrorBox, useToast } from '../../ui/index.js';
import { AgentChoice } from '../flow/RunAgentDialog.jsx';

const SEND_CHUNK = 200; // the server's limit per request

export function SendToReviewDialog({ list, entryIds, onClose, onSent }) {
  const { t } = useI18n();
  const agents = useLoad('/mandates');
  const [selectedId, setSelectedId] = useState(null);
  const send = useAction(async (mandateId) => {
    const total = { created: [], existing: [], skipped: [] };
    for (let start = 0; start < entryIds.length; start += SEND_CHUNK) {
      const ids = entryIds.slice(start, start + SEND_CHUNK).map(String);
      const part = await post(`/watch-lists/${list.id}/send-to-review`, { entry_ids: ids, mandate_id: mandateId });
      for (const key of Object.keys(total)) total[key].push(...part[key]);
    }
    onSent(total);
  });
  return (
    <Dialog open onClose={onClose} title={t('watch.sendTitle', { count: entryIds.length })} description={t('watch.sendHint')} width="max-w-2xl">
      <Loaded result={agents} skeleton={<SkeletonRows rows={4} />}>
        {(all) => {
          const ready = all.filter((agent) => agent.status === 'active' && agent.owner_id !== null);
          const selectedAgentId = selectedId ?? (ready.length === 1 ? ready[0].id : null);
          return (
            <div className="space-y-5">
              {ready.length === 0 && <Notice tone="signal">{t('flow.noAgentReady')} <Link className="text-link underline" to="/research/mandates">{t('nav.mandates')}</Link></Notice>}
              <AgentChoice agents={all} selectedId={selectedAgentId} onSelect={setSelectedId} />
              <p className="text-[13px] text-subtle">{t('watch.sendAgentNote')}</p>
              {send.error && <ErrorBox message={send.error} />}
              <div className="flex flex-wrap gap-2">
                <Button icon={Send} loading={send.busy} disabled={selectedAgentId === null} disabledReason={t('watch.chooseAgentFirst')} onClick={() => send.run(selectedAgentId)}>
                  {t('watch.sendCount', { count: entryIds.length })}
                </Button>
                <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
              </div>
            </div>
          );
        }}
      </Loaded>
    </Dialog>
  );
}

/** The toast after sending: new cards, companies that already had one, and each skipped company with its reason. */
export function useSentToast() {
  const { t } = useI18n();
  const toast = useToast();
  return (sent) => toast({
    title: t('watch.sent', { count: sent.created.length }),
    body: (sent.existing.length > 0 || sent.skipped.length > 0) && (
      <span className="block space-y-1">
        {sent.existing.length > 0 && <span className="block">{t('watch.alreadyHadCard', { count: sent.existing.length })}</span>}
        {sent.skipped.length > 0 && <span className="block">{t('watch.skipped', { count: sent.skipped.length })}</span>}
        {sent.skipped.map((row) => <span key={row.entry_id} className="block text-[13px]"><bdi>{row.reason}</bdi></span>)}
      </span>
    ),
    duration: sent.skipped.length > 0 ? 20_000 : undefined,
  });
}
