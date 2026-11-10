import { describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', () => ({ addProtocol: () => undefined }));
const { rainFrameAt } = await import('../api/rain');

const T = (h: number, m = 0) => Date.UTC(2026, 10, 10, h, m);
const cov = { radar: { start: T(0), end: T(10, 25) }, icon: { start: T(0), end: T(23) } };

describe('Regenbild zur Uhrzeit', () => {
  it('bis 2 Stunden voraus: Radar in 5-Minuten-Schritten', () => {
    expect(rainFrameAt(T(8, 13), cov, T(8, 20))).toEqual({ kind: 'radar', time: T(8, 10), observed: true });
    expect(rainFrameAt(T(9, 47), cov, T(8, 20))).toEqual({ kind: 'radar', time: T(9, 45), observed: false });
  });

  it('danach: ICON-Stunde, in die die Uhrzeit fällt', () => {
    expect(rainFrameAt(T(14, 20), cov, T(8, 20))).toEqual({ kind: 'icon', time: T(15), observed: false });
    expect(rainFrameAt(T(14, 0), cov, T(8, 20))?.time).toBe(T(15));
  });

  it('ohne Vorhersage: nichts', () => {
    expect(rainFrameAt(T(23, 30), cov, T(8, 20))).toBeNull();
    expect(rainFrameAt(T(9), { radar: null, icon: null }, T(8))).toBeNull();
  });
});
