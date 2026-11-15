// Unified multi-channel interaction timeline + "log interaction" form.

import { Phone, Mail, AtSign, Users, StickyNote } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { post } from '../api.js';
import { Card, EmptyState } from '../ui/index.js';
import { EntityForm } from './EntityForm.jsx';
import { useInteractionFields, withIds } from '../fields.js';

const CHANNEL_ICONS = { phone: Phone, email: Mail, linkedin: AtSign, meeting: Users, note: StickyNote };

export function Timeline({ interactions }) {
  const { t } = useI18n();
  const format = useFormat();
  if (interactions.length === 0) return <EmptyState icon={StickyNote} title={t('interaction.none')}>{t('interaction.noneHint')}</EmptyState>;
  return (
    <ol className="relative space-y-5 before:absolute before:inset-y-1 before:start-[15px] before:w-px before:bg-line">
      {interactions.map((item) => {
        const Icon = CHANNEL_ICONS[item.channel];
        return (
          <li key={item.id} className="relative flex gap-3 animate-rise">
            <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-link">
              <Icon aria-hidden="true" size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-[13px] text-subtle">
                <span className="font-medium text-muted">{t(`channel.${item.channel}`)} · {t(`direction.${item.direction}`)}</span>
                <time dateTime={item.occurred_at}>{format.dateTime(item.occurred_at)}</time>
                {item.contact_name && <bdi>· {item.contact_name}</bdi>}
                {item.user_name && <bdi>· {item.user_name}</bdi>}
              </div>
              <p dir="auto" className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{item.summary}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LogInteractionCard({ companyId, dealId, contacts, onLogged }) {
  const { t } = useI18n();
  const fields = useInteractionFields(contacts);
  return (
    <Card title={t('interaction.log')}>
      <EntityForm
        fields={fields}
        initial={{ channel: 'phone', direction: 'outbound', occurred_at: new Date().toISOString() }}
        resetOnSuccess
        submitLabel={t('interaction.logButton')}
        successMessage={t('toast.interactionLogged')}
        onSubmit={async (values) => {
          const result = await post('/interactions', withIds({ ...values, company_id: companyId, deal_id: dealId ?? null }, ['contact_id']));
          onLogged();
          return result;
        }}
      />
    </Card>
  );
}
