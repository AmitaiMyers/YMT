// App shell: navigation, language switch, signed-in user, offline banner.

import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

const NAV_ITEMS = [
  { to: '/', key: 'nav.dashboard', end: true },
  { to: '/leads', key: 'nav.leads' },
  { to: '/approvals', key: 'nav.approvals' },
  { to: '/pipeline', key: 'nav.pipeline' },
  { to: '/reminders', key: 'nav.reminders' },
  { to: '/meetings', key: 'nav.meetings' },
  { to: '/documents', key: 'nav.documents' },
  { to: '/directory', key: 'nav.directory' },
  { to: '/settings', key: 'nav.settings' },
];

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function LanguageSwitch({ className = '' }) {
  const { language, setLanguage } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
      className={`rounded-md border border-white/30 px-2 py-1 text-xs font-semibold ${className}`}
      aria-label="Switch language"
    >
      {language === 'he' ? 'English' : 'עברית'}
    </button>
  );
}

export function Layout() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const online = useOnline();

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="no-print bg-brand-900 text-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-lg font-bold tracking-wide">YMT Group</div>
            <div className="text-xs text-brand-100">{t('app.tagline')}</div>
          </div>
          <button type="button" className="md:hidden rounded border border-white/30 px-2 py-1 text-sm" onClick={() => setMenuOpen((open) => !open)}>
            {t('nav.menu')}
          </button>
        </div>
        <nav className={`${menuOpen ? 'block' : 'hidden'} md:block px-2 pb-4`}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-semibold' : 'text-brand-100 hover:bg-white/10'}`}
            >
              {t(item.key)}
            </NavLink>
          ))}
          <div className="mt-6 border-t border-white/15 px-3 pt-4 text-xs text-brand-100">
            <div className="mb-2">{user.display_name} · {t(`role.${user.role}`)}</div>
            <div className="flex gap-2">
              <LanguageSwitch />
              <button type="button" onClick={logout} className="rounded-md border border-white/30 px-2 py-1 text-xs">{t('auth.logout')}</button>
            </div>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {!online && <div className="no-print mb-4 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">{t('app.offline')}</div>}
        <Outlet />
      </main>
    </div>
  );
}
