import { create } from 'zustand';
import { cellFromJson, type CellJson, type CellRecord } from '../domain/traceCell';
import type { Bbox } from '../domain/traceGrid';

/**
 * Verbindung zum Veloterra-Server (optional, eigener Docker-Dienst hinter /api):
 * Admin-Login, seitenweite Einstellungen und vorab geladene GPS-Spuren.
 * Ohne Server läuft die App wie bisher nur im Browser.
 */

export interface SiteConfig {
  mapillaryToken: string;
  brouterUrl: string;
  overpassUrl: string;
}

export interface TraceJob {
  running: boolean;
  label: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

interface SiteState {
  /** null = wird geprüft, false = kein Server (nur Browser) */
  available: boolean | null;
  /** Server hat ein Admin-Passwort gesetzt */
  loginEnabled: boolean;
  admin: boolean;
  config: SiteConfig;
}

const EMPTY: SiteConfig = { mapillaryToken: '', brouterUrl: '', overpassUrl: '' };

export const useSite = create<SiteState>()(() => ({
  available: null,
  loginEnabled: false,
  admin: false,
  config: EMPTY,
}));

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const text = await res.text();
  let json: { error?: string } & T;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(res.ok ? 'Unerwartete Antwort des Servers' : `Server-Fehler ${res.status}`);
  }
  if (!res.ok) throw new Error(json.error || `Server-Fehler ${res.status}`);
  return json;
}

/** Beim Start: Gibt es den Server? Einstellungen und Anmeldestatus holen. */
export async function initSite() {
  try {
    const s = await api<{ admin: boolean; loginEnabled: boolean; config: SiteConfig }>('/session');
    useSite.setState({
      available: true,
      admin: s.admin,
      loginEnabled: s.loginEnabled,
      config: { ...EMPTY, ...s.config },
    });
  } catch {
    useSite.setState({ available: false });
  }
}

export async function login(password: string) {
  await api('/login', { method: 'POST', body: JSON.stringify({ password }) });
  await initSite();
}

export async function logout() {
  await api('/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
  useSite.setState({ admin: false });
}

export async function saveSiteConfig(patch: Partial<SiteConfig>) {
  const { config } = await api<{ config: SiteConfig }>('/config', { method: 'PUT', body: JSON.stringify(patch) });
  useSite.setState({ config: { ...EMPTY, ...config } });
}

/* ---------- GPS-Spuren ---------- */

/** Übersicht der Kacheln auf dem Server: id → [geladen am, unvollständig] */
export async function serverTraceIndex(): Promise<Map<string, { at: number; partial: boolean }>> {
  const { cells } = await api<{ cells: [string, number, number][] }>('/traces/index');
  return new Map(cells.map(([id, at, partial]) => [id, { at, partial: !!partial }]));
}

export async function serverTraceCells(ids: string[]): Promise<CellRecord[]> {
  const { cells } = await api<{ cells: CellJson[] }>(`/traces/cells?ids=${encodeURIComponent(ids.join(','))}`);
  return cells.map(cellFromJson);
}

export const traceJob = () => api<{ job: TraceJob | null; stored: number; bytes: number }>('/traces/job');

export const startTraceJob = (bbox: Bbox, label: string, refresh: boolean) =>
  api<{ job: TraceJob }>('/traces/job', { method: 'POST', body: JSON.stringify({ bbox, label, refresh }) });

export const cancelTraceJob = () => api('/traces/job', { method: 'DELETE' });

export const deleteServerTraces = () => api('/traces', { method: 'DELETE' });
