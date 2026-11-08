import { classifyRoad, classifySurface, parseWayTags, type Tags } from './classify';
import { cumulativeDistances, type LngLat } from './geo';
import type { RoadCat, RoutingSettings, SurfaceCat } from './settings';

export interface Waypoint {
  id: string;
  lng: number;
  lat: number;
}

/** Kreisförmige Sperrzone, wie BRouter sie als `nogos` erwartet. */
export interface Nogo {
  lng: number;
  lat: number;
  radius: number;
}

/** Dauerhaft gesperrter Abschnitt (gilt für alle Routen). */
export interface Block {
  id: string;
  label: string;
  line: LngLat[];
  nogos: Nogo[];
}

/** Abweichende Planung für eine Etappe zwischen zwei Wegpunkten. */
export interface LegOverride {
  settings?: RoutingSettings;
  presetLabel?: string;
  avoid?: { line: LngLat[]; nogos: Nogo[] }[];
  alternative?: number;
}

export const legKey = (from: Waypoint, to: Waypoint) => `${from.id}>${to.id}`;

export interface Segment {
  /** Index in coords, an dem der Abschnitt beginnt */
  from: number;
  /** Index in coords, an dem der Abschnitt endet */
  to: number;
  tags: Tags;
  surface: SurfaceCat;
  surfaceInferred: boolean;
  road: RoadCat;
}

/** Abbiegehinweis von BRouter (voicehints). */
export interface TurnHint {
  /** Index in coords */
  index: number;
  /** BRouter-Kommando (1 = geradeaus, 2 = links, 5 = rechts, 14 = Kreisverkehr …) */
  cmd: number;
  /** Ausfahrt im Kreisverkehr */
  exit: number;
  /** Abbiegewinkel in Grad (negativ = links) */
  angle: number;
}

export interface LegResult {
  coords: LngLat[];
  ele: number[];
  segments: Segment[];
  length: number;
  ascend: number;
  time: number;
  hints?: TurnHint[];
}

interface BRouterFeature {
  geometry: { coordinates: number[][] };
  properties: {
    'track-length': string;
    'filtered ascend': string;
    'total-time': string;
    messages: string[][];
    voicehints?: number[][];
  };
}

/** Wandelt die BRouter-GeoJSON-Antwort in Koordinaten + klassifizierte Abschnitte um. */
export function parseBRouter(json: { features: BRouterFeature[] }): LegResult {
  const f = json.features[0];
  const raw = f.geometry.coordinates;
  const coords: LngLat[] = raw.map((c) => [c[0], c[1]]);
  const ele = raw.map((c) => c[2] ?? 0);
  const msgs = f.properties.messages;
  const header = msgs[0];
  const iLon = header.indexOf('Longitude');
  const iLat = header.indexOf('Latitude');
  const iTags = header.indexOf('WayTags');

  const segments: Segment[] = [];
  let gi = 0;
  let start = 0;
  for (let m = 1; m < msgs.length; m++) {
    const lon = Number(msgs[m][iLon]);
    const lat = Number(msgs[m][iLat]);
    // passenden Geometriepunkt suchen (Mikrograd)
    let found = -1;
    for (let j = gi; j < raw.length; j++) {
      if (Math.round(raw[j][0] * 1e6) === lon && Math.round(raw[j][1] * 1e6) === lat) {
        found = j;
        break;
      }
    }
    if (found < 0) continue;
    const tags = parseWayTags(msgs[m][iTags] ?? '');
    const s = classifySurface(tags);
    const seg: Segment = {
      from: start,
      to: found,
      tags,
      surface: s.cat,
      surfaceInferred: s.inferred,
      road: classifyRoad(tags),
    };
    if (seg.to > seg.from) segments.push(seg);
    start = found;
    gi = found;
  }
  // Rest bis zum Ende (falls die letzte Nachricht vorher endet)
  if (start < coords.length - 1 && segments.length) {
    const last = segments[segments.length - 1];
    segments.push({ ...last, from: start, to: coords.length - 1 });
  }

  return {
    coords,
    ele,
    segments,
    length: Number(f.properties['track-length']),
    ascend: Number(f.properties['filtered ascend']),
    time: Number(f.properties['total-time']),
    hints: (f.properties.voicehints ?? []).map((v) => ({
      index: Number(v[0]),
      cmd: Number(v[1]),
      exit: Number(v[2]) || 0,
      angle: Number(v[4]) || 0,
    })),
  };
}

/** Gesamte Route aus allen Etappen. */
export interface CombinedRoute {
  coords: LngLat[];
  ele: number[];
  dist: number[];
  segments: Segment[];
  /** Für jede Etappe: Start-/Endindex in coords */
  legRanges: { key: string; from: number; to: number }[];
  hints: TurnHint[];
  length: number;
  ascend: number;
  time: number;
}

