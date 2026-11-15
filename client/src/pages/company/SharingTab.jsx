import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Badge, Button, ErrorBox, Notice, Table } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { CopyButton } from '../../components/CopyButton.jsx';

function linkStatus(link) {
  if (link.revoked) return 'revoked';
  return Date.parse(link.expires_at) < Date.now() ? 'expired' : 'active';
}

const STATUS_COLORS = { active: 'green', expired: 'gray', revoked: 'red' };

export function SharingTab({ data, reload }) {
  const { t } = useI18n();
  const format = useFormat();
  const revoke = useAction(async (link) => {
    await post(`/share-links/${link.id}/revoke`);
    reload();
  });
  const fields = [
    { name: 'label', label: t('share.label'), type: 'text', required: true, help: t('share.labelHelp') },
    { name: 'days', label: t('share.days'), type: 'number', min: 1, help: t('share.daysHelp') },
  ];
  const columns = [
    { key: 'label', label: t('share.label') },
    { key: 'expires_at', label: t('share.expires'), render: (l) => format.dateTime(l.expires_at) },
    { key: 'status', label: t('share.status'), render: (l) => <Badge color={STATUS_COLORS[linkStatus(l)]}>{t(`share.${linkStatus(l)}`)}</Badge> },
    { key: 'actions', label: '', render: (l) => linkStatus(l) === 'active' && (
      <div className="flex gap-1">
        <CopyButton className="!px-2 !py-1 text-xs" text={`${window.location.origin}/share/${l.token}`} label={t('share.copyLink')} />
        <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => revoke.run(l)}>{t('share.revoke')}</Button>
      </div>
    ) },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('share.title')}>
        <Notice>{t('share.help')}</Notice>
        <ErrorBox message={revoke.error} />
        <Table columns={columns} rows={data.share_links} empty={t('share.none')} />
      </Card>
      <Card title={t('share.create')}>
        <EntityForm
          fields={fields}
          resetOnSuccess
          submitLabel={t('share.createButton')}
          onSubmit={async (values) => {
            const result = await post(`/companies/${data.company.id}/share-links`, values);
            reload();
            return result;
          }}
        />
      </Card>
    </div>
  );
}
