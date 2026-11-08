import { cumulativeDistances, haversine, pointAtDistance, sliceLine, type LngLat } from './domain/geo';
import {
  anchorIndex,
  legKey,
  nogosAlongLine,
  sliceRoute,
  type CombinedRoute,
  type LegOverride,
  type Waypoint,
} from './domain/route';
import { globalNogos, primeLeg } from './hooks/useRouting';
import { uid, useStore } from './store';

/** Index der Etappe, in der die Distanz d (Meter ab Start) liegt. */
export function legIndexAt(route: CombinedRoute, d: number): number {
  const i = route.legRanges.findIndex((l) => route.dist[l.from] <= d && route.dist[l.to] >= d);
  return i < 0 ? route.legRanges.length - 1 : i;
}

/** Passt die berechnete Route noch zu den Wegpunkten? (sonst nicht lokal umplanen) */
function inSync(route: CombinedRoute): boolean {
  const wps = useStore.getState().waypoints;
  return (
    route.legRanges.length === wps.length - 1 && route.legRanges.every((l, i) => l.key === legKey(wps[i], wps[i + 1]))
  );
}

/** Wie weit links/rechts der Änderung die Route festgehalten wird (Meter). */
// eng genug, dass sich nur das Stück um die Änderung bewegt; weit genug, dass
// die neue Straße noch sinnvoll erreicht wird (mit echten Routen ausgemessen)
const anchorDistance = (offset: number) => Math.min(2500, Math.max(400, offset * 2 + 200));

/** Sonder-Einstellung einer Etappe ohne „Alternative“ (gilt nicht für Teilstücke). */
function baseOverride(o: LegOverride | undefined): LegOverride | undefined {
  if (!o) return undefined;
  const rest = { ...o };
  delete rest.alternative;
  return Object.keys(rest).length ? rest : undefined;
}

interface LegSpec {
  override?: LegOverride;
  /** Etappe folgt exakt der bisherigen Route zwischen diesen Indizes */
  fixed?: [number, number];
}

/**
 * Ersetzt die Wegpunkte first..last durch `points`. Etappen, die exakt der
 * bisherigen Route folgen, werden vorab in den Cache gelegt – sie bleiben
 * unverändert und brauchen keine Server-Anfrage. Ein einziger Schritt im
 * Verlauf (Rückgängig).
 */
function applyLocalEdit(route: CombinedRoute, first: number, last: number, points: Waypoint[], legs: LegSpec[]) {
  const st = useStore.getState();
  const wps = st.waypoints;
  const overrides = { ...st.overrides };
  for (let i = first; i < last; i++) delete overrides[legKey(wps[i], wps[i + 1])];
  const blockNogos = globalNogos(st.blocks);
  legs.forEach((spec, k) => {
    const from = points[k];
    const to = points[k + 1];
    if (spec.override) overrides[legKey(from, to)] = spec.override;
    if (spec.fixed) {
      const o = spec.override;
      primeLeg(
        {
          from,
          to,
          settings: o?.settings ?? st.settings,
          nogos: [...blockNogos, ...(o?.avoid ?? []).flatMap((a) => a.nogos)],
          alternative: 0,
        },
        sliceRoute(route, spec.fixed[0], spec.fixed[1]),
      );
    }
  });
  useStore.setState({
    waypoints: [...wps.slice(0, first), ...points, ...wps.slice(last + 1)],
    overrides,
    selection: null,
  });
}

const wpAt = (route: CombinedRoute, i: number): Waypoint => ({
  id: uid(),
  lng: route.coords[i][0],
  lat: route.coords[i][1],
});

/**
 * Route an der Stelle d0 auf den Punkt p ziehen. Links und rechts davon wird
 * die bisherige Route mit Ankerpunkten festgehalten, nur dazwischen wird neu
 * geplant – so springt nicht die ganze Etappe auf eine andere Straße.
 */
export function dragRoute(route: CombinedRoute, d0: number, p: LngLat) {
  const st = useStore.getState();
  const L = legIndexAt(route, d0);
  if (!inSync(route)) {
    st.insertWaypoint(L + 1, p);
    return;
  }
  const r = route.legRanges[L];
  const from = st.waypoints[L];
  const to = st.waypoints[L + 1];
  const o = baseOverride(st.overrides[legKey(from, to)]);
  const w = anchorDistance(haversine(pointAtDistance(route.coords, route.dist, d0), p));
  const iA = anchorIndex(route, d0 - w, r.from, r.to);
  const iB = anchorIndex(route, d0 + w, r.from, r.to);
  const mid: Waypoint = { id: uid(), lng: p[0], lat: p[1] };
  const points: Waypoint[] = [from];
  const legs: LegSpec[] = [];
  if (iA !== null) {
    points.push(wpAt(route, iA));
    legs.push({ override: o, fixed: [r.from, iA] });
  }
  points.push(mid);
  legs.push({ override: o });
  if (iB !== null) {
    points.push(wpAt(route, iB));
    legs.push({ override: o });
    legs.push({ override: o, fixed: [iB, r.to] });
  } else {
    legs.push({ override: o });
  }
  points.push(to);
  applyLocalEdit(route, L, L + 1, points, legs);
}

