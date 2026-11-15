// App shell: skip link, grouped sidebar (full ≥1280px, icon rail 768–1279px), mobile top bar + bottom tab bar,
// offline banner, command palette (Ctrl/⌘+K, "/"), shortcuts ("?", "g …").

import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, Monitor, LogOut, Menu as MenuIcon, WifiOff, Keyboard } from 'lucide-react';
import { CountBadge, Dialog, Skeleton, Tooltip, useHotkeys, useOnline, useTheme } from '../ui/index.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { NAV_GROUPS, NAV_ITEMS } from './navigation.js';
import { useCounts } from './CountsProvider.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { ShortcutsDialog } from './ShortcutsDialog.jsx';
import { InstallButton } from './InstallButton.jsx';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };

function navClass({ isActive }) {
  return `group relative flex min-h-11 items-center gap-3 rounded-[6px] px-3 text-sm transition-colors transition-ui ${
    isActive ? 'bg-sidebar-active font-semibold text-sidebar-fg' : 'text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-fg'
  }`;
}

function NavItem({ item, compact, onNavigate }) {
  const { t } = useI18n();
  const { counts } = useCounts();
  const count = item.count ? counts[item.count] : 0;
  const Icon = item.icon;
  const label = t(item.key);
  const link = (tooltipId) => (
    <NavLink to={item.to} end={item.end} className={navClass} onClick={onNavigate} aria-describedby={tooltipId} aria-label={compact ? label : undefined}>
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-signal" />}
          <Icon aria-hidden="true" size={19} className="shrink-0" />
          {!compact && <span className="flex-1 truncate">{label}</span>}
          {count > 0 && (
            <span className={compact ? 'absolute -top-0.5 end-0.5' : ''}>
              <CountBadge count={count} label={t('nav.countLabel', { count })} />
            </span>
          )}
        </>
      )}
    </NavLink>
  );
  return compact ? <Tooltip label={label} className="w-full">{(id) => link(id)}</Tooltip> : link(undefined);
}

function NavGroups({ compact, onNavigate }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('nav.main')} className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.key}>
          {!compact && <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-sidebar-muted/80">{t(`navGroup.${group.key}`)}</div>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => <li key={item.to}><NavItem item={item} compact={compact} onNavigate={onNavigate} /></li>)}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ThemeSwitch({ compact }) {
  const { t } = useI18n();
  const { preference, choose, preferences } = useTheme();
  const next = preferences[(preferences.indexOf(preference) + 1) % preferences.length];
  const Icon = THEME_ICONS[preference];
  const label = t('theme.current', { theme: t(`theme.${preference}`) });
  return (
    <Tooltip label={compact ? label : undefined}>
      {(id) => (
        <button type="button" aria-describedby={id} aria-label={label} onClick={() => choose(next)} className="flex min-h-10 items-center gap-2 rounded-[6px] px-2 text-xs text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-fg">
          <Icon aria-hidden="true" size={16} />{!compact && t(`theme.${preference}`)}
        </button>
      )}
    </Tooltip>
  );
}

function LanguageButton({ className = '' }) {
  const { language, setLanguage } = useI18n();
  return (
    <button
      type="button"
      lang={language === 'he' ? 'en' : 'he'}
      onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
      className={`min-h-10 rounded-[6px] px-2 text-xs font-semibold text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-fg ${className}`}
    >
      {language === 'he' ? 'EN' : 'עב'}
    </button>
  );
}

function SidebarFooter({ compact, onSearch, onShortcuts }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-4">
      {!compact && <InstallButton variant="ghost" size="sm" className="justify-start !text-sidebar-muted hover:!bg-sidebar-active hover:!text-sidebar-fg" />}
      <button type="button" onClick={onSearch} className="flex min-h-10 items-center gap-2 rounded-[6px] bg-sidebar-active px-3 text-sm text-sidebar-muted hover:text-sidebar-fg" aria-label={t('palette.title')}>
        <Search aria-hidden="true" size={16} />
        {!compact && <><span className="flex-1 text-start">{t('palette.short')}</span><kbd dir="ltr" className="rounded border border-white/20 px-1 text-[11px]">Ctrl K</kbd></>}
      </button>
      <div className={`flex ${compact ? 'flex-col items-center' : 'items-center justify-between'} gap-1`}>
        <ThemeSwitch compact={compact} />
        <LanguageButton />
        {onShortcuts && (
          <Tooltip label={t('shortcuts.title')}>
            {(id) => (
              <button type="button" onClick={onShortcuts} aria-describedby={id} aria-label={t('shortcuts.title')} className="flex min-h-10 items-center rounded-[6px] px-2 text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-fg">
                <Keyboard aria-hidden="true" size={16} />
              </button>
            )}
          </Tooltip>
        )}
        <Tooltip label={t('auth.logout')}>
          {(id) => (
            <button type="button" onClick={logout} aria-describedby={id} aria-label={t('auth.logout')} className="flex min-h-10 items-center rounded-[6px] px-2 text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-fg">
              <LogOut aria-hidden="true" size={16} className="rtl:-scale-x-100" />
            </button>
          )}
        </Tooltip>
      </div>
      {!compact && <div className="truncate px-1 text-xs text-sidebar-muted"><bdi>{user.display_name}</bdi> · {t(`role.${user.role}`)}</div>}
    </div>
  );
}

