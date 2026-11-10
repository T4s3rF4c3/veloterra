import { gradients } from './climbs';
import { haversine, type LngLat } from './geo';
import type { BikeType } from './settings';

/**
 * Persönliches Tempo aus eigenen Fahrten: Wie schnell bist du flach, bergauf
 * und bergab? Je Fahrt wird gezählt, wie viele Meter und Sekunden (ohne
 * Pausen) auf jede Steigungsklasse entfallen. Daraus schätzt Veloterra die
 * Fahrzeit neuer Routen.
 */

export interface PaceBin {
  key: string;
  label: string;
  /** Steigung in %: von (einschließlich) bis (ausschließlich) */
  min: number;
  /** typisches Tempo in km/h – füllt Klassen ohne eigene Daten */
  ref: number;
}

export const PACE_BINS: PaceBin[] = [
  { key: 'd6', label: 'Abfahrt steil', min: -Infinity, ref: 36 },
  { key: 'd2', label: 'Abfahrt', min: -6, ref: 33 },
  { key: 'flat', label: 'Flach', min: -2, ref: 26 },
  { key: 'u2', label: '2–5 %', min: 2, ref: 17 },
  { key: 'u5', label: '5–8 %', min: 5, ref: 12 },
  { key: 'u8', label: 'über 8 %', min: 8, ref: 8.5 },
];

/** Meter und Sekunden je Klasse */
export type PaceStats = Record<string, [number, number]>;

export function paceBin(grade: number): PaceBin {
  let b = PACE_BINS[0];
  for (const x of PACE_BINS) if (grade >= x.min) b = x;
  return b;
}

/** Messpunkte einer Fahrt; ele/time gleich lang wie coords, fehlend = NaN */
export interface ActivityTrack {
  coords: LngLat[];
  ele: number[];
  /** Unix-Zeit in ms */
  time: number[];
}

const WINDOW = 150;

/**
 * Tempo je Steigungsklasse aus einer Fahrt mit Zeit und Höhe. Stehzeiten
 * (unter 4 km/h oder Lücken) und GPS-Sprünge (über 90 km/h) zählen nicht.
 * null, wenn Zeit oder Höhe fehlen.
 */
export function paceFromTrack(t: ActivityTrack): PaceStats | null {
  const n = t.coords.length;
  if (n < 10) return null;
  const withTime = t.time.filter(Number.isFinite).length;
  const withEle = t.ele.filter(Number.isFinite).length;
  if (withTime < n * 0.8 || withEle < n * 0.8) return null;

  const out: PaceStats = {};
  let wd = 0;
  let wt = 0;
  let e0 = NaN;
  const flush = (e1: number) => {
    if (wd >= WINDOW * 0.6 && Number.isFinite(e0) && Number.isFinite(e1)) {
      const b = paceBin(((e1 - e0) / wd) * 100);
      const cur = out[b.key] ?? [0, 0];
      out[b.key] = [cur[0] + wd, cur[1] + wt];
    }
    wd = 0;
    wt = 0;
    e0 = e1;
  };
  for (let i = 0; i < n - 1; i++) {
    const dt = (t.time[i + 1] - t.time[i]) / 1000;
    const d = haversine(t.coords[i], t.coords[i + 1]);
    if (!Number.isFinite(e0)) e0 = t.ele[i];
    if (!(dt > 0) || !Number.isFinite(dt)) continue;
    const v = d / dt;
    // Pause oder Lücke: Fenster abschließen und neu beginnen
    if (v < 1.1 || v > 25 || dt > 60) {
      flush(t.ele[i]);
      e0 = t.ele[i + 1];
      continue;
    }
    wd += d;
    wt += dt;
    if (wd >= WINDOW) flush(t.ele[i + 1]);
  }
  for (const k of Object.keys(out)) out[k] = [Math.round(out[k][0]), Math.round(out[k][1])];
  const total = Object.values(out).reduce((a, [m]) => a + m, 0);
  return total >= 2000 ? out : null;
}

/** Fahrtart aus dem Strava-Aktivitätstyp */
export function rideKind(type: string | undefined): string | undefined {
  if (!type) return undefined;
  const t = type.toLowerCase();
  if (/e-?bike|e-?mountain|pedelec/.test(t)) return 'ebike';
  if (/gravel/.test(t)) return 'gravel';
  if (/mountain|mtb/.test(t)) return 'mtb';
  return 'ride';
}

/** Passende Fahrtarten zum gewählten Radtyp */
const KINDS: Record<BikeType, string[]> = {
  road: ['ride'],
  gravel: ['gravel'],
  mtb: ['mtb'],
  trekking: ['ride', 'gravel'],
};

export interface PersonalPace {
  /** km/h je Klasse */
  speeds: Record<string, number>;
  /** Klasse aus eigenen Fahrten (sonst aus dem Flach-Tempo abgeleitet) */
  measured: Record<string, boolean>;
  rides: number;
  km: number;
  /** nur Fahrten mit passendem Radtyp */
  matched: boolean;
}

interface PaceSource {
  pace?: PaceStats;
  kind?: string;
  start?: number;
}

const MAX_RIDES = 60;
const MIN_BIN_M = 3000;

/**
 * Tempo aus den letzten Fahrten (höchstens 60). Gibt es genug Fahrten mit
 * dem gewählten Radtyp, zählen nur diese. E-Bike-Fahrten zählen nie.
 */
export function personalPace(tracks: PaceSource[], bike: BikeType): PersonalPace | null {
  const usable = tracks.filter((t) => t.pace && t.kind !== 'ebike');
  const kinds = KINDS[bike] ?? [];
  const same = usable.filter((t) => t.kind && kinds.includes(t.kind));
  const matched = same.length >= 5;
  const pick = (matched ? same : usable).sort((a, b) => (b.start ?? 0) - (a.start ?? 0)).slice(0, MAX_RIDES);
  const sum: PaceStats = {};
  for (const t of pick)
    for (const [k, [m, s]] of Object.entries(t.pace!)) {
      const cur = sum[k] ?? [0, 0];
      sum[k] = [cur[0] + m, cur[1] + s];
    }
  const flat = sum.flat;
  if (!flat || flat[0] < 5000) return null;
  const flatSpeed = (flat[0] / flat[1]) * 3.6;
  const ratio = flatSpeed / PACE_BINS.find((b) => b.key === 'flat')!.ref;
  const speeds: Record<string, number> = {};
  const measured: Record<string, boolean> = {};
  for (const b of PACE_BINS) {
    const v = sum[b.key];
    measured[b.key] = !!v && v[0] >= MIN_BIN_M && v[1] > 0;
    speeds[b.key] = measured[b.key] ? (v[0] / v[1]) * 3.6 : b.ref * ratio;
  }
  const km = Object.values(sum).reduce((a, [m]) => a + m, 0) / 1000;
  return { speeds, measured, rides: pick.length, km, matched };
}

/** Fahrzeit in Sekunden für ein Höhenprofil mit dem persönlichen Tempo */
export function estimateTime(dist: number[], ele: number[], pace: PersonalPace): number {
  if (dist.length < 2) return 0;
  const g = gradients(dist, ele);
  let s = 0;
  for (let i = 0; i < dist.length - 1; i++) {
    const kmh = pace.speeds[paceBin((g[i] + g[i + 1]) / 2).key];
    s += (dist[i + 1] - dist[i]) / (Math.max(3, kmh) / 3.6);
  }
  return s;
}
