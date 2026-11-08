import { haversine, type LngLat } from '../domain/geo';

/**
 * Beschilderte Rad- und MTB-Routen aus OpenStreetMap über Waymarked Trails
 * (https://waymarkedtrails.org, frei nutzbar, Daten © OSM-Mitwirkende).
 */
export type NetworkKind = 'cycling' | 'mtb';

/** Netz-Ebene: international, national, regional, lokal */
export type NetworkGroup = 'INT' | 'NAT' | 'REG' | 'LOC';

export const GROUP_LABEL: Record<NetworkGroup, string> = {
  INT: 'International',
  NAT: 'National',
  REG: 'Regional',
  LOC: 'Lokal',
};

export interface NetRoute {
  id: number;
  kind: NetworkKind;
  name: string;
  ref?: string;
  group: NetworkGroup;
  symbolId?: string;
}

export interface NetRouteDetails extends NetRoute {
  /** offizielle Länge laut Beschilderung (m) */
  officialLength?: number;
  /** Länge des Verlaufs in OSM (m) */
  length?: number;
  description?: string;
  website?: string;
  wikipedia?: { lang: string; title: string };
  /** alle Wege der Route (auch Varianten) zum Anzeigen */
  lines: LngLat[][];
  /** Hauptverlauf am Stück, für „Als Route übernehmen“ */
  path: LngLat[];
  bbox: [number, number, number, number];
}

const api = (kind: NetworkKind) => `https://${kind}.waymarkedtrails.org/api/v1`;

export const tileUrl = (kind: NetworkKind) => `https://tile.waymarkedtrails.org/${kind}/{z}/{x}/{y}.png`;
export const symbolUrl = (kind: NetworkKind, id: string) => `${api(kind)}/symbols/id/${encodeURIComponent(id)}.svg`;
export const routeLink = (kind: NetworkKind, id: number) =>
  `https://${kind}.waymarkedtrails.org/#route?id=${id}&type=relation`;

// Waymarked Trails rechnet in Web-Mercator (EPSG:3857)
const R = 6378137;
const toMerc = ([lng, lat]: LngLat): [number, number] => [
  (lng * Math.PI * R) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
const fromMerc = ([x, y]: number[]): LngLat => [
  (x / R) * (180 / Math.PI),
  (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
];

const GROUPS: NetworkGroup[] = ['INT', 'NAT', 'REG', 'LOC'];
const asGroup = (g: string): NetworkGroup => (GROUPS.includes(g as NetworkGroup) ? (g as NetworkGroup) : 'LOC');

interface ApiRoute {
  id: number;
  name?: string;
  ref?: string;
  group: string;
  symbol_id?: string;
}

/** Routen in einem Kartenausschnitt [west, süd, ost, nord]. */
export async function listByArea(
  kind: NetworkKind,
  bbox: [number, number, number, number],
  signal?: AbortSignal,
  limit = 60,
): Promise<NetRoute[]> {
  const [x1, y1] = toMerc([bbox[0], bbox[1]]);
  const [x2, y2] = toMerc([bbox[2], bbox[3]]);
  const q = [x1, y1, x2, y2].map((v) => v.toFixed(0)).join(',');
  const res = await fetch(`${api(kind)}/list/by_area?bbox=${q}&limit=${limit}`, { signal });
  if (!res.ok) throw new Error('Radrouten konnten nicht geladen werden.');
  const json = (await res.json()) as { results: ApiRoute[] };
  return json.results.map((r) => ({
    id: r.id,
    kind,
    name: r.name || r.ref || 'Ohne Namen',
    ref: r.ref,
    group: asGroup(r.group),
    symbolId: r.symbol_id,
  }));
}

interface ApiWay {
  geometry?: { type: string; coordinates: number[][] };
}
interface ApiNode {
  route_type?: string;
  ways?: ApiWay[];
  main?: ApiNode[];
  forward?: ApiNode[];
  appendices?: ApiNode[];
}

/** Wege eines Abschnitts in Reihenfolge (bei Verzweigungen die Hinrichtung). */
function collect(node: ApiNode, out: LngLat[][]) {
  for (const w of node.ways ?? []) {
    if (w.geometry?.type === 'LineString') out.push(w.geometry.coordinates.map(fromMerc));
  }
  for (const c of node.main ?? []) collect(c, out);
  for (const c of node.forward ?? []) collect(c, out);
}

/**
 * Hängt Wegstücke zu einem durchgehenden Verlauf aneinander. Jedes Stück wird
 * so gedreht, dass es am Ende des vorigen beginnt; Lücken werden überbrückt
 * (das Routing füllt sie später).
 */
export function chainSegments(segments: LngLat[][]): LngLat[] {
  const out: LngLat[] = [];
  let count = 0;
  for (const seg of segments) {
    if (seg.length < 2) continue;
    if (!out.length) {
      out.push(...seg);
      count = 1;
      continue;
    }
    const near = (p: LngLat) => Math.min(haversine(p, seg[0]), haversine(p, seg[seg.length - 1]));
    // beim zweiten Stück entscheidet sich, in welche Richtung das erste läuft
    if (count === 1 && near(out[0]) < near(out[out.length - 1])) out.reverse();
    const end = out[out.length - 1];
    const s = haversine(end, seg[0]) <= haversine(end, seg[seg.length - 1]) ? seg : [...seg].reverse();
    out.push(...(haversine(end, s[0]) < 1 ? s.slice(1) : s));
    count++;
  }
  return out;
}

const cache = new Map<string, Promise<NetRouteDetails>>();

export function routeDetails(r: NetRoute): Promise<NetRouteDetails> {
  const key = `${r.kind}/${r.id}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${api(r.kind)}/details/relation/${r.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Details der Route nicht verfügbar.');
        return res.json();
      })
      .then((d) => {
        const main: LngLat[][] = [];
        collect(d.route ?? {}, main);
        const extra: LngLat[][] = [];
        for (const a of d.route?.appendices ?? []) collect(a, extra);
        const [x1, y1, x2, y2] = d.bbox ?? [0, 0, 0, 0];
        const [w, s] = fromMerc([x1, y1]);
        const [e, n] = fromMerc([x2, y2]);
        const wp = d.wikipedia && Object.entries(d.wikipedia as Record<string, string>)[0];
        return {
          ...r,
          officialLength: d.official_length ?? undefined,
          length: d.route?.length ?? undefined,
          description: d.description ?? d.tags?.description,
          website: /^https?:\/\//i.test(d.url ?? '') ? d.url : undefined,
          wikipedia: wp ? { lang: wp[0], title: wp[1] } : undefined,
          lines: [...main, ...extra],
          path: chainSegments(main),
          bbox: [w, s, e, n] as [number, number, number, number],
        };
      });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Größtes zusammenhängendes Stück des Verlaufs innerhalb eines Ausschnitts. */
export function clipToBounds(path: LngLat[], b: [number, number, number, number]): LngLat[] {
  const inside = (p: LngLat) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  let best: LngLat[] = [];
  let cur: LngLat[] = [];
  for (const p of path) {
    if (inside(p)) cur.push(p);
    else {
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  }
  return cur.length > best.length ? cur : best;
}
