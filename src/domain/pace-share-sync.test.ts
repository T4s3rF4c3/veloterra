import { describe, expect, it } from 'vitest';
import { parseGpxTrack, parseTcxTrack } from './activities';
import { destination, type LngLat } from './geo';
import { estimateTime, paceFromTrack, personalPace, rideKind, type ActivityTrack } from './pace';
import { decodeShare, encodeShare, readShareHash, type SharedRoute } from './share';
import { chunks, planHeat, planRoutes } from './sync';

/** Fahrt nach Norden: je Stück Länge (m), Steigung (%) und Tempo (km/h) */
function ride(parts: { m: number; grade: number; kmh: number }[], start = Date.UTC(2026, 5, 1, 8)): ActivityTrack {
  const t: ActivityTrack = { coords: [[7, 49]], ele: [300], time: [start] };
  for (const p of parts) {
    const steps = Math.round(p.m / 20);
    for (let i = 0; i < steps; i++) {
      const last = t.coords[t.coords.length - 1];
      t.coords.push(destination(last, 0, 20) as LngLat);
      t.ele.push(t.ele[t.ele.length - 1] + (20 * p.grade) / 100);
      t.time.push(t.time[t.time.length - 1] + (20 / (p.kmh / 3.6)) * 1000);
    }
  }
  return t;
}

