import { formatKmExact, type LngLat } from '../domain/geo';
import type { CombinedRoute, LegResult } from '../domain/route';
import { BIKE_TYPES, PRESETS, DEFAULT_SETTINGS, cloneSettings } from '../domain/settings';
import { shareImage } from './routeImage';
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
  /** Vorschaubild, wie es Messenger zeigen (Objekt-URL) */
  image?: string;
}

const base = () => `${location.origin}/`;

const blobToBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/**
 * Link erzeugen: angemeldet als kurzer Link über den Server (passt gut in
 * einen QR-Code, Etappen bleiben exakt), sonst steckt die Route im Link.
 */
export async function createShareLink(planned: CombinedRoute | null): Promise<ShareLink> {
  const route = currentShare();
  if (useSite.getState().user) {
    try {
      const bike = BIKE_TYPES.find((b) => b.key === (useStore.getState().settings.bike ?? 'road'))?.label;
      const km = planned ? `${formatKmExact(planned.length)} km` : '';
      const title = route.name || (planned ? `Route ${km}` : 'Route');
      const description = planned
        ? [km, `${Math.round(planned.ascend)} hm`, bike].filter(Boolean).join(' · ')
        : 'Geplant mit Veloterra';
      // Vorschaubild für Messenger (Luftbild, Strecke, Name)
      const img = planned ? await shareImage(planned.coords, title, description).catch(() => null) : null;
      const { id } = await api<{ id: string }>('/shares', {
        method: 'POST',
        body: JSON.stringify({
          data: { route, legs: snapshotLegs(), meta: { title, description } },
          image: img ? await blobToBase64(img) : undefined,
        }),
      });
      return { url: `${base()}s/${id}`, short: true, image: img ? URL.createObjectURL(img) : undefined };
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
  // kurzer Link /s/<id> ohne Weiterleitung durch den Server (z. B. im Entwicklungsbetrieb)
  const path = location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  const h = path ? { kind: 's' as const, value: path[1] } : readShareHash(location.hash);
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
