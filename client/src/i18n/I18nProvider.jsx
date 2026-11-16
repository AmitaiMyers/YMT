// Language (Hebrew RTL / English LTR) context. Missing translations fail fast during development.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STRINGS } from './strings.js';

const STORAGE_KEY = 'ymt.language';
const I18nContext = createContext(null);

function readStoredLanguage(fallback) {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'he' || stored === 'en' ? stored : fallback;
}

export function translate(language, key, params = {}) {
  const template = STRINGS[language][key];
  if (template === undefined) throw new Error(`Missing ${language} translation for "${key}"`);
  return template.replace(/\{(\w+)\}/g, (match, name) => String(params[name]));
}

export function I18nProvider({ children, initialLanguage = 'he', persist = true }) {
  const [language, setLanguageState] = useState(() => (persist ? readStoredLanguage(initialLanguage) : initialLanguage));

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    if (persist) window.localStorage.setItem(STORAGE_KEY, language);
  }, [language, persist]);

  const t = useCallback((key, params) => translate(language, key, params), [language]);
  const setLanguage = useCallback((next) => setLanguageState(next), []);
  const value = useMemo(() => ({ language, setLanguage, t, dir: language === 'he' ? 'rtl' : 'ltr' }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

/** Format helpers that follow the active language. */
export function useFormat() {
  const { language } = useI18n();
  const locale = language === 'he' ? 'he-IL' : 'en-GB';
  return useMemo(() => ({
    date: (value) => (value ? new Date(value).toLocaleDateString(locale) : '—'),
    longDate: (value) => new Date(value).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
    relative: (value) => {
      const minutes = Math.round((Date.parse(value) - Date.now()) / 60000);
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
      if (Math.abs(minutes) < 60 * 24) return formatter.format(Math.round(minutes / 60), 'hour');
      return formatter.format(Math.round(minutes / 1440), 'day');
    },
    time: (value) => new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    dateTime: (value) => (value ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
    usd: (value) => (value === null || value === undefined ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)),
    number: (value) => (value === null || value === undefined ? '—' : new Intl.NumberFormat(locale).format(value)),
  }), [locale]);
}
