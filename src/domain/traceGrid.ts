import type { LngLat } from './geo';
import type { TraceKind } from './traces';

/**
 * Feste Kacheln für den Cache der öffentlichen GPS-Spuren: 0,1° × 0,1°
 * (in Mitteleuropa ca. 7 × 11 km) – klein genug, dass der OSM-Server sie
 * meist in wenigen Sekunden liefert.
 */
export const CELL = 0.1;

export type Bbox = [number, number, number, number];

export const cellId = (x: number, y: number) => `${x}:${y}`;

export function cellBbox(id: string): Bbox {
  const [x, y] = id.split(':').map(Number);
  // auf 6 Stellen runden, sonst entstehen Gleitkomma-Reste wie 7.199999999
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return [r(x * CELL), r(y * CELL), r((x + 1) * CELL), r((y + 1) * CELL)];
}

/** Alle Kacheln, die den Ausschnitt berühren. */
export function cellsFor(b: Bbox): string[] {
  const out: string[] = [];
  const x0 = Math.floor(b[0] / CELL);
  const x1 = Math.floor((b[2] - 1e-9) / CELL);
  const y0 = Math.floor(b[1] / CELL);
  const y1 = Math.floor((b[3] - 1e-9) / CELL);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(cellId(x, y));
  return out;
}

/** Kachel in vier Viertel teilen (für sehr dichte Gebiete). */
export function quarters(b: Bbox): Bbox[] {
  const [w, s, e, n] = b;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  return [
    [w, s, cx, cy],
    [cx, s, e, cy],
    [w, cy, cx, n],
    [cx, cy, e, n],
  ];
}

export const KINDS: TraceKind[] = ['foot', 'bike', 'fast', 'motor', 'unknown'];

/** Zusammengefasste Punkte einer Kachel: Rasterzellen von ca. 25 m mit Anzahl. */
export interface Bins {
  lng: Float32Array;
  lat: Float32Array;
  kind: Uint8Array;
  count: Uint16Array;
}

const BIN = 0.0003;

/**
 * Punkte zu Rasterzellen zusammenfassen. Gezählt wird, wie viele
 * verschiedene Spuren eine Zelle berühren – nicht wie viele Punkte.
 */
export function aggregate(points: { coord: LngLat; kind: TraceKind; trace: number }[]): Bins {
  const map = new Map<string, Set<number>>();
  for (const p of points) {
    const k = `${KINDS.indexOf(p.kind)}:${Math.floor(p.coord[0] / BIN)}:${Math.floor(p.coord[1] / BIN)}`;
    let set = map.get(k);
    if (!set) map.set(k, (set = new Set()));
    set.add(p.trace);
  }
  const n = map.size;
  const out: Bins = {
    lng: new Float32Array(n),
    lat: new Float32Array(n),
    kind: new Uint8Array(n),
    count: new Uint16Array(n),
  };
  let i = 0;
  for (const [k, traces] of map) {
    const [kind, qx, qy] = k.split(':').map(Number);
    out.lng[i] = (qx + 0.5) * BIN;
    out.lat[i] = (qy + 0.5) * BIN;
    out.kind[i] = kind;
    out.count[i] = Math.min(65535, traces.size);
    i++;
  }
  return out;
}
