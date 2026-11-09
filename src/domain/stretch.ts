import { HIGHWAY_LABEL } from './classify';
import type { CombinedRoute, Segment } from './route';
import { ROADS, SURFACES, type RoadCat, type SurfaceCat } from './settings';

/** Zusammenhängendes Stück der Route mit gleichem Belag und gleicher Straßenart. */
export interface Stretch {
  /** Meter ab Start */
  start: number;
  end: number;
  surface: SurfaceCat;
  road: RoadCat;
  /** Belag nur abgeleitet (nicht in OSM erfasst) */
  surfaceInferred: boolean;
  /** Abschnitt direkt an der Stelle (für Details) */
  segment: Segment;
}

/** Index des Abschnitts, in dem die Distanz d liegt (binäre Suche). */
function segmentIndexAt(route: CombinedRoute, d: number): number {
  const segs = route.segments;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.dist[segs[mid].to] < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function stretchAt(route: CombinedRoute, d: number): Stretch | null {
  const segs = route.segments;
  if (!segs.length) return null;
  const i = segmentIndexAt(route, d);
  const s = segs[i];
  const same = (x: Segment) => x.surface === s.surface && x.road === s.road;
  let a = i;
  let b = i;
  while (a > 0 && same(segs[a - 1])) a--;
  while (b < segs.length - 1 && same(segs[b + 1])) b++;
  return {
    start: route.dist[segs[a].from],
    end: route.dist[segs[b].to],
    surface: s.surface,
    road: s.road,
    surfaceInferred: segs.slice(a, b + 1).some((x) => x.surfaceInferred),
    segment: s,
  };
}

/** Höhe an der Stelle d (linear interpoliert). */
export function eleAt(route: CombinedRoute, d: number): number {
  const { dist, ele } = route;
  if (d <= 0) return ele[0];
  const last = dist.length - 1;
  if (d >= dist[last]) return ele[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - dist[lo]) / (dist[hi] - dist[lo] || 1);
  return ele[lo] + t * (ele[hi] - ele[lo]);
}

/** Steigung in % an der Stelle d (über ±75 m gemittelt). */
export function gradeAt(route: CombinedRoute, d: number): number {
  const total = route.dist[route.dist.length - 1];
  const a = Math.max(0, d - 75);
  const b = Math.min(total, d + 75);
  return b - a > 20 ? ((eleAt(route, b) - eleAt(route, a)) / (b - a)) * 100 : 0;
}

export const surfaceLabel = (k: SurfaceCat) => SURFACES.find((x) => x.key === k)?.label ?? k;
export const roadLabel = (k: RoadCat) => ROADS.find((x) => x.key === k)?.label ?? k;
export const surfaceColor = (k: SurfaceCat) => SURFACES.find((x) => x.key === k)?.color ?? '#adb5bd';
export const roadColor = (k: RoadCat) => ROADS.find((x) => x.key === k)?.color ?? '#adb5bd';

const SMOOTHNESS: Record<string, string> = {
  excellent: 'sehr glatt',
  good: 'glatt',
  intermediate: 'mittel',
  bad: 'holprig',
  very_bad: 'sehr holprig',
  horrible: 'kaum fahrbar',
};

/** Zusatzinfos zum Weg aus den OSM-Tags, z. B. „Wirtschaftsweg · Klasse 2 · holprig“. */
export function wayDetails(s: Segment): string[] {
  const t = s.tags;
  const out: string[] = [];
  if (t.highway && HIGHWAY_LABEL[t.highway]) out.push(HIGHWAY_LABEL[t.highway]);
  if (t.tracktype) out.push(`Wegeklasse ${t.tracktype.replace('grade', '')}`);
  if (t.smoothness && SMOOTHNESS[t.smoothness]) out.push(`Fahrbahn ${SMOOTHNESS[t.smoothness]}`);
  if (t.maxspeed && /^\d+$/.test(t.maxspeed)) out.push(`${t.maxspeed} km/h`);
  if (t.bicycle_road === 'yes') out.push('Fahrradstraße');
  if (t['mtb:scale']) out.push(`MTB S${t['mtb:scale']}`);
  return out;
}
