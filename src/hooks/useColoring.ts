import { useMemo } from 'react';
import { GRADE_CLASSES, detectClimbs, gradeClass, gradients, type Climb } from '../domain/climbs';
import type { HeatIndex } from '../domain/heat';
import type { CombinedRoute } from '../domain/route';
import { ROADS, SURFACES } from '../domain/settings';
import {
  WIND_COLORS,
  WIND_LABELS,
  summarizeWind,
  windAlong,
  windClass,
  type WindForecast,
  type WindSummary,
} from '../domain/wind';
import type { ColorMode } from '../store';

/** Farbiger Abschnitt der Route (Indizes in coords). */
export interface Piece {
  from: number;
  to: number;
  key: string;
  color: string;
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
}

const SURFACE_COLOR = Object.fromEntries(SURFACES.map((s) => [s.key, s.color]));
const ROAD_COLOR = Object.fromEntries(ROADS.map((r) => [r.key, r.color]));
export const PLAIN = '#2563eb';
const NOVELTY_COLORS = { new: '#ea580c', known: '#64748b' };

/** Aufeinanderfolgende Punkte gleicher Klasse zu Abschnitten zusammenfassen. */
function group(n: number, keyOf: (i: number) => string, colorOf: (k: string) => string): Piece[] {
  const out: Piece[] = [];
  if (n < 2) return out;
  // keyOf(i) beschreibt das Stück von Punkt i nach i+1
  let start = 0;
  let key = keyOf(0);
  for (let i = 1; i < n - 1; i++) {
    const k = keyOf(i);
    if (k !== key) {
      out.push({ from: start, to: i, key, color: colorOf(key) });
      start = i;
      key = k;
    }
  }
  out.push({ from: start, to: n - 1, key, color: colorOf(key) });
  return out;
}

export interface Coloring {
  pieces: Piece[];
  legend: LegendItem[];
  climbs: Climb[];
  wind: WindSummary | null;
}

export function useColoring(
  route: CombinedRoute | null,
  mode: ColorMode,
  forecast: WindForecast | null,
  departure: number,
  heat: HeatIndex | null,
): Coloring {
  const climbs = useMemo(() => (route ? detectClimbs(route.dist, route.ele) : []), [route]);
  const grades = useMemo(() => (route && mode === 'grade' ? gradients(route.dist, route.ele) : null), [route, mode]);
  const wind = useMemo(
    () => (route && forecast ? windAlong(route.coords, route.dist, forecast, departure, route.time) : null),
    [route, forecast, departure],
  );

  return useMemo(() => {
    const summary = route && wind ? summarizeWind(route.dist, wind.hw, wind.speed) : null;
    if (!route) return { pieces: [], legend: [], climbs, wind: summary };
    let pieces: Piece[];
    let legend: LegendItem[];
    if (mode === 'surface' || mode === 'road') {
      pieces = route.segments.map((s) => {
        const key = mode === 'surface' ? s.surface : s.road;
        return {
          from: s.from,
          to: s.to,
          key,
          color: mode === 'surface' ? SURFACE_COLOR[key] : ROAD_COLOR[key],
        };
      });
      legend = (mode === 'surface' ? SURFACES : ROADS).map((c) => ({ key: c.key, label: c.label, color: c.color }));
    } else if (mode === 'grade' && grades) {
      const colors = Object.fromEntries(GRADE_CLASSES.map((g) => [g.key, g.color]));
      pieces = group(
        route.coords.length,
        (i) => gradeClass(grades[i]).key,
        (k) => colors[k],
      );
      legend = GRADE_CLASSES.map((g) => ({ key: g.key, label: g.label, color: g.color }));
    } else if (mode === 'novelty' && heat && heat.size) {
      const known = heat.knownAlong(route.coords);
      pieces = group(
        route.coords.length,
        (i) => (known[i] && known[i + 1] ? 'known' : 'new'),
        (k) => NOVELTY_COLORS[k as keyof typeof NOVELTY_COLORS],
      );
      legend = [
        { key: 'new', label: 'Neu für dich', color: NOVELTY_COLORS.new },
        { key: 'known', label: 'Schon gefahren', color: NOVELTY_COLORS.known },
      ];
    } else if (mode === 'wind' && wind) {
      pieces = group(
        route.coords.length,
        (i) => windClass(wind.hw[i], wind.speed[i]),
        (k) => WIND_COLORS[k as keyof typeof WIND_COLORS],
      );
      legend = (['head', 'cross', 'tail'] as const).map((k) => ({
        key: k,
        label: WIND_LABELS[k],
        color: WIND_COLORS[k],
      }));
    } else {
      pieces = [{ from: 0, to: route.coords.length - 1, key: 'plain', color: PLAIN }];
      legend = [];
    }
    const used = new Set(pieces.map((p) => p.key));
    return { pieces, legend: legend.filter((l) => used.has(l.key)), climbs, wind: summary };
  }, [route, mode, grades, wind, climbs, heat]);
}
