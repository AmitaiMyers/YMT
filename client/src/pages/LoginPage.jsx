import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useAction } from '../hooks/useApi.js';
import { Button, ErrorBox } from '../components/ui.jsx';
import { INPUT_CLASS } from '../components/EntityForm.jsx';
import { LanguageSwitch } from '../components/Layout.jsx';

export function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy, error } = useAction(login);

  return (
    <div className="flex min-h-full items-center justify-center bg-brand-900 p-4">
      <form
        onSubmit={(event) => { event.preventDefault(); run(username, password); }}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-900">YMT Group</h1>
            <p className="text-sm text-slate-500">{t('app.tagline')}</p>
          </div>
          <LanguageSwitch className="!border-slate-300 text-slate-700" />
        </div>
        <ErrorBox message={error} />
        <label className="mb-1 block text-sm font-medium" htmlFor="username">{t('auth.username')}</label>
        <input id="username" autoComplete="username" className={`${INPUT_CLASS} mb-4`} value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="mb-1 block text-sm font-medium" htmlFor="password">{t('auth.password')}</label>
        <input id="password" type="password" autoComplete="current-password" className={`${INPUT_CLASS} mb-6`} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" className="w-full" disabled={busy}>{t('auth.login')}</Button>
        <p className="mt-4 text-xs text-slate-500">{t('auth.confidential')}</p>
      </form>
    </div>
  );
}
