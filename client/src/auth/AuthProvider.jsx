// Current-user context. Any 401 from the API (expired session) drops the user back to the login screen.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, UNAUTHORIZED_EVENT } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, checked: false });

  useEffect(() => {
    get('/auth/session').then(
      ({ user }) => setState({ user, checked: true }),
      // Server unreachable (e.g. offline start): show the login screen; signing in will report the network error.
      () => setState({ user: null, checked: true }),
    );
    const onUnauthorized = () => setState({ user: null, checked: true });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const user = await post('/auth/login', { username, password });
    setState({ user, checked: true });
  }, []);

  const logout = useCallback(async () => {
    await post('/auth/logout');
    setState({ user: null, checked: true });
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
