// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { OsmElement } from '../api/overpass';
import { classifyRoad, classifySurface, parseWayTags } from './classify';
import { detectClimbs, gradeClass, gradients } from './climbs';
import { cumulativeDistances, destination, haversine, resample, simplify, type LngLat } from './geo';
import { toGpx, toTcx } from './gpx';
import { DESTINATION_CATEGORIES, STOP_CATEGORIES, corridorQuery, parsePois, rankDestinations } from './poi';
import { combineLegs, type LegResult } from './route';
import { splitIntoLegs } from './roundtrip';
import { uncertainSections, uncertaintyText } from './surfaceCheck';
import { turnPoints } from './turns';
import { headwind, summarizeWind, windAlong, windAt, windClass } from './wind';

/** Gerade Linie nach Osten, 1 Punkt alle ~70 m */
function line(n: number, ele: (i: number) => number = () => 100): LegResult {
  const coords: LngLat[] = Array.from({ length: n }, (_, i) => [8 + i * 0.001, 50]);
  const dist = cumulativeDistances(coords);
  return {
    coords,
    ele: coords.map((_, i) => ele(i)),
    segments: [],
    length: dist[dist.length - 1],
    ascend: 0,
    time: 600,
  };
}

describe('Steigung & Anstiege', () => {
  it('berechnet die Steigung', () => {
    const l = line(60, (i) => 100 + i * 3.6); // ~5 %
    const g = gradients(cumulativeDistances(l.coords), l.ele);
    expect(g[30]).toBeCloseTo(5, 0);
    expect(gradeClass(5).key).toBe('g4');
    expect(gradeClass(-4).key).toBe('down');
  });

  it('findet einen Anstieg zwischen Flachstücken', () => {
    const l = line(120, (i) => (i < 30 ? 100 : i < 70 ? 100 + (i - 30) * 4.3 : 272));
    const climbs = detectClimbs(cumulativeDistances(l.coords), l.ele);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gain).toBeGreaterThan(150);
    expect(climbs[0].avg).toBeGreaterThan(5);
    expect(climbs[0].length).toBeGreaterThan(2500);
  });

  it('ignoriert flache Strecken', () => {
    const l = line(100, (i) => 100 + Math.sin(i) * 2);
    expect(detectClimbs(cumulativeDistances(l.coords), l.ele)).toHaveLength(0);
  });
});

describe('Abbiegehinweise', () => {
  const leg: LegResult = {
    ...line(20),
    hints: [
      { index: 5, cmd: 5, exit: 0, angle: 90 },
      { index: 10, cmd: 14, exit: 2, angle: 10 },
      { index: 12, cmd: 1, exit: 0, angle: 0 },
    ],
  };

  it('übersetzt BRouter-Kommandos und lässt „geradeaus“ weg', () => {
    const route = combineLegs([{ key: 'a', result: leg }])!;
    const t = turnPoints(route);
    expect(t.map((x) => x.text)).toEqual(['Rechts abbiegen', 'Im Kreisverkehr 2. Ausfahrt']);
    expect(t[0].short.length).toBeLessThanOrEqual(10);
  });

  it('verschiebt Hinweise beim Zusammensetzen und Zerlegen', () => {
    const route = combineLegs([
      { key: 'a', result: leg },
      { key: 'b', result: leg },
    ])!;
    expect(route.hints.map((h) => h.index)).toEqual([5, 10, 12, 24, 29, 31]);
    const { legs } = splitIntoLegs({ ...leg, hints: leg.hints }, 2);
    expect(legs[1].hints!.every((h) => h.index > 0 && h.index < legs[1].coords.length)).toBe(true);
  });

  it('ergänzt Abbiegen an Wegpunkten aus der Geometrie', () => {
    const a = line(10);
    const last = a.coords[a.coords.length - 1];
    const b: LegResult = { ...a, coords: Array.from({ length: 10 }, (_, i) => [last[0], 50 + i * 0.001]) };
    const route = combineLegs([
      { key: 'a', result: { ...a, hints: [] } },
      { key: 'b', result: { ...b, hints: [] } },
    ])!;
    // nach Osten, dann nach Norden → links
    expect(turnPoints(route).map((t) => t.kind)).toEqual(['left']);
  });

  it('schreibt GPX-Wegpunkte und TCX-CoursePoints', () => {
    const route = combineLegs([{ key: 'a', result: leg }])!;
    const gpx = toGpx(route, 'Test & Tour');
    expect(gpx).toContain('<sym>Right</sym>');
    expect(gpx).toContain('Test &#38; Tour');
    expect(toGpx(route, 'x', false)).not.toContain('<wpt');
    const tcx = toTcx(route, 'Test');
    expect(tcx).toContain('<PointType>Right</PointType>');
    expect(tcx.match(/<Trackpoint>/g)).toHaveLength(20);
  });
});

