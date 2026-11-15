import { UserCheck, UserX, KeyRound, Users } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, Table, Button, ErrorBox, StatusBadge, EmptyState, useConfirm, usePrompt, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';

const MIN_PASSWORD_LENGTH = 10;

export function UsersSettings() {
  const { t } = useI18n();
  const format = useFormat();
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const toast = useToast();
  const result = useLoad('/users');
  const toggleActive = useAction(async (user) => {
    const ok = await confirm({
      title: user.active ? t('users.deactivate') : t('users.activate'),
      body: user.active ? t('users.deactivateBody', { name: user.display_name }) : t('users.activateBody', { name: user.display_name }),
      confirmLabel: user.active ? t('users.deactivate') : t('users.activate'),
      tone: user.active ? 'danger' : 'primary',
    });
    if (!ok) return;
    await patch(`/users/${user.id}`, { active: !user.active });
    toast({ title: t('toast.saved') });
    result.reload();
  });
  const resetPassword = useAction(async (user) => {
    const password = await prompt({
      title: t('users.resetPassword'),
      label: t('users.newPasswordPrompt'),
      confirmLabel: t('users.resetPassword'),
      inputType: 'password',
      minLength: MIN_PASSWORD_LENGTH,
      invalidReason: t('users.passwordTooShort', { min: MIN_PASSWORD_LENGTH }),
    });
    if (password === null) return;
    await patch(`/users/${user.id}`, { password });
    toast({ title: t('toast.passwordReset'), body: t('users.passwordResetHint') });
  });
  const roleOptions = ['member', 'admin'].map((role) => ({ value: role, label: t(`role.${role}`) }));
  const fields = [
    { name: 'username', label: t('auth.username'), type: 'text', required: true },
    { name: 'display_name', label: t('users.displayName'), type: 'text', required: true },
    { name: 'password', label: t('auth.password'), type: 'text', required: true, help: t('users.passwordHelp') },
    { name: 'role', label: t('users.role'), type: 'select', required: true, options: roleOptions },
  ];
  const columns = [
    { key: 'display_name', label: t('users.displayName'), render: (u) => <div><bdi className="font-medium">{u.display_name}</bdi><div className="text-[13px] text-subtle" dir="ltr">{u.username}</div></div> },
    { key: 'role', label: t('users.role'), render: (u) => t(`role.${u.role}`) },
    { key: 'active', label: t('settings.active'), render: (u) => <StatusBadge tone={u.active ? 'success' : 'neutral'}>{u.active ? t('users.statusActive') : t('users.statusInactive')}</StatusBadge> },
    { key: 'created_at', label: t('common.created'), render: (u) => format.date(u.created_at) },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (u) => (
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => resetPassword.run(u)}>{t('users.resetPassword')}</Button>
        <Button variant="ghost" size="sm" icon={u.active ? UserX : UserCheck} disabled={u.id === me.id} disabledReason={t('users.notYourself')} onClick={() => toggleActive.run(u)}>
          {u.active ? t('users.deactivate') : t('users.activate')}
        </Button>
      </div>
    ) },
  ];
  return (
    <div className="space-y-6">
      <Card title={t('settings.users')}>
        <ErrorBox message={toggleActive.error ?? resetPassword.error} />
        <Loaded result={result}>{(rows) => <Table caption={t('settings.users')} columns={columns} rows={rows} empty={<EmptyState icon={Users} title="—" />} />}</Loaded>
      </Card>
      <Card title={t('users.add')}>
        <EntityForm
          fields={fields}
          initial={{ role: 'member' }}
          resetOnSuccess
          successMessage={t('toast.userCreated')}
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
