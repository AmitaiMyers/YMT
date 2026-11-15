import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post } from '../../api.js';
import { Card, Loaded, Table, Button, ErrorBox, Badge } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';

export function UsersSettings() {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad('/users');
  const update = useAction(async (id, body) => {
    await patch(`/users/${id}`, body);
    result.reload();
  });
  const roleOptions = ['member', 'admin'].map((role) => ({ value: role, label: t(`role.${role}`) }));
  const fields = [
    { name: 'username', label: t('auth.username'), type: 'text', required: true },
    { name: 'display_name', label: t('users.displayName'), type: 'text', required: true },
    { name: 'password', label: t('auth.password'), type: 'text', required: true, help: t('users.passwordHelp') },
    { name: 'role', label: t('users.role'), type: 'select', required: true, options: roleOptions },
  ];
  const columns = [
    { key: 'username', label: t('auth.username') },
    { key: 'display_name', label: t('users.displayName') },
    { key: 'role', label: t('users.role'), render: (u) => t(`role.${u.role}`) },
    { key: 'active', label: t('settings.active'), render: (u) => <Badge color={u.active ? 'green' : 'gray'}>{u.active ? t('common.yes') : t('common.no')}</Badge> },
    { key: 'created_at', label: t('common.created'), render: (u) => format.date(u.created_at) },
    { key: 'actions', label: '', render: (u) => (
      <div className="flex gap-1">
        <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => update.run(u.id, { active: !u.active })}>
          {u.active ? t('users.deactivate') : t('users.activate')}
        </Button>
        <Button
          variant="secondary"
          className="!px-2 !py-1 text-xs"
          onClick={() => {
            const password = window.prompt(t('users.newPasswordPrompt'));
            if (password) update.run(u.id, { password });
          }}
        >
          {t('users.resetPassword')}
        </Button>
      </div>
    ) },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('settings.users')}>
        <ErrorBox message={update.error} />
        <Loaded result={result}>{(rows) => <Table columns={columns} rows={rows} empty="—" />}</Loaded>
      </Card>
      <Card title={t('users.add')}>
        <EntityForm
          fields={fields}
          initial={{ role: 'member' }}
          resetOnSuccess
          onSubmit={async (values) => {
            const response = await post('/users', values);
            result.reload();
            return response;
          }}
        />
      </Card>
    </div>
  );
}
