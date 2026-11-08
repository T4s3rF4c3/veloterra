// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
});

const { useStore } = await import('./store');
const { combineLegs, legKey } = await import('./domain/route');
const { cumulativeDistances } = await import('./domain/geo');
const { avoidRange, dragRoute, insertWaypointOnRoute, moveWaypointLocally } = await import('./actions');

type LngLat = [number, number];

/** Gerade Route nach Osten, ein Punkt alle ~72 m, eine Etappe A→B (~14 km) */
function setup() {
  const coords: LngLat[] = Array.from({ length: 201 }, (_, i) => [8 + i * 0.001, 50]);
  const dist = cumulativeDistances(coords);
  const wps = [
    { id: 'A', lng: 8, lat: 50 },
    { id: 'B', lng: 8.2, lat: 50 },
  ];
  useStore.setState({ waypoints: wps, overrides: {}, blocks: [], selection: null });
  const route = combineLegs([
    {
      key: legKey(wps[0], wps[1]),
      result: {
        coords,
        ele: coords.map(() => 100),
        segments: [],
        length: dist[dist.length - 1],
        ascend: 0,
        time: 1800,
        hints: [],
      },
    },
  ])!;
  return route;
}

const ids = () => useStore.getState().waypoints.map((w) => w.id);

describe('Lokales Umplanen', () => {
  beforeEach(() => mem.clear());

  it('setzt beim Ziehen Ankerpunkte vor und hinter die Stelle', () => {
    const route = setup();
    const d0 = route.dist[100]; // Mitte
    dragRoute(route, d0, [8.1, 50.002]); // ~220 m nach Norden
    const wps = useStore.getState().waypoints;
    expect(wps).toHaveLength(5);
    expect(wps[0].id).toBe('A');
    expect(wps[4].id).toBe('B');
    // Anker liegen auf der alten Route, links und rechts der Ziehstelle
    expect(wps[1].lat).toBe(50);
    expect(wps[3].lat).toBe(50);
    expect(wps[1].lng).toBeLessThan(8.1);
    expect(wps[3].lng).toBeGreaterThan(8.1);
    expect(wps[2].lat).toBeCloseTo(50.002);
  });

  it('setzt keinen Anker, wenn die Stelle nah am Wegpunkt liegt', () => {
    const route = setup();
    dragRoute(route, route.dist[2], [8.002, 50.001]);
    expect(ids()).toHaveLength(4); // A, gezogener Punkt, Anker, B
    expect(ids()[0]).toBe('A');
  });

  it('hält beim Verschieben eines Wegpunkts den Rest der Route fest', () => {
    const route = setup();
    insertWaypointOnRoute(route, route.dist[100]);
    expect(ids()).toHaveLength(3);
    const mid = useStore.getState().waypoints[1];
    expect(mid.lng).toBeCloseTo(8.1);
    // Route zur neuen Wegpunktfolge passend nachbilden
    const route2 = combineLegs(
      [0, 1].map((k) => ({
        key: legKey(useStore.getState().waypoints[k], useStore.getState().waypoints[k + 1]),
        result: {
          coords: route.coords.slice(k * 100, k * 100 + 101),
          ele: route.ele.slice(0, 101),
          segments: [],
          length: route.dist[100],
          ascend: 0,
          time: 900,
          hints: [],
        },
      })),
    )!;
    moveWaypointLocally(route2, mid.id, [8.1, 50.003]);
    const wps = useStore.getState().waypoints;
    expect(wps).toHaveLength(5);
    expect(wps[2].id).toBe(mid.id);
    expect(wps[2].lat).toBeCloseTo(50.003);
    expect(wps[1].lat).toBe(50);
    expect(wps[3].lat).toBe(50);
  });

  it('umfährt einen Abschnitt nur lokal mit Sperrzonen auf der mittleren Etappe', () => {
    const route = setup();
    avoidRange(route, route.dist[90], route.dist[110]);
    const st = useStore.getState();
    expect(st.waypoints).toHaveLength(4);
    const keys = st.waypoints.slice(0, -1).map((w, i) => legKey(w, st.waypoints[i + 1]));
    expect(st.overrides[keys[0]]).toBeUndefined();
    expect(st.overrides[keys[1]]?.avoid).toHaveLength(1);
    expect(st.overrides[keys[2]]).toBeUndefined();
  });
});

describe('Profil beim Umplanen', () => {
  it('plant in importierten Routen mit dem eigenen Profil um, nicht mit dem Import-Profil', async () => {
    const { FOLLOW_SETTINGS } = await import('./hooks/useImport');
    const route = setup();
    const st = useStore.getState();
    const [a, b] = st.waypoints;
    useStore.setState({ overrides: { [legKey(a, b)]: { settings: FOLLOW_SETTINGS, presetLabel: 'Import' } } });
    dragRoute(route, route.dist[100], [8.1, 50.002]);
    const s2 = useStore.getState();
    const legs = s2.waypoints.slice(0, -1).map((w, i) => s2.overrides[legKey(w, s2.waypoints[i + 1])]);
    // unveränderte Stücke folgen weiter dem Original, die neu geplanten nutzen das Profil
    expect(legs[0]?.presetLabel).toBe('Import');
    expect(legs[1]).toBeUndefined();
    expect(legs[2]).toBeUndefined();
    expect(legs[3]?.presetLabel).toBe('Import');
  });

  it('behält eigene Abschnitts-Einstellungen („Anders planen“) beim Umplanen', async () => {
    const { PRESETS } = await import('./domain/settings');
    const route = setup();
    const [a, b] = useStore.getState().waypoints;
    const allroad = PRESETS.find((p) => p.id === 'allroad')!.settings;
    useStore.setState({ overrides: { [legKey(a, b)]: { settings: allroad, presetLabel: 'allroad' } } });
    dragRoute(route, route.dist[100], [8.1, 50.002]);
    const s2 = useStore.getState();
    const legs = s2.waypoints.slice(0, -1).map((w, i) => s2.overrides[legKey(w, s2.waypoints[i + 1])]);
    expect(legs.every((o) => o?.settings === allroad)).toBe(true);
  });
});
