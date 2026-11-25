// Send chosen watch-list companies to Research review: each becomes a card for you, built from the card columns its
// file carried (e.g. this CRM's own export) – or, for a plain list, a card that says where it came from. The agent you
// pick is the card's agent unless the file names one. "Run agent" on the card researches the company afterwards.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Dialog, Loaded, SkeletonRows, Notice, Button, ErrorBox } from '../../ui/index.js';
import { AgentChoice } from '../flow/RunAgentDialog.jsx';

export function SendToReviewDialog({ list, entryIds, onClose, onSent }) {
  const { t } = useI18n();
  const agents = useLoad('/mandates');
  const [selectedId, setSelectedId] = useState(null);
  const send = useAction(async (mandateId) => {
    onSent(await post(`/watch-lists/${list.id}/send-to-review`, { entry_ids: entryIds.map(String), mandate_id: mandateId }));
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