describe('Wind', () => {
  const forecast = { hours: [0, 1, 2].map((h) => ({ time: h * 3600_000, speed: 20, gust: 30, from: 270 })) };

  it('erkennt Gegen- und Rückenwind', () => {
    expect(headwind(270, { speed: 20, from: 270 })).toBeCloseTo(20); // nach Westen gegen Westwind
    expect(headwind(90, { speed: 20, from: 270 })).toBeCloseTo(-20);
    expect(windClass(0, 20)).toBe('cross');
    expect(windAt(forecast, 1.4 * 3600_000)?.time).toBe(3600_000);
    expect(windAt(forecast, 10 * 3600_000)).toBeNull();
  });

  it('bewertet hin gegen den Wind, zurück mit Rückenwind', () => {
    const out: LngLat[] = Array.from({ length: 10 }, (_, i) => [8 - i * 0.01, 50]);
    const coords = [...out, ...out.slice(0, -1).reverse()];
    const dist = cumulativeDistances(coords);
    const w = windAlong(coords, dist, forecast, 0, 3600);
    const s = summarizeWind(dist, w.hw, w.speed);
    expect(s.firstHalf).toBeGreaterThan(15);
    expect(s.secondHalf).toBeLessThan(-15);
    expect(s.head).toBeCloseTo(0.5, 1);
  });
});

describe('Geometrie', () => {
  it('berechnet Zielpunkte', () => {
    const p = destination([8, 50], 90, 1000);
    expect(haversine([8, 50], p)).toBeCloseTo(1000, -1);
    expect(p[1]).toBeCloseTo(50, 3);
  });

  it('vereinfacht und tastet Linien ab', () => {
    const l = line(50).coords;
    expect(simplify(l, 5)).toHaveLength(2);
    const r = resample(l, cumulativeDistances(l), 500);
    expect(r[0]).toEqual(l[0]);
    expect(r[r.length - 1]).toEqual(l[l.length - 1]);
    expect(r.length).toBeGreaterThan(5);
  });
});

describe('POIs', () => {
  it('baut eine Korridor-Abfrage', () => {
    const q = corridorQuery(line(30).coords, 300, STOP_CATEGORIES);
    expect(q).toMatch(/node\[amenity=cafe\]\(49\.99\d+,7\.99\d+,50\.00\d+,8\.0\d+\);/);
    expect(q).toContain('[amenity=drinking_water]');
  });

  it('ordnet OSM-Elemente Kategorien zu', () => {
    const els: OsmElement[] = [
      { type: 'node', id: 1, lat: 50, lon: 8, tags: { amenity: 'drinking_water' } },
      { type: 'node', id: 2, lat: 50, lon: 8, tags: { shop: 'bakery', name: 'Beck' } },
      { type: 'way', id: 3, center: { lat: 50.2, lon: 8 }, tags: { natural: 'water', water: 'lake', name: 'See' } },
      { type: 'node', id: 4, lat: 50, lon: 8, tags: { amenity: 'bench' } },
    ];
    const stops = parsePois(els, STOP_CATEGORIES);
    expect(stops.map((p) => p.category)).toEqual(['water', 'cafe']);
    expect(stops[1].name).toBe('Beck');
    const dest = parsePois(els, DESTINATION_CATEGORIES);
    expect(dest.map((p) => p.category)).toEqual(['lake']);
    // See liegt ~22 km entfernt: im Umkreis bis 30 km, nicht bis 20 km
    expect(rankDestinations(dest, [8, 50], 30000)).toHaveLength(1);
    expect(rankDestinations(dest, [8, 50], 20000)).toHaveLength(0);
  });

  it('sortiert Ziele im Umkreis', () => {
    const mk = (id: number, lat: number, tags: Record<string, string>): OsmElement => ({
      type: 'node',
      id,
      lat,
      lon: 8,
      tags: { tourism: 'viewpoint', ...tags },
    });
    const pois = parsePois(
      [
        mk(1, 50.05, { name: 'Nah' }),
        mk(2, 50.2, { name: 'Weit' }),
        mk(3, 50.1, { name: 'Berühmt', wikipedia: 'de:X' }),
      ],
      DESTINATION_CATEGORIES,
    );
    const names = (s: 'interest' | 'near' | 'far') => rankDestinations(pois, [8, 50], 30000, s).map((p) => p.name);
    expect(names('near')).toEqual(['Nah', 'Berühmt', 'Weit']);
    expect(names('far')).toEqual(['Weit', 'Berühmt', 'Nah']);
    expect(names('interest')[0]).toBe('Berühmt');
  });
});

describe('Belags-Check', () => {
  const seg = (from: number, to: number, tags: string) => {
    const t = parseWayTags(tags);
    const sc = classifySurface(t);
    return { from, to, tags: t, surface: sc.cat, surfaceInferred: sc.inferred, road: classifyRoad(t) };
  };

  it('meldet fehlende und geschätzte Beläge auf Wegen, nicht auf Straßen', () => {
    const route = combineLegs([
      {
        key: 'a',
        result: {
          ...line(40),
          segments: [
            seg(0, 5, 'highway=tertiary'), // Straße ohne surface → Asphalt, zuverlässig
            seg(5, 10, 'highway=track tracktype=grade1'), // geschätzt
            seg(10, 11, 'highway=residential surface=asphalt'), // kurze Lücke (70 m) → wird nicht überbrückt
            seg(11, 15, 'highway=path'), // kein Belag
            seg(15, 25, 'highway=track surface=asphalt'),
            seg(25, 30, 'highway=cycleway'), // Radweg ohne surface → geschätzt
          ],
        },
      },
    ])!;
    const s = uncertainSections(route);
    expect(s.map((x) => x.kind)).toEqual(['guessed', 'missing', 'guessed']);
    expect(s[0].wayLabel).toBe('Wirtschaftsweg');
    expect(s[0].detail).toContain('Wegeklasse 1');
    expect(uncertaintyText(s[1])).toContain('Kein Belag');
    expect(s[0].id).not.toBe(s[2].id);
  });
});
