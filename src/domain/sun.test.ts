import { describe, expect, it } from 'vitest';
import { sunTimes } from './sun';

const hm = (t: number | null) => (t === null ? null : new Date(t).toISOString().slice(11, 16));

describe('Sonnenauf- und -untergang', () => {
  it('Bernkastel-Kues im November (UTC)', () => {
    // Referenz: Aufgang ~06:38 UTC, Untergang ~15:54 UTC am 10.11.2026
    const s = sunTimes(Date.UTC(2026, 10, 10, 11), 49.92, 7.07);
    const near = (t: number | null, ref: string) => {
      const [h, m] = ref.split(':').map(Number);
      const d = new Date(t!);
      expect(Math.abs(d.getUTCHours() * 60 + d.getUTCMinutes() - (h * 60 + m))).toBeLessThanOrEqual(4);
    };
    near(s.sunrise, '06:38');
    near(s.sunset, '15:54');
    expect(s.dusk! - s.sunset!).toBeGreaterThan(25 * 60_000);
    expect(s.dawn!).toBeLessThan(s.sunrise!);
  });

  it('Polarnacht: keine Zeiten', () => {
    expect(hm(sunTimes(Date.UTC(2026, 11, 21, 12), 78, 15).sunrise)).toBeNull();
  });
});
