// Theme preference: "system" | "light" | "dark". The resolved theme is written to html[data-theme].

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'ymt.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const PREFERENCES = ['system', 'light', 'dark'];
const ThemeContext = createContext(null);

function readPreference() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return PREFERENCES.includes(stored) ? stored : 'system';
}

function resolve(preference) {
  if (preference !== 'system') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference);
  const [resolved, setResolved] = useState(() => resolve(readPreference()));

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const apply = () => {
      const next = resolve(preference);
      document.documentElement.setAttribute('data-theme', next);
      setResolved(next);
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [preference]);

  const choose = useCallback((next) => {
    if (!PREFERENCES.includes(next)) throw new Error(`Unknown theme preference: ${next}`);
    if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
  }, []);

  const value = useMemo(() => ({ preference, resolved, choose, preferences: PREFERENCES }), [preference, resolved, choose]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
