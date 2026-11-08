import { cumulativeDistances, haversine, resample, type LngLat } from './geo';

/**
 * Raster der schon gefahrenen Strecken: Zellen von ca. 27 m. Eine Stelle gilt
 * als „schon gefahren“, wenn in ihrer Zelle oder einer Nachbarzelle eine
 * eigene Fahrt liegt (Toleranz ca. 30–50 m – reicht für GPS-Ungenauigkeit,
 * trennt aber Parallelstraßen meist sauber).
 */
const CELL_LAT = 0.00025;
const CELL_LNG = 0.00038;
const OFF = 500000;

const cellOf = (p: LngLat) => {
  const x = Math.floor(p[0] / CELL_LNG) + OFF;
  const y = Math.floor(p[1] / CELL_LAT) + OFF;
  return [x, y] as const;
};
const keyOf = (x: number, y: number) => x * 1_000_000 + y;

export class HeatIndex {
  private cells = new Set<number>();

  /** Fahrt hinzufügen: alle ~20 m eine Zelle markieren */
  add(track: LngLat[]) {
    for (let i = 0; i < track.length; i++) {
      const a = track[i];
      const [x0, y0] = cellOf(a);
      this.cells.add(keyOf(x0, y0));
      if (i === track.length - 1) break;
      const b = track[i + 1];
      const steps = Math.floor(haversine(a, b) / 20);
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        const [x, y] = cellOf([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        this.cells.add(keyOf(x, y));
      }
    }
  }

  get size() {
    return this.cells.size;
  }

  known(p: LngLat): boolean {
    const [x, y] = cellOf(p);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (this.cells.has(keyOf(x + dx, y + dy))) return true;
    return false;
  }

  /** Anteil 0..1 einer Linie, der noch nie gefahren wurde */
  novelty(coords: LngLat[]): number {
    if (coords.length < 2 || !this.cells.size) return 0;
    const samples = resample(coords, cumulativeDistances(coords), 25);
    let unknown = 0;
    for (const p of samples) if (!this.known(p)) unknown++;
    return unknown / samples.length;
  }

  /** Für jeden Punkt der Linie: schon gefahren? */
  knownAlong(coords: LngLat[]): boolean[] {
    return coords.map((p) => this.known(p));
  }
}
