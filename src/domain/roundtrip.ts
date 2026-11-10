import { cumulativeDistances, haversine, type LngLat } from './geo';
import type { LegResult, Segment } from './route';
import type { Pref, RoutingSettings, SurfaceCat } from './settings';

/** Verhältnis Rundenlänge / Suchradius bei BRouters Rundtour-Modus (gemessen ≈ 5–6). */
export const LENGTH_PER_RADIUS = 5.5;

/** Farben der Vorschläge auf Karte und in der Liste */
export const SUGGESTION_COLORS = ['#4dabf7', '#f783ac', '#63e6be', '#ffa94d', '#ffd43b', '#66d9e8'];

export type Direction = number | 'any';
export type Ranking = 'quality' | 'flat' | 'hilly' | 'wind' | 'novel';
export type Climb = 'any' | 'low' | 'high';

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

/**
 * Welche Richtungen werden für eine Anfrage ausprobiert. Mit Höhenmeter-
 * Wunsch mehr, damit genug flache (bzw. bergige) Runden dabei sind.
 */
export function candidateDirections(dir: Direction, more = false): number[] {
  if (dir === 'any') return more ? [0, 45, 90, 135, 180, 225, 270, 315] : [0, 60, 120, 180, 240, 300];
  return (more ? [-50, -25, 0, 25, 50] : [-35, 0, 35]).map((d) => (dir + d + 360) % 360);
}

/**
 * Einstellungen für die Rundtour-Suche: „möglichst wenig“ oder ein Limit
 * verschärft die Steigungs-Strafe von BRouter, „gern viel“ lässt sie weg.
 */
