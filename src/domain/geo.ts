export type LngLat = [number, number];

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Kurswinkel von a nach b in Grad (0 = Nord, 90 = Ost). */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Zielpunkt von p aus in Richtung brg (Grad) nach d Metern. */
export function destination(p: LngLat, brg: number, d: number): LngLat {
  const δ = d / R;
  const θ = rad(brg);
  const φ1 = rad(p[1]);
  const λ1 = rad(p[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

/** Linie vereinfachen (Douglas-Peucker, Toleranz in Metern). */
export function simplify(coords: LngLat[], tolerance: number): LngLat[] {
  if (coords.length < 3) return coords.slice();
  const kx = Math.cos(rad(coords[0][1])) * 111320;
  const ky = 110540;
  const xy = coords.map((c) => [c[0] * kx, c[1] * ky]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolerance) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/** Punkte in gleichmäßigem Abstand entlang der Linie (inkl. Start und Ende). */
export function resample(coords: LngLat[], dist: number[], spacing: number): LngLat[] {
  const total = dist[dist.length - 1];
  const n = Math.max(1, Math.round(total / spacing));
  const out: LngLat[] = [];
  for (let k = 0; k <= n; k++) out.push(pointAtDistance(coords, dist, (total * k) / n));
  return out;
}

export function cumulativeDistances(coords: LngLat[]): number[] {
  const out = new Array<number>(coords.length);
  let d = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) d += haversine(coords[i - 1], coords[i]);
    out[i] = d;
  }
  return out;
}

export interface Projection {
  /** Index des Segmentanfangs */
  index: number;
  /** Anteil 0..1 auf dem Segment */
  t: number;
  point: LngLat;
  /** Distanz entlang der Linie in Metern */
  distance: number;
  /** Abstand vom Klickpunkt in Metern */
  offset: number;
}

/** Projiziert einen Punkt auf die nächstgelegene Stelle der Linie. */
export function projectOnLine(p: LngLat, coords: LngLat[], dist: number[]): Projection | null {
  if (coords.length < 2) return null;
  // lokale equirektangulare Projektion reicht für Klick-Genauigkeit
  const kx = Math.cos(rad(p[1]));
  let best: Projection | null = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = (a[0] - p[0]) * kx;
    const ay = a[1] - p[1];
    const bx = (b[0] - p[0]) * kx;
    const by = b[1] - p[1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const off = Math.sqrt(qx * qx + qy * qy) * 111320;
    if (!best || off < best.offset) {
      const point: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      best = { index: i, t, point, distance: dist[i] + t * (dist[i + 1] - dist[i]), offset: off };
    }
  }
  return best;
}

/** Punkt auf der Linie bei Distanz d (Meter). */
export function pointAtDistance(coords: LngLat[], dist: number[], d: number): LngLat {
  if (d <= 0) return coords[0];
  const last = coords.length - 1;
  if (d >= dist[last]) return coords[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = dist[hi] - dist[lo];
  const t = seg > 0 ? (d - dist[lo]) / seg : 0;
  return [coords[lo][0] + t * (coords[hi][0] - coords[lo][0]), coords[lo][1] + t * (coords[hi][1] - coords[lo][1])];
}

/** Teil der Linie zwischen d1 und d2 (inkl. interpolierter Endpunkte). */
export function sliceLine(coords: LngLat[], dist: number[], d1: number, d2: number): LngLat[] {
  const out: LngLat[] = [pointAtDistance(coords, dist, d1)];
  for (let i = 0; i < coords.length; i++) {
    if (dist[i] > d1 && dist[i] < d2) out.push(coords[i]);
  }
  out.push(pointAtDistance(coords, dist, d2));
  return out;
}

export function formatKm(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

/** Kilometerstand mit einer Nachkommastelle („18,4“), wie auf dem km-Lineal. */
export function formatKmExact(m: number): string {
  return (m / 1000).toFixed(1).replace('.', ',');
}

export function formatDuration(s: number): string {
  // erst auf Minuten runden – sonst entsteht „1:60 h“
  const total = Math.round(s / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}
