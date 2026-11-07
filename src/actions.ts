import { cumulativeDistances, sliceLine } from './domain/geo';
import { nogosAlongLine, type CombinedRoute } from './domain/route';
import { useStore } from './store';

/** Index der Etappe, in der die Distanz d (Meter ab Start) liegt. */
export function legIndexAt(route: CombinedRoute, d: number): number {
  const i = route.legRanges.findIndex((l) => route.dist[l.from] <= d && route.dist[l.to] >= d);
  return i < 0 ? route.legRanges.length - 1 : i;
}

/** Abschnitt start–end in den betroffenen Etappen sperren und neu berechnen lassen. */
export function avoidRange(route: CombinedRoute, start: number, end: number) {
  const line = sliceLine(route.coords, route.dist, start, end);
  const nogos = nogosAlongLine(line, cumulativeDistances(line));
  const { overrides, setOverride } = useStore.getState();
  const a = legIndexAt(route, start);
  const b = legIndexAt(route, end);
  for (const { key } of route.legRanges.slice(a, b + 1)) {
    const o = overrides[key] ?? {};
    setOverride(key, { ...o, alternative: 0, avoid: [...(o.avoid ?? []), { line, nogos }] });
  }
  useStore.getState().setSelection(null);
}
