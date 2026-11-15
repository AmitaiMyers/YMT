// Small UI hooks shared by primitives and pages.

import { useEffect, useRef, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Animate a number from 0 to `target` once (skipped when motion is reduced). */
export function useCountUp(target, durationMs = 360) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);
  return value;
}

/** Sets the document title for the current page (announced by screen readers on navigation). */
export function usePageTitle(title) {
  useEffect(() => {
    if (typeof title === 'string' && title) document.title = `${title} · YMT Group`;
  }, [title]);
}

function isTypingTarget(element) {
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

/**
 * Keyboard shortcuts. `bindings` maps a key ("/", "?") or a two-key sequence ("g i") to a handler.
 * Ignored while typing in a field. Modifier shortcuts (Ctrl/⌘+K) are handled by their owners.
 */
export function useHotkeys(bindings) {
  const pending = useRef(null);
  const latest = useRef(bindings);
  latest.current = bindings;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const sequence = pending.current ? `${pending.current} ${key}` : key;
      const handler = latest.current[sequence];
      if (handler) {
        event.preventDefault();
        pending.current = null;
        handler();
        return;
      }
      const startsSequence = Object.keys(latest.current).some((binding) => binding.startsWith(`${key} `));
      pending.current = startsSequence ? key : null;
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
