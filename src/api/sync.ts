import { create } from 'zustand';
import { chunks, planHeat, planRoutes, type RoutePlan } from '../domain/sync';
import type { LegResult } from '../domain/route';
import { useStore, type SavedRoute } from '../store';
import {
  clearLocalHeat,
  heatTracks,
  onClearHeat,
  putHeatTracks,
  trackFromJson,
  trackToJson,
  useHeat,
  type TrackJson,
} from './heatStore';
import { api, useSite } from './site';

/**
 * Sync mit dem Konto auf dem Veloterra-Server: gespeicherte Routen (mit
 * Etappen) und die Fahrten der persönlichen Heatmap. Läuft nach der
 * Anmeldung, nach jeder Änderung (kurz verzögert) und wenn die Seite wieder
 * in den Vordergrund kommt. Ohne Anmeldung bleibt alles im Browser.
 */

/** Etappen gespeicherter Routen liegen getrennt, damit die Liste klein bleibt. */
export const legsKey = (id: string) => `bike-planner-route-${id}`;

const META_KEY = 'veloterra-sync';

interface Meta {
  /** Konto, mit dem dieser Browser zuletzt abgeglichen wurde */
  owner: string | null;
  /** Stand je Route beim letzten Abgleich */
  routes: Record<string, number>;
  at: number | null;
}

function readMeta(): Meta {
  try {
    return { owner: null, routes: {}, at: null, ...JSON.parse(localStorage.getItem(META_KEY) ?? '{}') };
  } catch {
    return { owner: null, routes: {}, at: null };
  }
}

function writeMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* Speicher voll */
  }
}

interface SyncState {
  status: 'off' | 'busy' | 'idle' | 'error';
  at: number | null;
  error: string | null;
}

export const useSync = create<SyncState>()(() => ({ status: 'off', at: readMeta().at, error: null }));

/** gerade werden Daten vom Server übernommen – nicht gleich wieder abgleichen */
let applying = false;
let running: Promise<void> | null = null;
let again = false;

/** Jetzt abgleichen (läuft schon einer, folgt direkt danach ein weiterer). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runSync();
    } while (again);
  })().finally(() => (running = null));
  return running;
}

async function runSync() {
  const user = useSite.getState().user;
  if (!user) return;
  useSync.setState({ status: 'busy', error: null });
  try {
    const meta = readMeta();
    // anderes Konto als zuletzt: Daten dieses Browsers gehören jemand anderem → ersetzen statt hochladen
    const foreign = !!meta.owner && meta.owner !== user.id;
    const routes = await syncRoutes(foreign ? {} : meta.routes, foreign);
    await syncHeat(foreign);
    const at = Date.now();
    writeMeta({ owner: user.id, routes, at });
    useSync.setState({ status: 'idle', at });
  } catch (e) {
    useSync.setState({ status: 'error', error: (e as Error).message || 'Sync fehlgeschlagen' });
  }
}

function readLegs(id: string): Record<string, LegResult> | null {
  try {
    return JSON.parse(localStorage.getItem(legsKey(id)) ?? 'null');
  } catch {
    return null;
  }
}

async function syncRoutes(synced: Record<string, number>, foreign: boolean): Promise<Record<string, number>> {
  const { routes: remote, deleted } = await api<{ routes: SavedRoute[]; deleted: Record<string, number> }>(
    '/me/routes',
  );
  const local = useStore.getState().library;
  const plan: RoutePlan = foreign
    ? { pull: remote.map((r) => r.id), push: [], removeLocal: local.map((r) => r.id), removeRemote: [] }
    : planRoutes(local, remote, deleted, synced);

  for (const id of plan.push) {
    const route = local.find((r) => r.id === id);
    if (route)
      await api(`/me/routes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ route, legs: readLegs(id) }),
      });
  }
  for (const id of plan.removeRemote) await api(`/me/routes/${encodeURIComponent(id)}`, { method: 'DELETE' });

  if (plan.pull.length || plan.removeLocal.length) {
    const byId = new Map(remote.map((r) => [r.id, r]));
    const drop = new Set([...plan.removeLocal, ...plan.pull]);
    applying = true;
    try {
      useStore.setState((s) => {
        const library = [
          ...plan.pull.map((id) => byId.get(id)!).filter((r) => r && Array.isArray(r.waypoints)),
          ...s.library.filter((r) => !drop.has(r.id)),
        ].sort((a, b) => b.savedAt - a.savedAt);
        return { library, savedId: library.some((r) => r.id === s.savedId) ? s.savedId : null };
      });
    } finally {
      applying = false;
    }
    // Etappen gelöschter oder geänderter Routen verwerfen (werden beim Laden neu geholt)
    for (const id of drop) localStorage.removeItem(legsKey(id));
  }
  return Object.fromEntries(useStore.getState().library.map((r) => [r.id, r.savedAt]));
}

const heatLoaded = () =>
  new Promise<void>((resolve) => {
    if (useHeat.getState().loaded) return resolve();
    const off = useHeat.subscribe((s) => {
      if (s.loaded) {
        off();
        resolve();
      }
    });
  });

async function syncHeat(foreign: boolean) {
  await heatLoaded();
  const { ids } = await api<{ ids: [string, number][] }>('/me/heat/ids');
  const remote = new Map(ids.map(([id, pace]) => [id, !!pace]));
  if (foreign) {
    applying = true;
    await clearLocalHeat().finally(() => (applying = false));
  }
  const tracks = heatTracks();
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const plan = planHeat(new Map(tracks.map((t) => [t.id, !!t.pace])), remote);
  for (const part of chunks(plan.upload, 200))
    await api('/me/heat', {
      method: 'POST',
      body: JSON.stringify({ tracks: part.map((id) => trackToJson(byId.get(id)!)) }),
    });
  for (const part of chunks(plan.download, 300)) {
    const res = await api<{ tracks: TrackJson[] }>('/me/heat/fetch', {
      method: 'POST',
      body: JSON.stringify({ ids: part }),
    });
    applying = true;
    await putHeatTracks(res.tracks.map(trackFromJson)).finally(() => (applying = false));
  }
}

/** Etappen einer synchronisierten Route holen (wenn sie hier noch fehlen). */
export async function fetchLegs(id: string): Promise<Record<string, LegResult> | null> {
  const local = readLegs(id);
  if (local || !useSite.getState().user) return local;
  try {
    const { legs } = await api<{ legs: Record<string, LegResult> | null }>(`/me/routes/${encodeURIComponent(id)}`);
    if (legs) localStorage.setItem(legsKey(id), JSON.stringify(legs));
    return legs;
  } catch {
    return null;
  }
}

/** Beim Start: Änderungen beobachten und abgleichen, sobald angemeldet. */
export function initSync() {
  onClearHeat(async () => {
    if (useSite.getState().user) await api('/me/heat', { method: 'DELETE' });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay = 1500) => {
    if (applying || !useSite.getState().user) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), delay);
  };
  useStore.subscribe((s, p) => s.library !== p.library && schedule());
  useHeat.subscribe((s, p) => s.version !== p.version && p.loaded && schedule());
  useSite.subscribe((s, p) => {
    if (s.user?.id === p.user?.id) return;
    if (s.user) void syncNow();
    else useSync.setState({ status: 'off', error: null });
  });
  window.addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => {
    const at = useSync.getState().at ?? 0;
    if (document.visibilityState === 'visible' && Date.now() - at > 60_000) schedule(0);
  });
}
