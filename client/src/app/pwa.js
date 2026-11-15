// Install support for mobile and desktop.
// `beforeinstallprompt` (Chrome/Edge on Android, Windows, macOS, Linux) can fire before React mounts,
// so it is captured at module load. iOS/iPadOS Safari has no prompt API: we show manual instructions.

import { useEffect, useState } from 'react';

let deferredPrompt = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // we show our own, contextual install button instead of the mini-infobar
  deferredPrompt = event;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notify();
});

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPadOS reports as Mac
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || touchMac;
}

/**
 * @returns {{ mode: 'installed' | 'prompt' | 'ios' | 'unavailable', install: () => Promise<boolean> }}
 */
export function useInstallPrompt() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  let mode = 'unavailable';
  if (isStandalone()) mode = 'installed';
  else if (deferredPrompt) mode = 'prompt';
  else if (isIos()) mode = 'ios';

  async function install() {
    if (!deferredPrompt) throw new Error('No install prompt available');
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    notify();
    return outcome === 'accepted';
  }

  return { mode, install };
}