describe('persönliches Tempo', () => {
  it('ordnet Strecke und Zeit den Steigungsklassen zu', () => {
    const p = paceFromTrack(
      ride([
        { m: 6000, grade: 0, kmh: 30 },
        { m: 3000, grade: 6, kmh: 12 },
        { m: 3000, grade: -6.5, kmh: 45 },
      ]),
    )!;
    expect(p).not.toBeNull();
    const kmh = (k: string) => (p[k][0] / p[k][1]) * 3.6;
    expect(kmh('flat')).toBeCloseTo(30, 0);
    expect(kmh('u5')).toBeCloseTo(12, 0);
    expect(kmh('d6')).toBeCloseTo(45, 0);
  });

  it('zählt Pausen nicht mit', () => {
    const t = ride([{ m: 4000, grade: 0, kmh: 25 }]);
    // 10 Minuten Pause in der Mitte
    const mid = Math.floor(t.time.length / 2);
    for (let i = mid; i < t.time.length; i++) t.time[i] += 600_000;
    const p = paceFromTrack(t)!;
    expect((p.flat[0] / p.flat[1]) * 3.6).toBeCloseTo(25, 0);
  });

  it('ohne Zeit oder Höhe kein Tempo', () => {
    const t = ride([{ m: 5000, grade: 0, kmh: 25 }]);
    expect(paceFromTrack({ ...t, time: t.time.map(() => NaN) })).toBeNull();
    expect(paceFromTrack({ ...t, ele: t.ele.map(() => NaN) })).toBeNull();
  });

  it('nimmt passende Fahrten, füllt fehlende Klassen und schätzt die Zeit', () => {
    const flat = paceFromTrack(ride([{ m: 10000, grade: 0, kmh: 30 }]))!;
    const climb = paceFromTrack(ride([{ m: 4000, grade: 3, kmh: 20 }]))!;
    const tracks = [
      { pace: flat, kind: 'ride', start: 1 },
      { pace: climb, kind: 'ride', start: 2 },
      { pace: paceFromTrack(ride([{ m: 10000, grade: 0, kmh: 45 }]))!, kind: 'ebike', start: 3 },
    ];
    const pace = personalPace(tracks, 'road')!;
    expect(pace.rides).toBe(2);
    expect(pace.speeds.flat).toBeCloseTo(30, 0);
    expect(pace.measured.u2).toBe(true);
    expect(pace.measured.u8).toBe(false);
    // 10 km flach mit 30 km/h = 20 min
    const dist = Array.from({ length: 101 }, (_, i) => i * 100);
    expect(
      estimateTime(
        dist,
        dist.map(() => 100),
        pace,
      ) / 60,
    ).toBeCloseTo(20, 0);
  });

  it('erkennt die Fahrtart aus Strava', () => {
    expect(rideKind('Gravel Ride')).toBe('gravel');
    expect(rideKind('E-Bike Ride')).toBe('ebike');
    expect(rideKind('Mountain Bike Ride')).toBe('mtb');
    expect(rideKind('Radfahrt')).toBe('ride');
  });

  it('liest Höhe und Zeit aus GPX und TCX', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="49.1" lon="7.1"><ele>250.5</ele><time>2026-06-01T08:00:00Z</time></trkpt>
      <trkpt lat="49.2" lon="7.2"/>
    </trkseg></trk></gpx>`;
    const g = parseGpxTrack(gpx);
    expect(g.coords).toEqual([
      [7.1, 49.1],
      [7.2, 49.2],
    ]);
    expect(g.ele[0]).toBe(250.5);
    expect(g.time[0]).toBe(Date.UTC(2026, 5, 1, 8));
    expect(Number.isNaN(g.time[1])).toBe(true);
    const tcx = `<Trackpoint><Time>2026-06-01T08:00:05Z</Time><Position><LatitudeDegrees>49.79</LatitudeDegrees>
      <LongitudeDegrees>7.09</LongitudeDegrees></Position><AltitudeMeters>412</AltitudeMeters></Trackpoint>`;
    const t = parseTcxTrack(tcx);
    expect(t.coords).toEqual([[7.09, 49.79]]);
    expect(t.ele).toEqual([412]);
    expect(t.time).toEqual([Date.UTC(2026, 5, 1, 8, 0, 5)]);
  });
});

describe('Teilen-Link', () => {
  const route: SharedRoute = {
    v: 1,
    name: 'Moselrunde',
    waypoints: [
      { id: 'a', lng: 7.0712345678, lat: 49.91 },
      { id: 'b', lng: 7.2, lat: 49.95 },
    ],
    presetId: 'road',
    overrides: { 'a>b': { alternative: 1 } },
  };

  it('kodiert und dekodiert verlustfrei (auf ~1 m gerundet)', () => {
    const s = encodeShare(route);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeShare(s)!;
    expect(back.name).toBe('Moselrunde');
    expect(back.waypoints[0].lng).toBe(7.07123);
    expect(back.overrides).toEqual(route.overrides);
  });

  it('lehnt kaputte Links ab', () => {
    expect(decodeShare('abc')).toBeNull();
    expect(decodeShare(encodeShare({ ...route, waypoints: route.waypoints.slice(0, 1) }))).toBeNull();
  });

  it('erkennt Links im #-Teil', () => {
    expect(readShareHash('#s=Ab_12-xy')).toEqual({ kind: 's', value: 'Ab_12-xy' });
    expect(readShareHash('#r=eJxL')).toEqual({ kind: 'r', value: 'eJxL' });
    expect(readShareHash('#foo')).toBeNull();
  });
});

describe('Sync', () => {
  it('neuerer Stand gewinnt, Neues wird übertragen', () => {
    const plan = planRoutes(
      [
        { id: 'a', savedAt: 5 },
        { id: 'b', savedAt: 1 },
        { id: 'n', savedAt: 9 },
      ],
      [
        { id: 'a', savedAt: 3 },
        { id: 'b', savedAt: 4 },
        { id: 'r', savedAt: 2 },
      ],
      {},
      {},
    );
    expect(plan.push.sort()).toEqual(['a', 'n']);
    expect(plan.pull.sort()).toEqual(['b', 'r']);
    expect(plan.removeLocal).toEqual([]);
    expect(plan.removeRemote).toEqual([]);
  });

  it('Löschungen gehen in beide Richtungen', () => {
    const plan = planRoutes([{ id: 'x', savedAt: 2 }], [{ id: 'y', savedAt: 3 }], { x: 10 }, { x: 2, y: 3 });
    // x wurde auf einem anderen Gerät gelöscht, y hier
    expect(plan.removeLocal).toEqual(['x']);
    expect(plan.removeRemote).toEqual(['y']);
  });

  it('hier gelöscht, dort aber geändert: Änderung gewinnt', () => {
    const plan = planRoutes([], [{ id: 'y', savedAt: 8 }], {}, { y: 3 });
    expect(plan.pull).toEqual(['y']);
    expect(plan.removeRemote).toEqual([]);
  });

  it('nach dem Löschen hier neu gespeichert: bleibt', () => {
    const plan = planRoutes([{ id: 'x', savedAt: 20 }], [], { x: 10 }, { x: 5 });
    expect(plan.push).toEqual(['x']);
  });

  it('Fahrten: fehlende und solche mit Tempo-Daten abgleichen', () => {
    const plan = planHeat(
      new Map([
        ['a', false],
        ['b', true],
        ['c', false],
      ]),
      new Map([
        ['a', true],
        ['b', false],
        ['d', false],
      ]),
    );
    expect(plan.upload.sort()).toEqual(['b', 'c']);
    expect(plan.download.sort()).toEqual(['a', 'd']);
  });

  it('teilt in Pakete', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
