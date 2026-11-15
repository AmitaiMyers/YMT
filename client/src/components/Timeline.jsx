// Unified multi-channel interaction timeline + "log interaction" form.

import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { post } from '../api.js';
import { Badge, Card, Empty } from './ui.jsx';
import { EntityForm } from './EntityForm.jsx';
import { useInteractionFields, withIds } from '../fields.js';

const CHANNEL_COLORS = { phone: 'blue', email: 'green', linkedin: 'blue', meeting: 'amber', note: 'gray' };

export function Timeline({ interactions }) {
  const { t } = useI18n();
  const format = useFormat();
  if (interactions.length === 0) return <Empty>{t('interaction.none')}</Empty>;
  return (
    <ol className="space-y-3 border-s-2 border-slate-200 ps-4">
      {interactions.map((item) => (
        <li key={item.id} className="relative">
          <span className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge color={CHANNEL_COLORS[item.channel]}>{t(`channel.${item.channel}`)}</Badge>
            <span>{t(`direction.${item.direction}`)}</span>
            <span>{format.dateTime(item.occurred_at)}</span>
            {item.contact_name && <span>· {item.contact_name}</span>}
            {item.user_name && <span>· {item.user_name}</span>}
          </div>
          <p className="prose-pre mt-1 text-sm">{item.summary}</p>
        </li>
      ))}
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
        onSubmit={async (values) => {
          const result = await post('/interactions', withIds({ ...values, company_id: companyId, deal_id: dealId ?? null }, ['contact_id']));
          onLogged();
          return result;
        }}
      />
    </Card>
  );
}
