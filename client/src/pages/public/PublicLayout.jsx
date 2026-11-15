// Minimal branded frame for pages opened by external clients/partners (no login, no navigation).

import { useI18n } from '../../i18n/I18nProvider.jsx';

export function PublicLayout({ children }) {
  const { language, setLanguage } = useI18n();
  return (
    <div className="min-h-dvh">
      <header className="no-print bg-sidebar px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sidebar-fg">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-bold"><img src="/icon.svg" alt="" className="h-8 w-8 rounded-md" />YMT Group</span>
          <button type="button" lang={language === 'he' ? 'en' : 'he'} onClick={() => setLanguage(language === 'he' ? 'en' : 'he')} className="min-h-10 rounded-[6px] border border-white/30 px-3 text-xs font-semibold">
            {language === 'he' ? 'English' : 'עברית'}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 md:p-8">{children}</main>
    </div>
  );
}
