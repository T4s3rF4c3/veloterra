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
