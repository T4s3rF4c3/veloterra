import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/roundtrip.json';
import { cumulativeDistances, type LngLat } from './geo';
import { combineLegs, parseBRouter } from './route';
import {
  candidateDirections,
  isSimilar,
  legCountFor,
  overlapRatio,
  joinLegs,
  rateRoundTrip,
  roundTripSettings,
  sortSuggestions,
  splitIntoLegs,
  type RoundTripStats,
} from './roundtrip';
import { DEFAULT_SETTINGS, PRESETS, cloneSettings, rebaseSettings } from './settings';
import { improvedSettings, isBetter } from './improve';

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

describe('Rundtour: Höhenmeter', () => {
  const stats = (ascend: number, score = 80) => ({
    stats: { length: 50000, ascend, quality: 1, overlap: 0, paved: 1, unpaved: 0, score },
  });

  it('„möglichst wenig“ verschärft die Steigungs-Strafe, „gern viel“ nimmt sie weg', () => {
    const base = PRESETS[0].settings;
    expect(roundTripSettings(base, 'low', 0).hills).toBe('max');
    expect(roundTripSettings({ ...base, hills: 'strong' }, 'high', 0).hills).toBe('ignore');
    expect(roundTripSettings({ ...base, hills: 'ignore' }, 'any', 500).hills).toBe('strong');
    expect(roundTripSettings(base, 'any', 0)).toBe(base);
  });

  it('probiert mit Höhenmeter-Wunsch mehr Richtungen', () => {
    expect(candidateDirections('any', true)).toHaveLength(8);
    expect(candidateDirections(90, true)).toEqual([40, 65, 90, 115, 140]);
    expect(candidateDirections(90)).toEqual([55, 90, 125]);
  });

  it('Runden über dem Limit stehen hinten, sonst die flachste vorn', () => {
    const list = [stats(900), stats(400), stats(600), stats(300, 20)];
    const sorted = sortSuggestions(list, 'flat', 650).map((s) => s.stats.ascend);
    // 300 hm ist zwar flach, aber ungeeignet (Score 20) → hinter den passenden
    expect(sorted).toEqual([400, 600, 300, 900]);
  });
});

describe('Hin & zurück und Verbessern', () => {
  const leg = (coords: LngLat[], ascend: number, surface: 'asphalt' | 'gravel' = 'asphalt') => ({
    coords,
    ele: coords.map(() => 100),
    segments: [{ from: 0, to: coords.length - 1, tags: {}, surface, surfaceInferred: false, road: 'minor' as const }],
    length: cumulativeDistances(coords).at(-1)!,
    ascend,
    time: 600,
  });

  it('verbindet Hin- und Rückweg zu einer Etappe', () => {
    const a = leg(
      [
        [7, 49],
        [7.01, 49],
        [7.02, 49],
      ],
      50,
    );
    const b = leg(
      [
        [7.02, 49],
        [7.01, 49.001],
        [7, 49],
      ],
      30,
      'gravel',
    );
    const j = joinLegs(a, b);
    expect(j.coords).toHaveLength(5);
    expect(j.ascend).toBe(80);
    expect(j.segments[1]).toMatchObject({ from: 2, to: 4, surface: 'gravel' });
  });

  it('Hin & zurück auf demselben Weg zählt nicht als „doppelt“', () => {
    const a = leg(
      [
        [7, 49],
        [7.01, 49],
      ],
      0,
    );
    const back = leg(
      [
        [7.01, 49],
        [7, 49],
      ],
      0,
    );
    const j = joinLegs(a, back);
    expect(rateRoundTrip(j, DEFAULT_SETTINGS, j.length).overlap).toBeGreaterThan(0.9);
    expect(rateRoundTrip(j, DEFAULT_SETTINGS, j.length, true).overlap).toBe(0);
  });

  it('übernimmt nur spürbare Verbesserungen ohne großen Umweg', () => {
    const s = (length: number, ascend: number, paved = 1, busy = 0) => ({ length, ascend, paved, unpaved: 0, busy });
    expect(isBetter('climb', 'road', s(10000, 300), s(11000, 220))).toBe(true);
    expect(isBetter('climb', 'road', s(10000, 300), s(10000, 295))).toBe(false);
    expect(isBetter('climb', 'road', s(10000, 300), s(14000, 100))).toBe(false);
    expect(isBetter('traffic', 'road', s(10000, 0, 1, 0.4), s(10500, 0, 1, 0.1))).toBe(true);
    expect(improvedSettings(DEFAULT_SETTINGS, 'climb').hills).toBe('max');
    expect(improvedSettings(DEFAULT_SETTINGS, 'traffic').traffic).toBe(1);
  });
});

describe('Profil ändern: Etappen mit eigenen Einstellungen', () => {
  it('übernimmt die Profiländerung, behält aber die eigene Abweichung', () => {
    const oldBase = cloneSettings(DEFAULT_SETTINGS);
    // Etappe: „hier Schotter ok“ und weniger Höhenmeter
    const own = cloneSettings(oldBase);
    own.surface.gravel = 'prefer';
    own.hills = 'max';
    // Profil: Verkehr stärker meiden, Kopfstein verboten
    const newBase = cloneSettings(oldBase);
    newBase.traffic = 1;
    newBase.surface.cobble = 'forbid';
    const r = rebaseSettings(own, oldBase, newBase);
    expect(r.traffic).toBe(1);
    expect(r.surface.cobble).toBe('forbid');
    expect(r.surface.gravel).toBe('prefer');
    expect(r.hills).toBe('max');
  });

  it('ohne eigene Abweichung ist die Etappe danach genau das neue Profil', () => {
    const oldBase = cloneSettings(DEFAULT_SETTINGS);
    const newBase = cloneSettings(PRESETS[2].settings);
    expect(rebaseSettings(cloneSettings(oldBase), oldBase, newBase)).toEqual(newBase);
  });
});
