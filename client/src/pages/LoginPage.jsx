import { useState } from 'react';
import { LogIn, Lock } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useAction } from '../hooks/useApi.js';
import { Button, ErrorBox, usePageTitle } from '../ui/index.js';
import { INPUT_CLASS } from '../components/EntityForm.jsx';

export function LoginPage() {
  const { t, language, setLanguage } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy, error } = useAction(login);
  usePageTitle(t('auth.login'));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <form
        noValidate
        onSubmit={(event) => { event.preventDefault(); run(username, password); }}
        className="animate-rise w-full max-w-sm rounded-[16px] bg-surface p-6 shadow-e3 sm:p-8"
      >
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="h-11 w-11 rounded-[10px]" />
            <div>
              <h1 className="text-xl font-bold text-fg">YMT Group</h1>
              <p className="text-[13px] text-subtle">{t('app.tagline')}</p>
            </div>
          </div>
          <button type="button" lang={language === 'he' ? 'en' : 'he'} onClick={() => setLanguage(language === 'he' ? 'en' : 'he')} className="min-h-10 rounded-[6px] border border-line-strong px-3 text-xs font-semibold text-muted hover:bg-hover">
            {language === 'he' ? 'English' : 'עברית'}
          </button>
        </div>
        <ErrorBox message={error} />
        <label className="mb-4 block text-sm font-medium" htmlFor="username">{t('auth.username')}
          <input id="username" autoComplete="username" autoCapitalize="none" dir="ltr" className={`${INPUT_CLASS} mt-1.5 border-line-strong`} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="mb-6 block text-sm font-medium" htmlFor="password">{t('auth.password')}
          <input id="password" type="password" autoComplete="current-password" dir="ltr" className={`${INPUT_CLASS} mt-1.5 border-line-strong`} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Button type="submit" icon={LogIn} className="w-full" loading={busy} loadingLabel={t('auth.signingIn')} disabled={!username || !password} disabledReason={t('auth.fillBoth')}>
          {t('auth.login')}
        </Button>
        <p className="mt-6 flex items-start gap-2 text-[13px] text-subtle"><Lock aria-hidden="true" size={14} className="mt-0.5 shrink-0" />{t('auth.confidential')}</p>
      </form>
    </main>
  );
}
