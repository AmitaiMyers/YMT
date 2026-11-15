import { Link2, Ban } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Button, ErrorBox, Notice, Table, StatusBadge, statusTone, EmptyState, useConfirm, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { CopyButton } from '../../components/CopyButton.jsx';

function linkStatus(link) {
  if (link.revoked) return 'revoked';
  return Date.parse(link.expires_at) < Date.now() ? 'expired' : 'active';
}

export function SharingTab({ data, reload }) {
  const { t } = useI18n();
  const format = useFormat();
  const confirm = useConfirm();
  const toast = useToast();
  const revoke = useAction(async (link) => {
    const ok = await confirm({ title: t('share.revokeTitle'), body: t('share.revokeBody', { label: link.label }), confirmLabel: t('share.revoke'), tone: 'danger' });
    if (!ok) return;
    await post(`/share-links/${link.id}/revoke`);
    toast({ title: t('toast.linkRevoked') });
    reload();
  });
  const fields = [
    { name: 'label', label: t('share.label'), type: 'text', required: true, help: t('share.labelHelp') },
    { name: 'days', label: t('share.days'), type: 'number', min: 1, help: t('share.daysHelp') },
  ];
  const columns = [
    { key: 'label', label: t('share.label') },
    { key: 'expires_at', label: t('share.expires'), render: (l) => format.dateTime(l.expires_at) },
    { key: 'status', label: t('share.status'), render: (l) => <StatusBadge tone={statusTone('share', linkStatus(l))}>{t(`share.${linkStatus(l)}`)}</StatusBadge> },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (l) => linkStatus(l) === 'active' && (
      <div className="flex flex-wrap gap-1">
        <CopyButton size="sm" text={`${window.location.origin}/share/${l.token}`} label={t('share.copyLink')} />
        <Button variant="ghost" size="sm" icon={Ban} className="text-danger-fg" onClick={() => revoke.run(l)}>{t('share.revoke')}</Button>
      </div>
    ) },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('share.title')}>
        <Notice>{t('share.help')}</Notice>
        <ErrorBox message={revoke.error} />
        <Table caption={t('share.title')} columns={columns} rows={data.share_links} empty={<EmptyState icon={Link2} title={t('share.none')} />} />
      </Card>
      <Card title={t('share.create')}>
        <EntityForm
          fields={fields}
          resetOnSuccess
          submitLabel={t('share.createButton')}
          successMessage={t('toast.linkCreated')}
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
