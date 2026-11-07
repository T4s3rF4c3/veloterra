import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/short-route.json';
import { classifyRoad, classifySurface, parseWayTags } from './classify';
import { bearing, cumulativeDistances, projectOnLine, sliceLine, type LngLat } from './geo';
import { generateProfile, trailChain } from './profile';
import { breakdown, combineLegs, nogosAlongLine, parseBRouter } from './route';
import { DEFAULT_SETTINGS, PRESETS, cloneSettings } from './settings';

describe('classify', () => {
  it('erkennt Belag aus surface-Tag', () => {
    expect(classifySurface(parseWayTags('highway=track surface=fine_gravel')).cat).toBe('compacted');
    expect(classifySurface(parseWayTags('highway=residential surface=sett')).cat).toBe('cobble');
  });

  it('leitet Belag ohne surface-Tag ab', () => {
    expect(classifySurface(parseWayTags('highway=tertiary'))).toEqual({ cat: 'asphalt', inferred: true });
    expect(classifySurface(parseWayTags('highway=track tracktype=grade3')).cat).toBe('gravel');
    expect(classifySurface(parseWayTags('highway=path')).cat).toBe('unknown');
  });

  it('ordnet Straßenarten zu', () => {
    expect(classifyRoad(parseWayTags('highway=primary'))).toBe('primary');
    expect(classifyRoad(parseWayTags('highway=path bicycle=designated'))).toBe('cycleway');
    expect(classifyRoad(parseWayTags('highway=residential bicycle_road=yes'))).toBe('cycleway');
    expect(classifyRoad(parseWayTags('highway=track'))).toBe('track');
  });
});

describe('generateProfile', () => {
  it('setzt die Faktoren aus den Einstellungen ein', () => {
    const s = cloneSettings(DEFAULT_SETTINGS);
    s.surface.gravel = 'forbid';
    s.road.primary = 'prefer';
    const p = generateProfile(s);
    expect(p).toMatch(/surface=gravel\|pebblestone then 10000/);
    expect(p).toMatch(/highway=trunk\|trunk_link\|primary\|primary_link then 1\n/);
    expect(p).toContain('---context:global');
    expect(p).toContain('---context:node');
  });

  it('reagiert auf Optionen', () => {
    const s = cloneSettings(DEFAULT_SETTINGS);
    s.hills = 'strong';
    s.speedLimit = '70';
    s.preferCycleRoutes = true;
    const p = generateProfile(s);
    expect(p).toContain('assign uphillcost     = 100');
    expect(p).toMatch(/maxspeed=80\|90/);
    expect(p).toContain('if any_cycleroute then 0.8 else 1');
  });

  it('erzeugt für alle Presets ein Profil', () => {
    for (const preset of PRESETS) expect(generateProfile(preset.settings).length).toBeGreaterThan(1000);
  });
});

describe('route', () => {
  const leg = parseBRouter(fixture as never);

  it('parst Geometrie und Abschnitte lückenlos', () => {
    expect(leg.coords.length).toBeGreaterThan(10);
    expect(leg.segments.length).toBeGreaterThan(0);
    expect(leg.segments[0].from).toBe(0);
    for (let i = 1; i < leg.segments.length; i++) expect(leg.segments[i].from).toBe(leg.segments[i - 1].to);
    expect(leg.segments[leg.segments.length - 1].to).toBe(leg.coords.length - 1);
  });

  it('kombiniert Etappen ohne doppelte Punkte', () => {
    const r = combineLegs([
      { key: 'a', result: leg },
      { key: 'b', result: leg },
    ])!;
    expect(r.coords.length).toBe(leg.coords.length * 2 - 1);
    expect(r.legRanges[1].from).toBe(leg.coords.length - 1);
    const b = breakdown(r);
    const total = Object.values(b.surface).reduce((a, x) => a + (x ?? 0), 0);
    expect(total).toBeCloseTo(r.dist[r.dist.length - 1], 0);
  });
});

describe('geo', () => {
  const line: LngLat[] = [
    [8, 50],
    [8.01, 50],
    [8.02, 50],
  ];
  const dist = cumulativeDistances(line);

  it('berechnet die Fahrtrichtung', () => {
    expect(bearing([8, 50], [8, 50.01])).toBeCloseTo(0, 0);
    expect(bearing([8, 50], [8.01, 50])).toBeCloseTo(90, 0);
    expect(bearing([8, 50], [8, 49.99])).toBeCloseTo(180, 0);
  });

  it('projiziert Klicks auf die Linie', () => {
    const p = projectOnLine([8.015, 50.0005], line, dist)!;
    expect(p.index).toBe(1);
    expect(p.distance).toBeCloseTo(dist[2] * 0.75, -1);
    expect(p.offset).toBeLessThan(60);
  });

  it('schneidet Abschnitte und legt Sperrzonen', () => {
    const part = sliceLine(line, dist, dist[2] * 0.25, dist[2] * 0.75);
    expect(part.length).toBe(3);
    const nogos = nogosAlongLine(part, cumulativeDistances(part));
    expect(nogos.length).toBeGreaterThan(5);
  });
});

describe('Radtypen', () => {
  it('hat für jeden Radtyp Profile mit passendem Tempo-Modell', () => {
    for (const bike of ['road', 'gravel', 'mtb', 'trekking'] as const) {
      const presets = PRESETS.filter((p) => p.settings.bike === bike);
      expect(presets.length).toBeGreaterThan(0);
      expect(generateProfile(presets[0].settings)).toContain(`# Profil (${bike})`);
    }
    expect(generateProfile(PRESETS.find((p) => p.id === 'mtb-tour')!.settings)).toContain('assign C_r        = 0.012');
  });

  it('sperrt Trails über der gewählten Schwierigkeit', () => {
    expect(trailChain('none')).toBe('assign trailfactor = 1');
    const s1 = trailChain('1');
    expect(s1).toMatch(/mtb:scale=2-\|2\|2\+\|3\|4\|5\|6 then 10000/);
    expect(s1).toContain('demanding_mountain_hiking');
    expect(trailChain('3')).toMatch(/mtb:scale=4\|5\|6 then/);
  });

  it('behandelt alte Einstellungen ohne Radtyp wie Rennrad ohne Trail-Filter', () => {
    const old = cloneSettings(DEFAULT_SETTINGS);
    delete old.bike;
    delete old.trailLevel;
    const p = generateProfile(old);
    expect(p).toContain('# Profil (road)');
    expect(p).toContain('assign trailfactor = 1');
  });
});
