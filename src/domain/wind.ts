import { bearing, type LngLat } from './geo';

export interface WindHour {
  /** Unix-Zeit in ms */
  time: number;
  /** km/h */
  speed: number;
  gust: number;
  /** Richtung, AUS der der Wind kommt (Grad, 0 = Nord) */
  from: number;
}

export interface WindForecast {
  hours: WindHour[];
}

export const COMPASS_LABELS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export const compassLabel = (deg: number) => COMPASS_LABELS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** Windvorhersage zur Uhrzeit t (nächste volle Stunde). */
export function windAt(f: WindForecast, t: number): WindHour | null {
  if (!f.hours.length) return null;
  let best = f.hours[0];
  for (const h of f.hours) if (Math.abs(h.time - t) < Math.abs(best.time - t)) best = h;
  return Math.abs(best.time - t) <= 3 * 3600_000 ? best : null;
}

/**
 * Gegenwind-Komponente in km/h für eine Fahrtrichtung: positiv = Gegenwind,
 * negativ = Rückenwind.
 */
export function headwind(travelBearing: number, w: { speed: number; from: number }): number {
  return w.speed * Math.cos(((travelBearing - w.from) * Math.PI) / 180);
}

export type WindClass = 'head' | 'cross' | 'tail';

export function windClass(hw: number, speed: number): WindClass {
  if (speed < 1) return 'cross';
  const r = hw / speed;
  return r > 0.4 ? 'head' : r < -0.4 ? 'tail' : 'cross';
}

export const WIND_COLORS: Record<WindClass, string> = { head: '#dc2626', cross: '#a3a3a3', tail: '#16a34a' };
export const WIND_LABELS: Record<WindClass, string> = { head: 'Gegenwind', cross: 'Seitenwind', tail: 'Rückenwind' };

/**
 * Gegenwind je Punkt entlang einer Linie. Die Uhrzeit läuft über die
 * geschätzte Fahrzeit mit, damit sich drehender Wind berücksichtigt wird.
 */
export function windAlong(
  coords: LngLat[],
  dist: number[],
  forecast: WindForecast,
  departure: number,
  duration: number,
): { hw: number[]; speed: number[] } {
  const total = dist[dist.length - 1] || 1;
  const hw: number[] = new Array(coords.length).fill(0);
  const speed: number[] = new Array(coords.length).fill(0);
  for (let i = 0; i < coords.length - 1; i++) {
    const w = windAt(forecast, departure + (duration * 1000 * dist[i]) / total);
    if (!w) continue;
    hw[i] = headwind(bearing(coords[i], coords[i + 1]), w);
    speed[i] = w.speed;
  }
  if (coords.length > 1) {
    hw[coords.length - 1] = hw[coords.length - 2];
    speed[coords.length - 1] = speed[coords.length - 2];
  }
  return { hw, speed };
}

export interface WindSummary {
  /** Anteile 0..1 */
  head: number;
  tail: number;
  cross: number;
  /** mittlerer Gegenwind erste / zweite Hälfte (km/h, negativ = Rückenwind) */
  firstHalf: number;
  secondHalf: number;
}

export function summarizeWind(dist: number[], hw: number[], speed: number[]): WindSummary {
  const total = dist[dist.length - 1] || 1;
  const parts = { head: 0, tail: 0, cross: 0 };
  let h1 = 0;
  let h2 = 0;
  let l1 = 0;
  let l2 = 0;
  for (let i = 0; i < dist.length - 1; i++) {
    const len = dist[i + 1] - dist[i];
    parts[windClass(hw[i], speed[i])] += len;
    if (dist[i] < total / 2) {
      h1 += hw[i] * len;
      l1 += len;
    } else {
      h2 += hw[i] * len;
      l2 += len;
    }
  }
  return {
    head: parts.head / total,
    tail: parts.tail / total,
    cross: parts.cross / total,
    firstHalf: l1 ? h1 / l1 : 0,
    secondHalf: l2 ? h2 / l2 : 0,
  };
}

const cache = new Map<string, Promise<WindForecast>>();

/** Stündliche Windvorhersage für 7 Tage von Open-Meteo (frei, ohne Schlüssel). */
export function fetchWind(p: LngLat): Promise<WindForecast> {
  const key = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  let f = cache.get(key);
  if (!f) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${p[1].toFixed(3)}&longitude=${p[0].toFixed(3)}` +
      '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh&timezone=UTC&forecast_days=7';
    f = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Windvorhersage nicht verfügbar');
        return r.json();
      })
      .then((j) => ({
        hours: (j.hourly.time as string[]).map((t, i) => ({
          time: Date.parse(`${t}:00Z`),
          speed: j.hourly.wind_speed_10m[i] ?? 0,
          gust: j.hourly.wind_gusts_10m[i] ?? 0,
          from: j.hourly.wind_direction_10m[i] ?? 0,
        })),
      }));
    f.catch(() => cache.delete(key));
    cache.set(key, f);
  }
  return f;
}
