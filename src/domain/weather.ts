import type { IconName } from '../components/Icon';
import { pointAtDistance, type LngLat } from './geo';

/** Wetter an einem Punkt der Route zur voraussichtlichen Ankunftszeit. */
export interface WeatherPoint {
  /** Meter ab Start */
  distance: number;
  /** Unix-Zeit in ms (Ankunft an diesem Punkt) */
  time: number;
  /** °C */
  temp: number;
  feels: number;
  /** Regenwahrscheinlichkeit 0–100 */
  rainProb: number;
  /** Niederschlag in mm/h */
  rain: number;
  /** WMO-Wettercode */
  code: number;
}

/** WMO-Wettercode → Beschreibung und Symbol */
export function weatherInfo(code: number): { label: string; icon: IconName } {
  if (code === 0) return { label: 'klar', icon: 'sun' };
  if (code <= 2) return { label: 'heiter', icon: 'cloud-sun' };
  if (code === 3) return { label: 'bedeckt', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Nebel', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Niesel', icon: 'rain' };
  if (code >= 61 && code <= 67) return { label: 'Regen', icon: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Schnee', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Schauer', icon: 'rain' };
  if (code === 85 || code === 86) return { label: 'Schneeschauer', icon: 'snow' };
  if (code >= 95) return { label: 'Gewitter', icon: 'thunder' };
  return { label: 'wechselhaft', icon: 'cloud' };
}

/**
 * Stellen entlang der Route, an denen das Wetter abgefragt wird: Start, Ziel
 * und dazwischen etwa alle 12 km (3 bis 8 Punkte), jeweils mit der Uhrzeit,
 * zu der man dort voraussichtlich ist.
 */
export function weatherSamples(
  coords: LngLat[],
  dist: number[],
  departure: number,
  durationS: number,
): { coord: LngLat; distance: number; time: number }[] {
  const total = dist[dist.length - 1] || 0;
  const n = Math.min(8, Math.max(3, Math.round(total / 12000) + 1));
  return Array.from({ length: n }, (_, i) => {
    const d = (total * i) / (n - 1);
    return {
      coord: pointAtDistance(coords, dist, d),
      distance: d,
      time: departure + (durationS * 1000 * d) / (total || 1),
    };
  });
}

interface Hourly {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  weather_code: number[];
}

const cache = new Map<string, Promise<WeatherPoint[]>>();

/**
 * Stündliche Vorhersage von Open-Meteo (frei, ohne Schlüssel) für alle Punkte
 * in einer Anfrage; je Punkt die Stunde, zu der man dort ankommt.
 */
export function fetchWeatherAlong(
  samples: { coord: LngLat; distance: number; time: number }[],
): Promise<WeatherPoint[]> {
  const key = samples
    .map((s) => `${s.coord[0].toFixed(2)},${s.coord[1].toFixed(2)},${Math.round(s.time / 3600_000)}`)
    .join('|');
  let f = cache.get(key);
  if (!f) {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${samples.map((s) => s.coord[1].toFixed(3)).join(',')}` +
      `&longitude=${samples.map((s) => s.coord[0].toFixed(3)).join(',')}` +
      '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code' +
      '&timezone=UTC&forecast_days=7';
    f = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Wettervorhersage nicht verfügbar');
        return r.json();
      })
      .then((j) => {
        // eine Abfrage mit mehreren Punkten liefert eine Liste, mit einem Punkt ein Objekt
        const list = (Array.isArray(j) ? j : [j]) as { hourly: Hourly }[];
        return samples.map((s, i) => {
          const h = list[i].hourly;
          let best = 0;
          for (let k = 1; k < h.time.length; k++) {
            if (
              Math.abs(Date.parse(`${h.time[k]}:00Z`) - s.time) < Math.abs(Date.parse(`${h.time[best]}:00Z`) - s.time)
            )
              best = k;
          }
          return {
            distance: s.distance,
            time: s.time,
            temp: h.temperature_2m[best] ?? 0,
            feels: h.apparent_temperature[best] ?? 0,
            rainProb: h.precipitation_probability[best] ?? 0,
            rain: h.precipitation[best] ?? 0,
            code: h.weather_code[best] ?? 0,
          };
        });
      });
    f.catch(() => cache.delete(key));
    cache.set(key, f);
  }
  return f;
}

/** Kurzfassung für den Panel-Kopf, z. B. „13–18 °C · Regen bis 40 % ab km 35“. */
export function weatherSummary(points: WeatherPoint[]): string {
  if (!points.length) return '';
  const temps = points.map((p) => p.temp);
  const lo = Math.round(Math.min(...temps));
  const hi = Math.round(Math.max(...temps));
  const temp = lo === hi ? `${lo} °C` : `${lo}–${hi} °C`;
  const wet = points.reduce((a, p) => (p.rainProb > a.rainProb ? p : a), points[0]);
  if (wet.rainProb < 20) return `${temp} · trocken`;
  const first = points.find((p) => p.rainProb >= 30);
  const from = first && first.distance > 0 ? ` ab km ${Math.round(first.distance / 1000)}` : '';
  return `${temp} · Regen bis ${Math.round(wet.rainProb)} %${from}`;
}
