// Ctrl/⌘+K command palette: jump to screens, companies and deals, or run quick actions.
// ARIA combobox + listbox with aria-activedescendant; bilingual search.

import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, CalendarPlus, Building2, SquareKanban, SunMoon, Languages, CornerDownLeft } from 'lucide-react';
import { Dialog } from '../ui/index.js';
import { useTheme } from '../ui/theme.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { get, toQuery } from '../api.js';
import { visibleNavItems } from './navigation.js';
import { useViewMode } from './viewMode.jsx';

const SEARCH_DELAY_MS = 200;

function useRemoteSearch(query) {
  const [results, setResults] = useState({ companies: [], deals: [] });
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults({ companies: [], deals: [] });
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Search is best-effort while typing; a failure simply shows no remote results.
      get(`/search${toQuery({ q: query.trim() })}`).then((data) => !cancelled && setResults(data), () => undefined);
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  return results;
}

export function CommandPalette({ open, onClose }) {
  const { t, language, setLanguage } = useI18n();
  const { resolved, choose } = useTheme();
  const { shows } = useViewMode();
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const remote = useRemoteSearch(query);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const items = useMemo(() => {
    const go = (to) => () => navigate(to);
    const local = [
      ...visibleNavItems(shows).map((item) => ({ id: `nav-${item.to}`, icon: item.icon, label: t(item.key), hint: t('palette.screen'), run: go(item.to) })),
      { id: 'new-company', icon: Plus, label: t('palette.newCompany'), hint: t('palette.action'), run: go('/clients/new') },
      { id: 'schedule', icon: CalendarPlus, label: t('meetings.schedule'), hint: t('palette.action'), run: go('/calendar#schedule') },
      { id: 'theme', icon: SunMoon, label: resolved === 'dark' ? t('theme.switchLight') : t('theme.switchDark'), hint: t('palette.action'), run: () => choose(resolved === 'dark' ? 'light' : 'dark') },
      { id: 'language', icon: Languages, label: language === 'he' ? 'Switch to English' : 'מעבר לעברית', hint: t('palette.action'), run: () => setLanguage(language === 'he' ? 'en' : 'he') },
    ];
    const needle = query.trim().toLowerCase();
    const filtered = needle ? local.filter((item) => item.label.toLowerCase().includes(needle)) : local;
    return [
      ...remote.companies.map((c) => ({ id: `c-${c.id}`, icon: Building2, label: c.name, hint: c.industry, run: go(`/companies/${c.id}`) })),
      ...remote.deals.map((d) => ({ id: `d-${d.id}`, icon: SquareKanban, label: d.title, hint: d.company_name, run: go(`/deals/${d.id}`) })),
      ...filtered,
    ];
  }, [query, remote, t, navigate, resolved, choose, language, setLanguage, shows]);

  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  function execute(item) {
    onClose();
    item.run();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + delta + items.length) % items.length);
    }
    if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault();
      execute(items[activeIndex]);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('palette.title')} width="max-w-xl">
      <div className="relative">
        <Search aria-hidden="true" size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          data-autofocus="true"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[activeIndex] ? `${listId}-${items[activeIndex].id}` : undefined}
          aria-label={t('palette.placeholder')}
          placeholder={t('palette.placeholder')}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          className="min-h-12 w-full rounded-[10px] border border-line-strong bg-surface ps-10 pe-3 text-base"
        />
      </div>
      <ul id={listId} role="listbox" aria-label={t('palette.results')} className="mt-3 max-h-[50dvh] overflow-y-auto">
        {items.map((item, index) => {
          const Icon = item.icon;
          const selected = index === activeIndex;
          return (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={selected}
              onMouseMove={() => setActive(index)}
              onClick={() => execute(item)}
              className={`flex cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2.5 text-sm ${selected ? 'bg-info-soft' : ''}`}
            >
              <Icon aria-hidden="true" size={18} className="shrink-0 text-subtle" />
              <span dir="auto" className="flex-1 truncate align-parent font-medium">{item.label}</span>
              {item.hint && <span className="truncate text-[13px] text-subtle">{item.hint}</span>}
              {selected && <CornerDownLeft aria-hidden="true" size={14} className="text-subtle rtl:-scale-x-100" />}
            </li>
          );
        })}
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t('palette.none')}</li>}
      </ul>
    </Dialog>
  );
}
