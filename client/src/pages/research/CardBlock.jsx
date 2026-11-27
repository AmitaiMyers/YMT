// "Tried – don't suggest again" on a card (27.11.2026): after an approach that failed, the company goes on the
// "Don't suggest" list. No agent suggests it again and its cards leave the lead flow and the review until removed.

import { useNavigate } from 'react-router-dom';
import { Ban, Undo2 } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post, del } from '../../api.js';
import { Button, ErrorBox, Notice, useToast, usePrompt } from '../../ui/index.js';
import { useCounts } from '../../app/CountsProvider.jsx';

export function CardBlockButton({ card }) {
  const { t } = useI18n();
  const toast = useToast();
  const prompt = usePrompt();
  const navigate = useNavigate();
  const { refresh } = useCounts();
  const block = useAction(async () => {
    const reason = await prompt({ title: t('blocked.cardTitle', { name: card.company.name }), label: t('blocked.reasonOptional'), confirmLabel: t('blocked.block'), minLength: 0 });
    if (reason === null) return;
    await post(`/opportunities/${card.id}/block`, { reason: reason.trim() || null });
    toast({ title: t('blocked.added', { name: card.company.name }) });
    refresh();
    navigate('/flow');
  });
  return (
    <>
      <Button variant="secondary" icon={Ban} loading={block.busy} onClick={() => block.run()}>{t('blocked.cardButton')}</Button>
      {block.error && <ErrorBox message={block.error} />}
    </>
  );
}

export function CardBlockedNotice({ card, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const { refresh } = useCounts();
  const unblock = useAction(async () => {
    await del(`/blocked-companies/${card.blocked.id}`);
    refresh();
    onChanged();
  });
  const { blocked } = card;
  return (
    <>
      <Notice tone="signal" icon={Ban}>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>
            <strong>{t('blocked.cardNotice')}</strong>{' '}
            {t('blocked.cardNoticeBy', { name: blocked.blocked_by_name ?? '—', date: format.date(blocked.created_at) })}
            {blocked.reason && <> · <bdi>{blocked.reason}</bdi></>}
          </span>
          <Button variant="secondary" size="sm" icon={Undo2} loading={unblock.busy} onClick={() => unblock.run()}>{t('blocked.remove')}</Button>
        </span>
      </Notice>
      {unblock.error && <ErrorBox message={unblock.error} />}
    </>
  );
}
