// Navigation badge counters ("heartbeat"): refreshed on start, on window focus, on navigation and on demand.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { get } from '../api.js';

const CountsContext = createContext(null);

export function CountsProvider({ children }) {
  const location = useLocation();
  const [counts, setCounts] = useState({ inbox: 0, approvals: 0, research: 0 });
  const refresh = useCallback(() => {
    // Counters are decoration: a failed refresh keeps the previous numbers; the page itself reports errors.
    get('/inbox/counts').then((inbox) => setCounts((previous) => ({ ...previous, ...inbox })), () => undefined);
    get('/research/counts').then((research) => setCounts((previous) => ({ ...previous, research: research.queue + research.manual })), () => undefined);
  }, []);

  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  useEffect(refresh, [location.pathname, refresh]);

  const value = useMemo(() => ({ counts, refresh }), [counts, refresh]);
  return <CountsContext.Provider value={value}>{children}</CountsContext.Provider>;
}

export function useCounts() {
  const context = useContext(CountsContext);
  if (!context) throw new Error('useCounts must be used inside CountsProvider');
  return context;
}