function Brand({ compact }) {
  const { t } = useI18n();
  return (
    <div className={`mb-6 flex items-center gap-2 ${compact ? 'justify-center' : 'px-2'}`}>
      <img src="/icon.svg" alt="" className="h-8 w-8 rounded-md" />
      {!compact && (
        <div>
          <div className="text-base font-bold leading-tight text-sidebar-fg">YMT Group</div>
          <div className="text-[11px] text-sidebar-muted">{t('app.tagline')}</div>
        </div>
      )}
    </div>
  );
}

function MobileBars({ onSearch }) {
  const { t } = useI18n();
  const { counts } = useCounts();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileItems = NAV_ITEMS.filter((item) => item.mobile);
  return (
    <>
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sidebar-fg md:hidden">
        <div className="flex items-center gap-2"><img src="/icon.svg" alt="" className="h-7 w-7 rounded" /><span className="font-bold">YMT Group</span></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onSearch} aria-label={t('palette.title')} className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-sidebar-active"><Search aria-hidden="true" size={20} /></button>
          <LanguageButton />
        </div>
      </header>
      <nav aria-label={t('nav.main')} className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const count = item.count ? counts[item.count] : 0;
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'font-semibold text-link' : 'text-muted'}`}>
              <Icon aria-hidden="true" size={21} />
              {t(item.key)}
              {count > 0 && <span className="absolute top-1 start-1/2 ms-2"><CountBadge count={count} label={t('nav.countLabel', { count })} /></span>}
            </NavLink>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
          <MenuIcon aria-hidden="true" size={21} />{t('nav.more')}
        </button>
      </nav>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')} variant="sheet">
        <div className="-m-5 flex min-h-full flex-col bg-sidebar p-4">
          <NavGroups compact={false} onNavigate={() => setMoreOpen(false)} />
          <div className="mt-6"><SidebarFooter compact={false} onSearch={() => { setMoreOpen(false); onSearch(); }} /></div>
        </div>
      </Dialog>
    </>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const online = useOnline();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useHotkeys({
    '/': () => setPaletteOpen(true),
    '?': () => setShortcutsOpen(true),
    ...Object.fromEntries(NAV_ITEMS.map((item) => [item.hotkey, () => navigate(item.to)])),
  });

  return (
    <div className="min-h-full md:flex">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:start-3 focus:top-3">{t('app.skipToContent')}</a>

      <aside className="no-print hidden bg-sidebar px-3 py-5 md:sticky md:top-0 md:flex md:h-screen md:w-[72px] md:shrink-0 md:flex-col md:overflow-y-auto xl:w-[248px]">
        <div className="contents xl:hidden">
          <Brand compact />
          <NavGroups compact />
          <SidebarFooter compact onSearch={() => setPaletteOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
        </div>
        <div className="hidden xl:contents">
          <Brand compact={false} />
          <NavGroups compact={false} />
          <SidebarFooter compact={false} onSearch={() => setPaletteOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
        </div>
      </aside>

      <MobileBars onSearch={() => setPaletteOpen(true)} />

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-24 pt-5 outline-none sm:px-6 md:pb-10 md:pt-8 xl:px-10">
        <div className="mx-auto max-w-[1200px]">
          {!online && (
            <div role="status" className="no-print mb-4 flex items-center gap-2 rounded-[6px] bg-signal-soft px-3 py-2 text-sm text-signal-fg">
              <WifiOff aria-hidden="true" size={16} />{t('app.offline')}
            </div>
          )}
          {/* Screens are code-split: the shell stays put while a screen's code loads. */}
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-64 rounded-[10px]" /></div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
