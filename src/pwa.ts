import { create } from 'zustand';

/**
 * Installierbare App (PWA): Service Worker für schnellen Start und Offline-
 * Betrieb, dazu der Installations-Dialog des Browsers.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Browser bietet die Installation an (Chrome, Edge, Android) */
  prompt: InstallPrompt | null;
  /** läuft schon als installierte App */
  installed: boolean;
  online: boolean;
}

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const usePwa = create<PwaState>()(() => ({
  prompt: null,
  installed: typeof window !== 'undefined' && standalone(),
  online: typeof navigator === 'undefined' || navigator.onLine,
}));

export async function install() {
  const p = usePwa.getState().prompt;
  if (!p) return;
  await p.prompt();
  const { outcome } = await p.userChoice;
  usePwa.setState({ prompt: null, installed: outcome === 'accepted' });
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ prompt: e as InstallPrompt });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ prompt: null, installed: true }));
  window.addEventListener('online', () => usePwa.setState({ online: true }));
  window.addEventListener('offline', () => usePwa.setState({ online: false }));
  // im Entwicklungsbetrieb keinen Service Worker – sonst liefert er alten Code aus
  if (import.meta.env.PROD && 'serviceWorker' in navigator)
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
