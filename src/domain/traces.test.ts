// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cumulativeDistances, type LngLat } from './geo';
import { classifyTrace, cleanRuns, densityPoints } from './traces';

/** Spur nach Osten mit gleichmäßigem Tempo (km/h), ein Punkt alle 5 s */
function trace(kmh: number, n = 60) {
  const step = (kmh / 3.6) * 5; // Meter je 5 s
  const dLng = step / (111320 * Math.cos((50 * Math.PI) / 180));
  const points: LngLat[] = Array.from({ length: n }, (_, i) => [8 + i * dLng, 50]);
  const times = points.map((_, i) => i * 5000);
  return { points, times };
}

describe('GPS-Spuren einordnen', () => {
  it('schätzt aus dem Tempo, wer unterwegs war', () => {
    expect(classifyTrace(trace(5))).toBe('foot');
    expect(classifyTrace(trace(17))).toBe('bike');
    expect(classifyTrace(trace(29))).toBe('fast');
    expect(classifyTrace(trace(70))).toBe('motor');
    expect(classifyTrace({ ...trace(20), times: null })).toBe('unknown');
  });

  it('ignoriert Pausen beim Tempo', () => {
    const t = trace(28, 60);
    // 20 Punkte Stillstand (gleicher Ort) in der Mitte
    const points = [...t.points.slice(0, 30), ...Array(20).fill(t.points[29]), ...t.points.slice(30)];
    const times = points.map((_, i) => i * 5000);
    expect(classifyTrace({ points, times })).toBe('fast');
  });

  it('verteilt Punkte gleichmäßig, egal wie oft das Gerät speichert', () => {
    const dense = trace(20, 200).points; // alle ~28 m
    const sparse = dense.filter((_, i) => i % 10 === 0 || i === dense.length - 1); // alle ~280 m
    const d = cumulativeDistances(dense);
    const len = d[d.length - 1];
    expect(densityPoints(dense).length).toBeCloseTo(len / 25, -1);
    expect(densityPoints(sparse).length).toBeCloseTo(densityPoints(dense).length, -1);
  });

  it('überbrückt keine großen Lücken', () => {
    const a: LngLat[] = [
      [8, 50],
      [8.001, 50],
    ];
    const b: LngLat[] = [
      [8.02, 50],
      [8.021, 50],
    ];
    const pts = densityPoints([...a, ...b]);
    // nichts zwischen 8.002 und 8.019
    expect(pts.some((p) => p[0] > 8.002 && p[0] < 8.019)).toBe(false);
  });
});

describe('Kacheln für die GPS-Spuren', () => {
  it('teilt einen Ausschnitt in feste Kacheln', async () => {
    const { cellsFor, cellBbox, quarters, aggregate } = await import('./traceGrid');
    expect(cellsFor([7.05, 49.75, 7.15, 49.82])).toEqual(['70:497', '70:498', '71:497', '71:498']);
    expect(cellBbox('70:497')).toEqual([7, 49.7, 7.1, 49.8]);
    expect(quarters([7, 49.7, 7.1, 49.8])[3]).toEqual([7.05, 49.75, 7.1, 49.8]);
    // genau auf einer Kachelgrenze: keine zusätzliche Kachel
    expect(cellsFor([7, 49.7, 7.1, 49.8])).toEqual(['70:497']);
    // Punkte derselben Art in derselben Rasterzelle werden gezählt
    const bins = aggregate([
      { coord: [7.00001, 49.70001], kind: 'bike', trace: 1 },
      { coord: [7.00002, 49.70002], kind: 'bike', trace: 1 }, // dieselbe Spur zählt nur einmal
      { coord: [7.00003, 49.70003], kind: 'bike', trace: 2 },
      { coord: [7.00002, 49.70002], kind: 'fast', trace: 3 },
    ]);
    expect(bins.count.length).toBe(2);
    expect(Math.max(...bins.count)).toBe(2);
  });
});

describe('Spuren bereinigen', () => {
  it('trennt bei Lücken, Pausen und GPS-Sprüngen und verwirft Bruchstücke', () => {
    const t = trace(20, 80); // ~28 m alle 5 s
    const points = [...t.points];
    const times = [...t.times];
    // Spur verlässt die Kachel: 400 m ohne Punkte
    for (let i = 40; i < points.length; i++) {
      points[i] = [points[i][0] + 0.0056, points[i][1]];
      times[i] += 60000;
    }
    // GPS-Sprung: ein Punkt 500 m daneben
    points[20] = [points[20][0], points[20][1] + 0.0045];
    const runs = cleanRuns({ points, times });
    // Stücke: vor dem Sprung, zwischen Sprung und Lücke, nach der Lücke
    expect(runs).toHaveLength(3);
    for (const r of runs) {
      const d = cumulativeDistances(r);
      expect(d[d.length - 1]).toBeGreaterThanOrEqual(150);
    }
    expect(runs.some((r) => r.includes(points[20]))).toBe(false);
  });

  it('erkennt Autos in der Stadt an Spitzen über 50 km/h', () => {
    // 30 km/h, aber jedes vierte Stück mit 55 km/h
    const t = trace(30, 60);
    const perM = 1 / (111320 * Math.cos((50 * Math.PI) / 180));
    let x = 8;
    const pts: LngLat[] = t.times.map((_, i) => {
      if (i > 0) x += ((i % 4 === 0 ? 55 : 30) / 3.6) * 5 * perM;
      return [x, 50];
    });
    expect(classifyTrace({ points: pts, times: t.times })).toBe('motor');
  });
});
