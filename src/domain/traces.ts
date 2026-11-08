import { cumulativeDistances, haversine, resample, type LngLat } from './geo';

/**
 * Öffentliche GPS-Spuren (OpenStreetMap) auswerten: Aus Zeit und Weg ergibt
 * sich das Tempo – und daraus grob, wer unterwegs war. Spuren ohne Zeit
 * (anonym hochgeladen) bleiben „unbekannt“.
 */
export type TraceKind = 'foot' | 'bike' | 'fast' | 'motor' | 'unknown';

export const TRACE_LABEL: Record<TraceKind, string> = {
  foot: 'zu Fuß',
  bike: 'Rad',
  fast: 'Rennrad-Tempo',
  motor: 'Auto/Motorrad',
  unknown: 'ohne Zeit',
};

export interface Trace {
  points: LngLat[];
  /** Zeit in ms je Punkt, falls vorhanden */
  times: number[] | null;
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Tempo-Profil einer Spur (km/h, Median und 90-%-Wert der Bewegung) →
 * Einordnung. Stillstand wird ignoriert.
 */
export function classifyTrace(t: Trace): TraceKind {
  if (!t.times || t.points.length < 3) return 'unknown';
  const speeds: number[] = [];
  for (let i = 1; i < t.points.length; i++) {
    const dt = (t.times[i] - t.times[i - 1]) / 1000;
    if (!(dt > 0) || dt > 300) continue;
    const v = (haversine(t.points[i - 1], t.points[i]) / dt) * 3.6;
    if (v >= 2 && v < 250) speeds.push(v);
  }
  if (speeds.length < 5) return 'unknown';
  speeds.sort((a, b) => a - b);
  const med = quantile(speeds, 0.5);
  const p90 = quantile(speeds, 0.9);
  if (med < 7.5) return 'foot';
  // Autos in der Stadt fahren im Schnitt kaum schneller als Rennräder, aber
  // regelmäßig über 50 km/h – Radfahrer nur kurz bergab
  if (med >= 38 || p90 >= 50) return 'motor';
  if (med >= 23) return 'fast';
  return 'bike';
}

/** Ist die Spur eine Radfahrt? */
export const isBikeKind = (k: TraceKind) => k === 'bike' || k === 'fast';

/** Höchstabstand zweier Punkte, die noch verbunden werden */
const MAX_GAP_M = 120;
const MAX_GAP_S = 20;
const MAX_KMH = 70;
const MIN_RUN_M = 150;

/**
 * Zerlegt eine Spur in plausible, zusammenhängende Stücke: getrennt wird bei
 * Lücken (Spur hat die Kachel verlassen, Pause, Funkloch), GPS-Sprüngen und
 * unrealistischem Tempo. Sehr kurze Bruchstücke fallen weg.
 */
export function cleanRuns(t: Trace): LngLat[][] {
  const runs: LngLat[][] = [];
  let run: LngLat[] = [];
  let len = 0;
  const flush = () => {
    if (run.length >= 2 && len >= MIN_RUN_M) runs.push(run);
    run = [];
    len = 0;
  };
  for (let i = 0; i < t.points.length; i++) {
    if (run.length) {
      const d = haversine(t.points[i - 1], t.points[i]);
      const dt = t.times ? (t.times[i] - t.times[i - 1]) / 1000 : NaN;
      const tooFast = dt > 0 && (d / dt) * 3.6 > MAX_KMH;
      if (d > MAX_GAP_M || !(dt > 0) || dt > MAX_GAP_S || tooFast) flush();
      else len += d;
    }
    run.push(t.points[i]);
  }
  flush();
  return runs;
}

/**
 * Gleichmäßige Punkte entlang der Spur (alle `spacing` Meter) – so zählt
 * jede Befahrung gleich, egal wie oft das Gerät eine Position gespeichert hat.
 * Lücken (> 300 m zwischen zwei Punkten) werden nicht überbrückt.
 */
export function densityPoints(points: LngLat[], spacing = 25): LngLat[] {
  const out: LngLat[] = [];
  let part: LngLat[] = [];
  const flush = () => {
    if (part.length >= 2) out.push(...resample(part, cumulativeDistances(part), spacing));
    else out.push(...part);
    part = [];
  };
  for (let i = 0; i < points.length; i++) {
    if (part.length && haversine(part[part.length - 1], points[i]) > 300) flush();
    part.push(points[i]);
  }
  flush();
  return out;
}
