// Staff input: add a referral or a known initiative as a card, with the same evidence rules as research.

import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Dialog, Loaded, SkeletonRows } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { ISRAEL_CONNECTIONS, RELATIONSHIP_ROLES, NEED_TYPES } from '../../../../shared/enums.js';

const DEFAULTS = { israel_connection: 'hq_israel', relationship_role: 'client' };

export function AddOpportunityDialog({ open, onClose, onCreated }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const mandates = useLoad(open ? '/mandates' : null);

  return (
    <Dialog open={open} onClose={onClose} title={t('research.addOpportunity')} description={t('research.addOpportunityHint')} width="max-w-2xl">
      <Loaded result={mandates} skeleton={<SkeletonRows rows={6} />}>
        {(list) => {
          const fields = [
            { name: 'company_name', label: t('research.company'), type: 'text', required: true },
            { name: 'website', label: t('common.website'), type: 'url' },
            { name: 'israel_connection', label: t('research.field.israel_connection'), type: 'select', required: true, options: options('israelConnection', ISRAEL_CONNECTIONS) },
            { name: 'mandate_id', label: t('research.mandate'), type: 'select', help: t('research.mandateHelp'),
              options: list.map((m) => ({ value: String(m.id), label: `${m.code} · ${m.name}` })) },
            { name: 'relationship_role', label: t('research.relationshipRole'), type: 'select', required: true, options: options('relationshipRole', RELATIONSHIP_ROLES) },
            { name: 'need_type', label: t('research.needType'), type: 'select', required: true, options: options('needType', NEED_TYPES) },
            { name: 'target_country', label: t('research.targetCountry'), type: 'text', required: true },
            { name: 'evidence_date', label: t('research.evidenceDate'), type: 'date', required: true },
            { name: 'business_need', label: t('research.businessNeed'), type: 'textarea', required: true, wide: true, rows: 2 },
            { name: 'evidence_url', label: t('research.evidenceUrl'), type: 'url', required: true, wide: true },
            { name: 'evidence_quote', label: t('research.evidenceQuote'), type: 'textarea', required: true, wide: true, rows: 3, help: t('research.evidenceQuoteHelp') },
          ];
          return (
            <EntityForm
              fields={fields}
              initial={DEFAULTS}
              submitLabel={t('research.addOpportunity')}
              onCancel={onClose}
              onSubmit={async (values) => {
                const card = await post('/opportunities', { ...values, mandate_id: values.mandate_id === null ? null : Number(values.mandate_id) });
                onCreated(card);
              }}
            />
          );
        }}
      </Loaded>
    </Dialog>
  );
}
