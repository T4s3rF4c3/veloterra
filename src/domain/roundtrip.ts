import { cumulativeDistances, haversine, type LngLat } from './geo';
import type { LegResult, Segment } from './route';
import type { Pref, RoutingSettings, SurfaceCat } from './settings';

/** Verhältnis Rundenlänge / Suchradius bei BRouters Rundtour-Modus (gemessen ≈ 5–6). */
export const LENGTH_PER_RADIUS = 5.5;

/** Farben der Vorschläge auf Karte und in der Liste */
export const SUGGESTION_COLORS = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2'];

export type Direction = number | 'any';
export type Ranking = 'quality' | 'flat' | 'hilly' | 'wind';

export const DIRECTIONS: { label: string; deg: number }[] = [
  { label: 'N', deg: 0 },
  { label: 'NO', deg: 45 },
  { label: 'O', deg: 90 },
  { label: 'SO', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
];

/** Welche Richtungen werden für eine Anfrage ausprobiert. */
export function candidateDirections(dir: Direction): number[] {
  if (dir === 'any') return [0, 60, 120, 180, 240, 300];
  return [dir - 35, dir, dir + 35].map((d) => (d + 360) % 360);
}

const PREF_SCORE: Record<Pref, number> = { prefer: 1, neutral: 0.7, avoid: 0.3, forbid: 0 };
const PAVED: SurfaceCat[] = ['asphalt', 'concrete'];
const UNPAVED: SurfaceCat[] = ['compacted', 'gravel', 'unpaved'];

export interface RoundTripStats {
  length: number;
  ascend: number;
  /** 0..1 – wie gut passen Belag und Straßenart zu den Einstellungen */
  quality: number;
  /** 0..1 – Anteil der Strecke, der doppelt gefahren wird */
  overlap: number;
  /** 0..1 – Anteil Asphalt/Beton */
  paved: number;
  /** 0..1 – Anteil Schotter und unbefestigt */
  unpaved: number;
  /** 0..100 – Gesamtbewertung */
  score: number;
  /** km/h: um so viel weniger Gegenwind auf der zweiten Hälfte (positiv = Rückenwind heimwärts) */
  windGain?: number;
}

function segLen(dist: number[], s: Segment) {
  return dist[s.to] - dist[s.from];
}

/** Anteil der Strecke, der in beide Richtungen bzw. mehrfach befahren wird. */
export function overlapRatio(coords: LngLat[], dist: number[]): number {
  const key = (a: LngLat, b: LngLat) => {
    const ka = `${a[0].toFixed(5)},${a[1].toFixed(5)}`;
    const kb = `${b[0].toFixed(5)},${b[1].toFixed(5)}`;
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  const seen = new Map<string, number>();
  for (let i = 0; i < coords.length - 1; i++) {
    const k = key(coords[i], coords[i + 1]);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  let dup = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    if ((seen.get(key(coords[i], coords[i + 1])) ?? 0) > 1) dup += dist[i + 1] - dist[i];
  }
  const total = dist[dist.length - 1];
  return total > 0 ? dup / total : 0;
}

export function rateRoundTrip(leg: LegResult, settings: RoutingSettings, target: number): RoundTripStats {
  const dist = cumulativeDistances(leg.coords);
  const total = dist[dist.length - 1] || 1;
  let q = 0;
  let paved = 0;
  let unpaved = 0;
  for (const s of leg.segments) {
    const len = segLen(dist, s);
    q += len * (0.5 * PREF_SCORE[settings.surface[s.surface]] + 0.5 * PREF_SCORE[settings.road[s.road]]);
    if (PAVED.includes(s.surface)) paved += len;
    if (UNPAVED.includes(s.surface)) unpaved += len;
  }
  const quality = q / total;
  const overlap = overlapRatio(leg.coords, dist);
  const lengthDev = Math.min(1, Math.abs(leg.length - target) / target);
  const score = Math.round(100 * quality * Math.max(0, 1 - 1.5 * overlap) * (1 - 0.8 * lengthDev));
  return {
    length: leg.length,
    ascend: leg.ascend,
    quality,
    overlap,
    paved: paved / total,
    unpaved: unpaved / total,
    score,
  };
}

export function sortSuggestions<T extends { stats: RoundTripStats }>(list: T[], ranking: Ranking): T[] {
  const perKm = (s: RoundTripStats) => s.ascend / Math.max(1, s.length / 1000);
  // ungeeignete Vorschläge (viel doppelt / schlechte Straßen) immer nach hinten
  const usable = (s: RoundTripStats) => (s.score >= 35 ? 0 : 1);
  return [...list].sort((a, b) => {
    const u = usable(a.stats) - usable(b.stats);
    if (u) return u;
    if (ranking === 'flat') return perKm(a.stats) - perKm(b.stats);
    if (ranking === 'hilly') return perKm(b.stats) - perKm(a.stats);
    if (ranking === 'wind') return (b.stats.windGain ?? 0) - (a.stats.windGain ?? 0);
    return b.stats.score - a.stats.score;
  });
}

/** Zwei Vorschläge gelten als gleich, wenn sie fast dieselbe Strecke fahren. */
export function isSimilar(a: LegResult, b: LegResult): boolean {
  if (Math.abs(a.length - b.length) > 0.05 * a.length) return false;
  const cells = (l: LegResult) => new Set(l.coords.map((c) => `${c[0].toFixed(3)},${c[1].toFixed(3)}`));
  const ca = cells(a);
  const cb = cells(b);
  let common = 0;
  for (const c of ca) if (cb.has(c)) common++;
  return common / Math.max(ca.size, cb.size) > 0.85;
}

/**
 * Zerlegt eine Rundtour in n Etappen. Die Etappen sind exakte Teilstücke,
 * sodass sie ohne neue Server-Anfrage als Route übernommen werden können.
 */
export function splitIntoLegs(leg: LegResult, n: number): { points: LngLat[]; legs: LegResult[] } {
  const dist = cumulativeDistances(leg.coords);
  const total = dist[dist.length - 1];
  const last = leg.coords.length - 1;
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    const target = (total * k) / n;
    let i = cuts[cuts.length - 1] + 1;
    while (i < last - 1 && dist[i] < target) i++;
    if (i > cuts[cuts.length - 1] && i < last) cuts.push(i);
  }
  cuts.push(last);

  // Höhenmeter anteilig nach rohem Anstieg verteilen
  const rawGain = (a: number, b: number) => {
    let g = 0;
    for (let i = a + 1; i <= b; i++) g += Math.max(0, leg.ele[i] - leg.ele[i - 1]);
    return g;
  };
  const totalGain = rawGain(0, last) || 1;

  const legs: LegResult[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k];
    const b = cuts[k + 1];
    const segments: Segment[] = [];
    for (const s of leg.segments) {
      const from = Math.max(s.from, a);
      const to = Math.min(s.to, b);
      if (to > from) segments.push({ ...s, from: from - a, to: to - a });
    }
    let length = 0;
    for (let i = a + 1; i <= b; i++) length += haversine(leg.coords[i - 1], leg.coords[i]);
    legs.push({
      coords: leg.coords.slice(a, b + 1),
      ele: leg.ele.slice(a, b + 1),
      segments,
      length,
      ascend: (leg.ascend * rawGain(a, b)) / totalGain,
      time: (leg.time * length) / (total || 1),
      hints: (leg.hints ?? []).filter((h) => h.index > a && h.index < b).map((h) => ({ ...h, index: h.index - a })),
    });
  }
  return { points: cuts.map((i) => leg.coords[i]), legs };
}

/** Anzahl Etappen für eine Rundtour: etwa alle 10 km ein Wegpunkt. */
export function legCountFor(length: number): number {
  return Math.max(4, Math.min(10, Math.round(length / 10000)));
}
