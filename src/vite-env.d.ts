/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_BROUTER_URL?: string;
}

interface Window {
  /** Laufzeit-Konfiguration aus /config.js (Container) */
  __VELOTERRA__?: { brouterUrl?: string };
}