/**
 * Wegpunkt verschieben: Die angrenzenden Etappen werden nur in der Nähe des
 * Punkts neu geplant, weiter entfernt bleibt die Route, wie sie war.
 */
export function moveWaypointLocally(route: CombinedRoute | null, id: string, p: LngLat) {
  const st = useStore.getState();
  const wps = st.waypoints;
  const i = wps.findIndex((w) => w.id === id);
  if (i < 0) return;
  if (!route || !inSync(route) || wps.length < 2) {
    st.moveWaypoint(id, p);
    return;
  }
  const moved: Waypoint = { ...wps[i], lng: p[0], lat: p[1] };
  const w = anchorDistance(haversine([wps[i].lng, wps[i].lat], p));
  const points: Waypoint[] = [];
  const legs: LegSpec[] = [];
  let first = i;
  let last = i;
  if (i > 0) {
    const r = route.legRanges[i - 1];
    const o = baseOverride(st.overrides[legKey(wps[i - 1], wps[i])]);
    const iA = anchorIndex(route, route.dist[r.to] - w, r.from, r.to);
    first = i - 1;
    points.push(wps[i - 1]);
    if (iA !== null) {
      points.push(wpAt(route, iA));
      legs.push({ override: o, fixed: [r.from, iA] });
    }
    legs.push({ override: o });
  }
  points.push(moved);
  if (i < wps.length - 1) {
    const r = route.legRanges[i];
    const o = baseOverride(st.overrides[legKey(wps[i], wps[i + 1])]);
    const iB = anchorIndex(route, route.dist[r.from] + w, r.from, r.to);
    last = i + 1;
    legs.push({ override: o });
    if (iB !== null) {
      points.push(wpAt(route, iB));
      legs.push({ override: o, fixed: [iB, r.to] });
    }
    points.push(wps[i + 1]);
  }
  applyLocalEdit(route, first, last, points, legs);
}

/** Wegpunkt genau auf der Route einfügen – die Route bleibt dabei unverändert. */
export function insertWaypointOnRoute(route: CombinedRoute, d: number) {
  const st = useStore.getState();
  const L = legIndexAt(route, d);
  const r = route.legRanges[L];
  const iP = inSync(route) ? anchorIndex(route, d, r.from, r.to, 1) : null;
  if (iP === null) {
    st.insertWaypoint(L + 1, pointAtDistance(route.coords, route.dist, d));
    return;
  }
  const from = st.waypoints[L];
  const to = st.waypoints[L + 1];
  const o = st.overrides[legKey(from, to)];
  const fixedOverride = o?.alternative ? baseOverride(o) : o;
  applyLocalEdit(
    route,
    L,
    L + 1,
    [from, wpAt(route, iP), to],
    [
      { override: fixedOverride, fixed: [r.from, iP] },
      { override: fixedOverride, fixed: [iP, r.to] },
    ],
  );
}

/**
 * Abschnitt start–end umfahren. Liegt er in einer Etappe, wird nur rund um den
 * Abschnitt neu geplant (Ankerpunkte davor und danach); sonst werden die
 * betroffenen Etappen mit Sperrzonen neu berechnet.
 */
export function avoidRange(route: CombinedRoute, start: number, end: number) {
  const st = useStore.getState();
  const line = sliceLine(route.coords, route.dist, start, end);
  const nogos = nogosAlongLine(line, cumulativeDistances(line));
  const a = legIndexAt(route, start);
  const b = legIndexAt(route, end);

  if (a === b && inSync(route)) {
    const r = route.legRanges[a];
    const from = st.waypoints[a];
    const to = st.waypoints[a + 1];
    const o = baseOverride(st.overrides[legKey(from, to)]);
    const w = anchorDistance((end - start) / 2);
    const iA = anchorIndex(route, start - w, r.from, r.to);
    const iB = anchorIndex(route, end + w, r.from, r.to);
    const avoidO: LegOverride = { ...o, avoid: [...(o?.avoid ?? []), { line, nogos }] };
    const points: Waypoint[] = [from];
    const legs: LegSpec[] = [];
    if (iA !== null) {
      points.push(wpAt(route, iA));
      legs.push({ override: o, fixed: [r.from, iA] });
    }
    legs.push({ override: avoidO });
    if (iB !== null) {
      points.push(wpAt(route, iB));
      legs.push({ override: o, fixed: [iB, r.to] });
    }
    points.push(to);
    applyLocalEdit(route, a, a + 1, points, legs);
    return;
  }

  for (const { key } of route.legRanges.slice(a, b + 1)) {
    const o = st.overrides[key] ?? {};
    st.setOverride(key, { ...o, alternative: 0, avoid: [...(o.avoid ?? []), { line, nogos }] });
  }
  useStore.getState().setSelection(null);
}
