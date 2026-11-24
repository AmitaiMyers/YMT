// The services catalogue (decision 30: one catalogue, IL and GL lines). The status of a service feeds the
// "fit to our service" part of the score: ready 20, in build or in review 12, not offered 0. Admins change it.

import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, SkeletonRows, Table, ErrorBox, StatusBadge } from '../../ui/index.js';
import { FieldInput } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { SERVICE_STATUSES } from '../../../../shared/enums.js';

const STATUS_TONE = { ready: 'success', in_build: 'info', in_review: 'info', not_offered: 'neutral' };

function StatusCell({ service, canEdit, onChanged }) {
  const { t } = useI18n();
  const options = useEnumOptions();
  const save = useAction(async (status) => {
    await patch(`/services/${service.code}`, { status });
    onChanged();
  });
  if (!canEdit) return <StatusBadge tone={STATUS_TONE[service.status]}>{t(`serviceStatus.${service.status}`)}</StatusBadge>;
  const inputId = `service-status-${service.code}`;
  return (
    <div className="min-w-44">
      <label className="sr-only" htmlFor={inputId}>{t('services.statusOf', { code: service.code })}</label>
      <FieldInput field={{ name: 'status', type: 'select', required: true, options: options('serviceStatus', SERVICE_STATUSES) }} inputId={inputId} value={service.status} onChange={(value) => save.run(value)} />
      <ErrorBox message={save.error} />
    </div>
  );
}

export function ServicesSettings() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const result = useLoad('/services');
  const canEdit = user.role === 'admin';
  return (
    <Card title={t('services.title')} padded>
      <p className="mb-4 text-sm text-muted">{t('services.help')}</p>
      <Loaded result={result} skeleton={<SkeletonRows rows={8} />}>
        {(services) => (
          <Table
            caption={t('services.title')}
            columns={[
              { key: 'code', label: t('services.code'), render: (service) => <span className="tabular font-medium" dir="ltr">{service.code}</span> },
              { key: 'name', label: t('services.name'), render: (service) => (language === 'he' ? service.name_he : service.name_en) },
              { key: 'status', label: t('services.status'), render: (service) => <StatusCell service={service} canEdit={canEdit} onChanged={result.reload} /> },
            ]}
            rows={services.map((service) => ({ ...service, id: service.code }))}
          />
        )}
      </Loaded>
    </Card>
  );
}
