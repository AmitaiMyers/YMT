// Data-loading and action hooks. These are the single UI boundary where failed requests are turned into
// visible error messages (instead of crashing the whole page); errors are never silently ignored.

import { useCallback, useEffect, useState } from 'react';
import { get } from '../api.js';

/** Load JSON from `path` (re-loads when path changes). Pass null to skip loading. */
export function useLoad(path) {
  const [state, setState] = useState({ data: null, error: null, loading: path !== null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return undefined;
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    get(path).then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error) => !cancelled && setState({ data: null, error: error.message, loading: false }),
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

/** Wrap an async action: exposes `run`, `busy` and `error`. `run` resolves to the result or undefined on error. */
export function useAction(action) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (...args) => {
    setBusy(true);
    setError(null);
    const result = await action(...args).then(
      (value) => ({ ok: true, value }),
      (failure) => ({ ok: false, message: failure.message }),
    );
    setBusy(false);
    if (!result.ok) setError(result.message);
    return result.ok ? result.value : undefined;
  }, [action]);
  return { run, busy, error, clearError: () => setError(null) };
}