export function roundTripSettings(s: RoutingSettings, climb: Climb, maxAscend: number): RoutingSettings {
  if (climb === 'low') return { ...s, hills: 'max' };
  if (climb === 'high') return { ...s, hills: 'ignore' };
  if (maxAscend > 0 && (s.hills === 'ignore' || s.hills === 'moderate')) return { ...s, hills: 'strong' };
  return s;
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
  /** 0..1 – Anteil, den man laut eigener Heatmap noch nie gefahren ist */
  novelty?: number;
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

/** Höhenmeter je km */
export const ascendPerKm = (s: { ascend: number; length: number }) => s.ascend / Math.max(1, s.length / 1000);

export function sortSuggestions<T extends { stats: RoundTripStats }>(list: T[], ranking: Ranking, maxAscend = 0): T[] {
  const perKm = ascendPerKm;
  // über dem Höhenmeter-Limit, dann ungeeignete Vorschläge (viel doppelt / schlechte Straßen) nach hinten
  const over = (s: RoundTripStats) => (maxAscend > 0 && s.ascend > maxAscend ? 1 : 0);
  const usable = (s: RoundTripStats) => (s.score >= 35 ? 0 : 1);
  return [...list].sort((a, b) => {
    const o = over(a.stats) - over(b.stats);
    if (o) return o;
    const u = usable(a.stats) - usable(b.stats);
    if (u) return u;
    if (ranking === 'flat') return perKm(a.stats) - perKm(b.stats);
    if (ranking === 'hilly') return perKm(b.stats) - perKm(a.stats);
    if (ranking === 'wind') return (b.stats.windGain ?? 0) - (a.stats.windGain ?? 0);
    if (ranking === 'novel') return (b.stats.novelty ?? 0) - (a.stats.novelty ?? 0);
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

/**
 * Eine Schleife am Ende eines Hin-und-zurück-Stücks zählt als Wendeschleife,
 * wenn sie höchstens doppelt so lang ist wie der gemeinsame Weg (max. 3 km) –
 * sonst ist es eine echte Runde, die nur ein Stück gemeinsam hat.
 */
const MAX_TURN_LOOP = 3000;
const TURN_LOOP_FACTOR = 2;

/**
 * Findet Stichstraßen: Die Route fährt ein Stück und auf demselben Weg wieder
 * zurück – direkt gewendet oder über eine kurze Wendeschleife (Kreisverkehr,
 * um den Block). Liefert Indexbereiche [a, b] mit coords[a] = coords[b]; alles
 * dazwischen ist Hin, Wenden und Zurück.
 */
export function findSpurs(coords: LngLat[]): [number, number][] {
  // aufeinanderfolgende doppelte Punkte zusammenfassen (Wendepunkt kann doppelt vorkommen)
  const idx: number[] = [];
  const key = (i: number) => `${coords[i][0].toFixed(6)},${coords[i][1].toFixed(6)}`;
  for (let i = 0; i < coords.length; i++) if (!idx.length || key(idx[idx.length - 1]) !== key(i)) idx.push(i);
  const n = idx.length;
  const k = idx.map((i) => key(i));
  const dist = cumulativeDistances(idx.map((i) => coords[i]));
  // gerichtete Kanten → Positionen
  const edges = new Map<string, number[]>();
  for (let j = 0; j < n - 1; j++) {
    const e = `${k[j]}>${k[j + 1]}`;
    const list = edges.get(e);
    if (list) list.push(j);
    else edges.set(e, [j]);
  }
  const out: [number, number][] = [];
  let i = 0;
  while (i < n - 1) {
    // dieselbe Kante später in Gegenrichtung?
    const back = (edges.get(`${k[i + 1]}>${k[i]}`) ?? []).find((j) => j > i);
    if (back === undefined) {
      i++;
      continue;
    }
    // nach außen erweitern: wie lange laufen Hin- und Rückweg gemeinsam?
    let a = i;
    let b = back + 1;
    while (a > 0 && b < n - 1 && k[a - 1] === k[b + 1]) {
      a--;
      b++;
    }
    // nach innen: wo beginnt die Wendeschleife?
    let c = i + 1;
    let d = back;
    while (c + 1 < d - 1 && k[c + 1] === k[d - 1]) {
      c++;
      d--;
    }
    const run = dist[c] - dist[a];
    const turn = dist[d] - dist[c];
    // nur echte Stichstraßen: Wendeschleife kurz (sonst ist es eine Runde mit gemeinsamem Stück)
    const prevEnd = out.length ? idx.indexOf(out[out.length - 1][1]) : 0;
    if (turn <= Math.min(MAX_TURN_LOOP, Math.max(run * TURN_LOOP_FACTOR, 100)) && a >= prevEnd) {
      out.push([idx[a], idx[b]]);
      i = b;
    } else {
      i++;
    }
  }
  return out;
}

/** Schneidet die Bereiche (a, b] aus einer Etappe heraus; Abschnitte und Hinweise werden umgerechnet. */
function cutRanges(leg: LegResult, cuts: [number, number][]): LegResult {
  const keep: [number, number][] = [];
  let start = 0;
  for (const [a, b] of cuts) {
    keep.push([start, a]);
    start = b + 1;
  }
  keep.push([start, leg.coords.length - 1]);
  const map = new Map<number, number>();
  const coords: LngLat[] = [];
  const ele: number[] = [];
  for (const [a, b] of keep) {
    for (let i = a; i <= b; i++) {
      map.set(i, coords.length);
      coords.push(leg.coords[i]);
      ele.push(leg.ele[i]);
    }
  }
  // Abschnitt eines herausgeschnittenen Bereichs: auf den Schnittpunkt zusammenziehen
  const newIndex = (i: number) => {
    if (map.has(i)) return map.get(i)!;
    let best = 0;
    for (const [old, n] of map) if (old <= i) best = Math.max(best, n);
    return best;
  };
  const segments: Segment[] = [];
  for (const s of leg.segments) {
    const from = newIndex(s.from);
    const to = newIndex(s.to);
    if (to > from) {
      const last = segments[segments.length - 1];
      if (last && last.to > from) continue;
      segments.push({ ...s, from, to });
    }
  }
  const dist = cumulativeDistances(coords);
  const length = dist[dist.length - 1];
  const oldLen = cumulativeDistances(leg.coords);
  const ratio = length / (oldLen[oldLen.length - 1] || 1);
  return {
    coords,
    ele,
    segments,
    length,
    ascend: leg.ascend * ratio,
    time: leg.time * ratio,
    hints: (leg.hints ?? []).filter((h) => map.has(h.index)).map((h) => ({ ...h, index: map.get(h.index)! })),
  };
}

/** Rundtour ohne Stichstraßen (hin und auf demselben Weg zurück). */
export function removeSpurs(leg: LegResult): LegResult {
  let cur = leg;
  // nach dem Herausschneiden können neue Wendepunkte entstehen → wiederholen
  for (let round = 0; round < 5; round++) {
    const spurs = findSpurs(cur.coords);
    if (!spurs.length) break;
    cur = cutRanges(cur, spurs);
  }
  return cur;
}
