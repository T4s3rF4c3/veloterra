import { describe, expect, it } from 'vitest';
import { cumulativeDistances, type LngLat } from './geo';
import { weatherInfo, weatherSamples, weatherSummary, type WeatherPoint } from './weather';

const pt = (distance: number, temp: number, rainProb: number): WeatherPoint => ({
  distance,
  time: 0,
  temp,
  feels: temp,
  rainProb,
  rain: 0,
  code: 0,
});

describe('weatherSamples', () => {
  const coords: LngLat[] = Array.from({ length: 50 }, (_, i) => [8 + i * 0.01, 50]);
  const dist = cumulativeDistances(coords);
  const total = dist[dist.length - 1];

  it('nimmt Start und Ziel und verteilt die Zeit über die Fahrzeit', () => {
    const s = weatherSamples(coords, dist, 1_000_000, 3600);
    expect(s[0].distance).toBe(0);
    expect(s[s.length - 1].distance).toBeCloseTo(total);
    expect(s[0].time).toBe(1_000_000);
    expect(s[s.length - 1].time).toBeCloseTo(1_000_000 + 3600_000);
  });

  it('nutzt 3 bis 8 Stellen', () => {
    expect(weatherSamples(coords.slice(0, 3), dist.slice(0, 3), 0, 60)).toHaveLength(3);
    const long: LngLat[] = Array.from({ length: 200 }, (_, i) => [8 + i * 0.01, 50]);
    expect(weatherSamples(long, cumulativeDistances(long), 0, 36000)).toHaveLength(8);
  });
});

describe('weatherSummary', () => {
  it('meldet trockenes Wetter mit Temperaturspanne', () => {
    expect(weatherSummary([pt(0, 12.4, 5), pt(10000, 17.6, 10)])).toBe('12–18 °C · trocken');
  });

  it('nennt die höchste Regenwahrscheinlichkeit und ab welchem km', () => {
    expect(weatherSummary([pt(0, 14, 5), pt(35000, 15, 40), pt(60000, 15, 70)])).toBe(
      '14–15 °C · Regen bis 70 % ab km 35',
    );
  });
});

describe('weatherInfo', () => {
  it('ordnet WMO-Codes zu', () => {
    expect(weatherInfo(0).icon).toBe('sun');
    expect(weatherInfo(63).label).toBe('Regen');
    expect(weatherInfo(95).icon).toBe('thunder');
  });
});