export function combineLegs(legs: { key: string; result: LegResult }[]): CombinedRoute | null {
  if (!legs.length) return null;
  const coords: LngLat[] = [];
  const ele: number[] = [];
  const segments: Segment[] = [];
  const legRanges: CombinedRoute['legRanges'] = [];
  const hints: TurnHint[] = [];
  let length = 0;
  let ascend = 0;
  let time = 0;
  for (const { key, result } of legs) {
    // gemeinsamen Punkt zwischen Etappen nur einmal aufnehmen
    const offset = coords.length === 0 ? 0 : coords.length - 1;
    const skip = coords.length === 0 ? 0 : 1;
    for (let i = skip; i < result.coords.length; i++) {
      coords.push(result.coords[i]);
      ele.push(result.ele[i]);
    }
    for (const s of result.segments) segments.push({ ...s, from: s.from + offset, to: s.to + offset });
    for (const h of result.hints ?? []) if (h.index > 0 || offset === 0) hints.push({ ...h, index: h.index + offset });
    legRanges.push({ key, from: offset, to: offset + result.coords.length - 1 });
    length += result.length;
    ascend += result.ascend;
    time += result.time;
  }
  return { coords, ele, dist: cumulativeDistances(coords), segments, legRanges, hints, length, ascend, time };
}

export type Breakdown<K extends string> = Partial<Record<K, number>>;

export function breakdown(route: CombinedRoute): { surface: Breakdown<SurfaceCat>; road: Breakdown<RoadCat> } {
  const surface: Breakdown<SurfaceCat> = {};
  const road: Breakdown<RoadCat> = {};
  for (const s of route.segments) {
    const len = route.dist[s.to] - route.dist[s.from];
    surface[s.surface] = (surface[s.surface] ?? 0) + len;
    road[s.road] = (road[s.road] ?? 0) + len;
  }
  return { surface, road };
}

/** Kreis-Sperrzonen entlang einer Linie, an den Enden etwas Abstand lassen. */
export function nogosAlongLine(line: LngLat[], dist: number[], opts = { spacing: 35, radius: 18, margin: 25 }): Nogo[] {
  const total = dist[dist.length - 1];
  const out: Nogo[] = [];
  const startD = Math.min(opts.margin, total / 2);
  const endD = Math.max(total - opts.margin, total / 2);
  for (let d = startD; d <= endD + 0.1; d += opts.spacing) {
    out.push({ ...pointOnPolyline(line, dist, d), radius: opts.radius });
  }
  if (!out.length) out.push({ ...pointOnPolyline(line, dist, total / 2), radius: opts.radius });
  return out;
}

function pointOnPolyline(line: LngLat[], dist: number[], d: number): { lng: number; lat: number } {
  for (let i = 1; i < line.length; i++) {
    if (dist[i] >= d) {
      const seg = dist[i] - dist[i - 1];
      const t = seg > 0 ? (d - dist[i - 1]) / seg : 0;
      return {
        lng: line[i - 1][0] + t * (line[i][0] - line[i - 1][0]),
        lat: line[i - 1][1] + t * (line[i][1] - line[i - 1][1]),
      };
    }
  }
  const l = line[line.length - 1];
  return { lng: l[0], lat: l[1] };
}

/**
 * Exaktes Teilstück der Route zwischen den Koordinaten-Indizes i0 und i1 als
 * eigene Etappe – so bleibt ein Stück beim Umplanen unverändert und braucht
 * keine neue Server-Anfrage.
 */
export function sliceRoute(route: CombinedRoute, i0: number, i1: number): LegResult {
  const length = route.dist[i1] - route.dist[i0];
  const total = route.dist[route.dist.length - 1] || 1;
  const rawGain = (a: number, b: number) => {
    let g = 0;
    for (let i = a + 1; i <= b; i++) g += Math.max(0, route.ele[i] - route.ele[i - 1]);
    return g;
  };
  const allGain = rawGain(0, route.ele.length - 1) || 1;
  const segments: Segment[] = [];
  for (const s of route.segments) {
    const from = Math.max(s.from, i0);
    const to = Math.min(s.to, i1);
    if (to > from) segments.push({ ...s, from: from - i0, to: to - i0 });
  }
  return {
    coords: route.coords.slice(i0, i1 + 1),
    ele: route.ele.slice(i0, i1 + 1),
    segments,
    length,
    ascend: (route.ascend * rawGain(i0, i1)) / allGain,
    time: (route.time * length) / total,
    hints: route.hints.filter((h) => h.index > i0 && h.index < i1).map((h) => ({ ...h, index: h.index - i0 })),
  };
}

/**
 * Index des Routenpunkts nahe der Distanz d, der mindestens `margin` Meter von
 * lo und hi entfernt liegt – sonst null (dann lohnt kein Ankerpunkt).
 */
export function anchorIndex(route: CombinedRoute, d: number, lo: number, hi: number, margin = 150): number | null {
  const { dist } = route;
  if (d - dist[lo] < margin || dist[hi] - d < margin) return null;
  let a = lo;
  let b = hi;
  while (b - a > 1) {
    const mid = (a + b) >> 1;
    if (dist[mid] <= d) a = mid;
    else b = mid;
  }
  const i = d - dist[a] <= dist[b] - d ? a : b;
  return i > lo && i < hi ? i : null;
}
