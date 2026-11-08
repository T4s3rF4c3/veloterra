import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/roundtrip.json';
import { cumulativeDistances, type LngLat } from './geo';
import { combineLegs, parseBRouter } from './route';
import {
  candidateDirections,
  isSimilar,
  legCountFor,
  overlapRatio,
  rateRoundTrip,
  sortSuggestions,
  splitIntoLegs,
  type RoundTripStats,
} from './roundtrip';
import { DEFAULT_SETTINGS, cloneSettings } from './settings';

const loop = parseBRouter(fixture as never);

describe('roundtrip', () => {
  it('wählt Richtungen um die Wunschrichtung', () => {
    expect(candidateDirections(0)).toEqual([325, 0, 35]);
    expect(candidateDirections('any')).toHaveLength(6);
  });

  it('erkennt hin und zurück gefahrene Strecken', () => {
    const outAndBack: LngLat[] = [
      [8, 50],
      [8.01, 50],
      [8.02, 50],
      [8.01, 50],
      [8, 50],
    ];
    expect(overlapRatio(outAndBack, cumulativeDistances(outAndBack))).toBeCloseTo(1);
    const square: LngLat[] = [
      [8, 50],
      [8.01, 50],
      [8.01, 50.01],
      [8, 50.01],
      [8, 50],
    ];
    expect(overlapRatio(square, cumulativeDistances(square))).toBe(0);
  });

  it('bewertet eine echte Rundtour', () => {
    const stats = rateRoundTrip(loop, DEFAULT_SETTINGS, loop.length);
    expect(stats.score).toBeGreaterThan(0);
    expect(stats.score).toBeLessThanOrEqual(100);
    expect(stats.paved).toBeGreaterThan(0.5);
    // Abweichung von der Wunschlänge kostet Punkte
    expect(rateRoundTrip(loop, DEFAULT_SETTINGS, loop.length * 2).score).toBeLessThan(stats.score);
    // Strengere Einstellungen → schlechtere Qualität
    const strict = cloneSettings(DEFAULT_SETTINGS);
    strict.road = { ...strict.road, residential: 'forbid', cycleway: 'forbid', track: 'forbid' };
    expect(rateRoundTrip(loop, strict, loop.length).quality).toBeLessThan(stats.quality);
  });

  it('zerlegt eine Rundtour verlustfrei in Etappen', () => {
    const n = legCountFor(loop.length);
    const { points, legs } = splitIntoLegs(loop, n);
    expect(legs).toHaveLength(n);
    expect(points).toHaveLength(n + 1);
    expect(points[0]).toEqual(loop.coords[0]);
    expect(points[n]).toEqual(loop.coords[loop.coords.length - 1]);
    const combined = combineLegs(legs.map((result, i) => ({ key: String(i), result })))!;
    expect(combined.coords).toEqual(loop.coords);
    expect(combined.ascend).toBeCloseTo(loop.ascend, 0);
    expect(combined.length).toBeCloseTo(cumulativeDistances(loop.coords)[loop.coords.length - 1], 0);
    for (const l of legs) expect(l.segments[0].from).toBe(0);
  });

  it('sortiert nach Wunsch und erkennt Duplikate', () => {
    const mk = (score: number, ascend: number): { stats: RoundTripStats } => ({
      stats: { score, ascend, length: 50000, quality: 1, overlap: 0, paved: 1, unpaved: 0 },
    });
    const list = [mk(80, 500), mk(90, 200), mk(20, 50)];
    expect(sortSuggestions(list, 'quality').map((x) => x.stats.score)).toEqual([90, 80, 20]);
    expect(sortSuggestions(list, 'flat').map((x) => x.stats.ascend)).toEqual([200, 500, 50]);
    expect(sortSuggestions(list, 'hilly').map((x) => x.stats.ascend)).toEqual([500, 200, 50]);
    expect(isSimilar(loop, loop)).toBe(true);
  });
});

describe('Stichstraßen', () => {
  it('schneidet Hin- und Rückweg auf derselben Straße heraus', async () => {
    const { findSpurs, removeSpurs } = await import('./roundtrip');
    type P = [number, number];
    // Quadrat-Runde mit einer Stichstraße nach Osten an der Ecke (8.01, 50)
    const coords: P[] = [
      [8, 50],
      [8.005, 50],
      [8.01, 50],
      [8.015, 50], // Stich hin
      [8.02, 50], // Wendepunkt
      [8.02, 50], // doppelt
      [8.015, 50], // zurück
      [8.01, 50],
      [8.01, 50.01],
      [8, 50.01],
      [8, 50],
    ];
    expect(findSpurs(coords)).toEqual([[2, 7]]);
    const leg = {
      coords,
      ele: coords.map((_, i) => 100 + i),
      segments: [
        { from: 0, to: 4, tags: {}, surface: 'asphalt' as const, surfaceInferred: false, road: 'minor' as const },
        { from: 4, to: 10, tags: {}, surface: 'gravel' as const, surfaceInferred: false, road: 'track' as const },
      ],
      length: 4000,
      ascend: 10,
      time: 600,
      hints: [{ index: 8, cmd: 2, exit: 0, angle: -90 }],
    };
    const clean = removeSpurs(leg);
    expect(clean.coords).toEqual([coords[0], coords[1], coords[2], coords[8], coords[9], coords[10]]);
    expect(clean.segments.map((s) => [s.from, s.to])).toEqual([
      [0, 2],
      [2, 5],
    ]);
    expect(clean.hints).toEqual([{ index: 3, cmd: 2, exit: 0, angle: -90 }]);
    expect(clean.length).toBeLessThan(leg.length);
    expect(findSpurs(clean.coords)).toEqual([]);
  });

  it('erkennt Wenden über einen kleinen Kreisverkehr', async () => {
    const { findSpurs } = await import('./roundtrip');
    type P = [number, number];
    const coords: P[] = [
      [8, 50],
      [8.01, 50], // Abzweig J
      [8.02, 50], // hin
      [8.03, 50], // Kreisverkehr
      [8.0302, 50.0002],
      [8.0298, 50.0002],
      [8.03, 50], // wieder am Kreisverkehr
      [8.02, 50], // zurück
      [8.01, 50], // J
      [8.01, 50.01],
      [8, 50.01],
      [8, 50],
    ];
    expect(findSpurs(coords)).toEqual([[1, 8]]);
  });

  it('lässt den gemeinsamen Anfangs- und Endweg einer Runde stehen', async () => {
    const { findSpurs } = await import('./roundtrip');
    type P = [number, number];
    // Start → Abzweig über dieselbe Straße hin und am Ende zurück, dazwischen eine große Runde
    const coords: P[] = [
      [8, 50],
      [8.01, 50],
      [8.02, 50],
      [8.05, 50.02],
      [8.02, 50.05],
      [8.02, 50],
      [8.01, 50],
      [8, 50],
    ];
    expect(findSpurs(coords)).toEqual([]);
  });

  it('lässt eine Runde ohne Wendepunkt unverändert', async () => {
    const { removeSpurs } = await import('./roundtrip');
    const leg = {
      coords: [
        [8, 50],
        [8.01, 50],
        [8.01, 50.01],
        [8, 50],
      ] as [number, number][],
      ele: [1, 2, 3, 4],
      segments: [],
      length: 3000,
      ascend: 0,
      time: 500,
    };
    expect(removeSpurs(leg)).toBe(leg);
  });
});
