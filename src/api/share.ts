import type { LngLat } from '../domain/geo';
import type { LegResult } from '../domain/route';
import { PRESETS, DEFAULT_SETTINGS, cloneSettings } from '../domain/settings';
import { decodeShare, encodeShare, isShared, readShareHash, type SharedRoute } from '../domain/share';
import { restoreLegs, snapshotLegs } from '../hooks/useRouting';
import { useStore } from '../store';
import { api, useSite } from './site';

/** Aktuelle Route zum Teilen */
export function currentShare(): SharedRoute {
  const s = useStore.getState();
  const preset = PRESETS.find((p) => p.id === s.presetId);
  const samePreset = !!preset && JSON.stringify(preset.settings) === JSON.stringify(s.settings);
  return {
    v: 1,
    name: s.routeName.trim(),
    waypoints: s.waypoints,
    presetId: s.presetId,
    ...(samePreset ? {} : { settings: s.settings }),
    overrides: s.overrides,
  };
}

export interface ShareLink {
  url: string;
  /** kurzer Link über den Veloterra-Server (inkl. exakter Etappen) */
  short: boolean;
}

const base = () => `${location.origin}${location.pathname}`;

/**
 * Link erzeugen: angemeldet als kurzer Link über den Server (passt gut in
 * einen QR-Code, Etappen bleiben exakt), sonst steckt die Route im Link.
 */
export async function createShareLink(): Promise<ShareLink> {
  const route = currentShare();
  if (useSite.getState().user) {
    try {
      const { id } = await api<{ id: string }>('/shares', {
        method: 'POST',
        body: JSON.stringify({ data: { route, legs: snapshotLegs() } }),
      });
      return { url: `${base()}#s=${id}`, short: true };
    } catch {
      /* Server nicht erreichbar – dann eben der lange Link */
    }
  }
  return { url: `${base()}#r=${encodeShare(route)}`, short: false };
}

function apply(r: SharedRoute, legs?: Record<string, LegResult> | null) {
  if (legs && typeof legs === 'object') restoreLegs(legs);
  const preset = PRESETS.find((p) => p.id === r.presetId);
  useStore.setState({
    waypoints: r.waypoints,
    overrides: r.overrides ?? {},
    settings: cloneSettings(r.settings ?? preset?.settings ?? DEFAULT_SETTINGS),
    presetId: r.settings || preset ? r.presetId : null,
    routeName: r.name,
    savedId: null,
    mode: 'route',
    area: 'plan',
    selection: null,
    editingLeg: null,
    importTrack: null,
    activePoi: null,
  });
}

/**
 * Beim Start: geteilte Route aus der Adresse übernehmen. Gibt die Wegpunkte
 * zum Einpassen der Karte zurück, oder eine Fehlermeldung.
 */
export async function openSharedFromHash(): Promise<{ coords: LngLat[] } | { error: string } | null> {
  const h = readShareHash(location.hash);
  if (!h) return null;
  // Adresse aufräumen, damit Neuladen die Route nicht erneut übernimmt
  history.replaceState(null, '', base());
  if (h.kind === 'r') {
    const r = decodeShare(h.value);
    if (!r) return { error: 'Der geteilte Link ist unvollständig oder beschädigt.' };
    apply(r);
    return { coords: r.waypoints.map((w) => [w.lng, w.lat]) };
  }
  try {
    const { data } = await api<{ data: { route: unknown; legs?: Record<string, LegResult> } }>(
      `/shares/${encodeURIComponent(h.value)}`,
    );
    if (!isShared(data?.route)) return { error: 'Die geteilte Route ist beschädigt.' };
    apply(data.route, data.legs);
    return { coords: data.route.waypoints.map((w) => [w.lng, w.lat]) };
  } catch (e) {
    return { error: (e as Error).message || 'Geteilte Route nicht gefunden.' };
  }
}
