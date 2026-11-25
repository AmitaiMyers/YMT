// Sign-in: the brand panel (logo, background, the flow in three words) beside a calm form. Desktop first; on a phone
// the panel shrinks to a header above the form.

import { useState } from 'react';
import { LogIn, Lock, Search, CheckCircle2, Handshake } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useAction } from '../hooks/useApi.js';
import { Button, ErrorBox, usePageTitle } from '../ui/index.js';
import { INPUT_CLASS } from '../components/EntityForm.jsx';

const FLOW = [['find', Search], ['approve', CheckCircle2], ['close', Handshake]];

export function LoginPage() {
  const { t, language, setLanguage } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy, error } = useAction(login);
  usePageTitle(t('auth.login'));

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <section aria-label={t('auth.brandPanel')} className="brand-hero relative flex flex-col justify-between overflow-hidden p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:p-12">
        <div className="flex items-center gap-3">
          <img src="/brand/ymt-mark.svg" alt="" className="h-12 w-12 drop-shadow-sm lg:h-14 lg:w-14" />
          <span className="text-3xl font-black tracking-tight text-[#0B1B33] lg:text-4xl">YMT</span>
        </div>
        <div className="mt-8 hidden max-w-md rounded-[16px] bg-white/75 p-6 shadow-e2 backdrop-blur-md lg:block">
          <p className="text-2xl font-bold leading-snug text-[#0B1B33]">{t('auth.heroTitle')}</p>
          <ol className="mt-5 space-y-3">
            {FLOW.map(([key, Icon], index) => (
              <li key={key} className="animate-rise flex items-center gap-3 text-[15px] font-medium text-[#1C3557]" style={{ animationDelay: `${120 * (index + 1)}ms` }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue text-white"><Icon aria-hidden="true" size={18} /></span>
                {t(`auth.hero.${key}`)}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="flex items-center justify-center p-4 sm:p-8">
        <form
          noValidate
          onSubmit={(event) => { event.preventDefault(); run(username, password); }}
          className="animate-rise w-full max-w-sm rounded-[16px] bg-surface p-6 shadow-e3 sm:p-8"
        >
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-fg">{t('auth.welcome')}</h1>
              <p className="mt-1 text-[13px] text-subtle">{t('app.tagline')}</p>
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
      </div>
    </main>
  );
}
