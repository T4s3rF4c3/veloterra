import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { LegOverride, Waypoint } from './route';
import type { RoutingSettings } from './settings';

/**
 * Route als Link teilen: Wegpunkte, Einstellungen und Anpassungen je Etappe
 * werden komprimiert in den #-Teil der Adresse geschrieben. Der #-Teil geht
 * nie an einen Server – die Route bleibt zwischen dir und dem Empfänger.
 */
export interface SharedRoute {
  v: 1;
  name: string;
  waypoints: Waypoint[];
  presetId: string | null;
  /** fehlt, wenn es genau die Einstellungen der Vorlage sind */
  settings?: RoutingSettings;
  overrides?: Record<string, LegOverride>;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

const toBase64Url = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encodeShare(r: SharedRoute): string {
  const compact: SharedRoute = {
    ...r,
    waypoints: r.waypoints.map((w) => ({ id: w.id, lng: round(w.lng), lat: round(w.lat) })),
  };
  if (compact.overrides && !Object.keys(compact.overrides).length) delete compact.overrides;
  return toBase64Url(deflateSync(strToU8(JSON.stringify(compact)), { level: 9 }));
}

/** null bei kaputtem oder fremdem Inhalt */
export function decodeShare(s: string): SharedRoute | null {
  try {
    const r = JSON.parse(strFromU8(inflateSync(fromBase64Url(s)))) as SharedRoute;
    return isShared(r) ? r : null;
  } catch {
    return null;
  }
}

export function isShared(r: unknown): r is SharedRoute {
  const x = r as SharedRoute;
  return (
    !!x &&
    x.v === 1 &&
    typeof x.name === 'string' &&
    Array.isArray(x.waypoints) &&
    x.waypoints.length >= 2 &&
    x.waypoints.length <= 200 &&
    x.waypoints.every(
      (w) =>
        typeof w?.id === 'string' &&
        Number.isFinite(w.lng) &&
        Number.isFinite(w.lat) &&
        Math.abs(w.lng) <= 180 &&
        Math.abs(w.lat) <= 90,
    )
  );
}

/** Teil der Adresse nach #: r = Route im Link, s = kurzer Link vom Server */
export function readShareHash(hash: string): { kind: 'r' | 's'; value: string } | null {
  const m = hash.match(/^#([rs])=([A-Za-z0-9_-]+)$/);
  return m ? { kind: m[1] as 'r' | 's', value: m[2] } : null;
}
