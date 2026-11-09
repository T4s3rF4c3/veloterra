import { describe, expect, it } from 'vitest';
import { cellFromJson, cellToJson, parseTrackpoints } from './traceCell';

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.0" creator="OpenStreetMap.org" xmlns="http://www.topografix.com/GPX/1/0">
  <trk>
    <name>Fahrt</name>
    <trkseg>
      <trkpt lat="50.1000000" lon="8.6000000">
        <time>2024-05-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="50.1010000" lon="8.6010000">
        <time>2024-05-01T10:00:10Z</time>
      </trkpt>
    </trkseg>
  </trk>
  <trk>
    <trkseg>
      <trkpt lat="49.5" lon="7.5"/>
      <trkpt lat="49.6" lon="7.6"/>
    </trkseg>
  </trk>
</gpx>`;

describe('parseTrackpoints', () => {
  it('liest Segmente, Koordinaten und Zeiten', () => {
    const t = parseTrackpoints(GPX);
    expect(t).toHaveLength(2);
    expect(t[0].points).toEqual([
      [8.6, 50.1],
      [8.601, 50.101],
    ]);
    expect(t[0].times).toEqual([Date.parse('2024-05-01T10:00:00Z'), Date.parse('2024-05-01T10:00:10Z')]);
  });

  it('lässt Zeiten weg, wenn Punkte keine haben', () => {
    const t = parseTrackpoints(GPX);
    expect(t[1].points).toHaveLength(2);
    expect(t[1].times).toBeNull();
  });
});

describe('cellToJson / cellFromJson', () => {
  it('überträgt die Kachel verlustfrei', () => {
    const rec = {
      v: 2,
      id: '86:501',
      at: 1,
      partial: false,
      counts: { foot: 1, bike: 2, fast: 0, motor: 0, unknown: 0 },
      bins: {
        lng: new Float32Array([8.6375, 8.6374]),
        lat: new Float32Array([50.1, 50.1001]),
        kind: new Uint8Array([1, 2]),
        count: new Uint16Array([3, 70000 % 65536]),
      },
    };
    const back = cellFromJson(JSON.parse(JSON.stringify(cellToJson(rec))));
    expect(back.bins.lng).toEqual(rec.bins.lng);
    expect(back.bins.count).toEqual(rec.bins.count);
    expect(back.bins.kind).toBeInstanceOf(Uint8Array);
  });
});
