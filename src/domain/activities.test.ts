// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  activityFormat,
  isOutdoorRide,
  parseFitPoints,
  parseGpxPoints,
  parseTcxPoints,
  stravaActivityTypes,
} from './activities';
import { HeatIndex } from './heat';

describe('Aktivitäten einlesen', () => {
  it('liest GPX unabhängig von der Attribut-Reihenfolge', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="50.1" lon="8.1"><ele>1</ele></trkpt>
      <trkpt lon='8.2' lat='50.2'/>
      <trkpt lat="0" lon="0"/>
    </trkseg></trk></gpx>`;
    expect(parseGpxPoints(gpx)).toEqual([
      [8.1, 50.1],
      [8.2, 50.2],
    ]);
  });

  it('liest TCX', () => {
    const tcx = `<Trackpoint><Position>
      <LatitudeDegrees>49.79</LatitudeDegrees>
      <LongitudeDegrees>7.09</LongitudeDegrees>
    </Position></Trackpoint>`;
    expect(parseTcxPoints(tcx)).toEqual([[7.09, 49.79]]);
  });

  it('liest Positionen aus FIT', () => {
    const toSemi = (deg: number) => Math.round((deg * 2 ** 31) / 180);
    const body: number[] = [];
    const u32 = (v: number) => body.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
    // Definition: lokale Nachricht 0 = record (20) mit timestamp, lat, lon
    body.push(0x40, 0, 0, 20, 0, 3, 253, 4, 0x86, 0, 4, 0x85, 1, 4, 0x85);
    for (const [lat, lon] of [
      [49.7924, 7.0907],
      [49.8, 7.1],
    ]) {
      body.push(0x00);
      u32(1000);
      u32(toSemi(lat));
      u32(toSemi(lon));
    }
    // Datensatz ohne gültige Position wird übersprungen
    body.push(0x00);
    u32(1001);
    u32(0x7fffffff);
    u32(0x7fffffff);
    const header = [14, 0x10, 0, 0, body.length & 255, (body.length >> 8) & 255, 0, 0, 46, 70, 73, 84, 0, 0];
    const pts = parseFitPoints(new Uint8Array([...header, ...body, 0, 0]));
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBeCloseTo(7.0907, 5);
    expect(pts[0][1]).toBeCloseTo(49.7924, 5);
  });

  it('erkennt Formate und Radfahrten aus dem Strava-Export', () => {
    expect(activityFormat('activities/123.fit.gz')).toEqual({ format: 'fit', gzip: true });
    expect(activityFormat('tour.GPX')).toEqual({ format: 'gpx', gzip: false });
    expect(activityFormat('notes.txt')).toBeNull();
    const csv =
      'Activity ID,Activity Date,Activity Name,Activity Type,Filename\n1,"Jan 1, 2026",Runde,Ride,activities/1.gpx\n2,x,"Lauf, kurz",Run,activities/2.fit.gz\n3,x,Zwift,Virtual Ride,activities/3.fit.gz\n';
    const types = stravaActivityTypes(csv);
    expect(types.get('1.gpx')).toBe('Ride');
    expect(types.get('2.fit.gz')).toBe('Run');
    expect(isOutdoorRide('Ride')).toBe(true);
    expect(isOutdoorRide('Gravel Ride')).toBe(true);
    expect(isOutdoorRide('Radfahrt')).toBe(true);
    expect(isOutdoorRide('Run')).toBe(false);
    expect(isOutdoorRide('Virtual Ride')).toBe(false);
  });
});

describe('Eigene Heatmap', () => {
  it('erkennt gefahrene und neue Strecken, Parallelstraße 150 m daneben gilt als neu', () => {
    const idx = new HeatIndex();
    // gefahren: 5 km nach Osten entlang 50°N
    idx.add([
      [8, 50],
      [8.07, 50],
    ]);
    expect(
      idx.novelty([
        [8.01, 50.0001],
        [8.06, 50.0001],
      ]),
    ).toBe(0);
    // parallel 150 m nördlich
    expect(
      idx.novelty([
        [8.01, 50.00135],
        [8.06, 50.00135],
      ]),
    ).toBe(1);
    // halb drauf, halb neu
    const half = idx.novelty([
      [8.04, 50],
      [8.1, 50],
    ]);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });
});
