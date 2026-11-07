// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// localStorage-Ersatz für den persist-Store
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
});

const { useStore } = await import('./store');
const { initHistory, redo, resetHistory, undo, useHistory } = await import('./history');

describe('Rückgängig / Wiederholen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStore.setState({ waypoints: [], overrides: {}, blocks: [] });
    initHistory();
    resetHistory();
  });

  const step = () => vi.advanceTimersByTime(1000);
  const count = () => useStore.getState().waypoints.length;

  it('nimmt Schritte zurück und stellt sie wieder her', () => {
    useStore.getState().addWaypoint([8, 50]);
    step();
    useStore.getState().addWaypoint([8.1, 50]);
    step();
    expect(count()).toBe(2);
    undo();
    expect(count()).toBe(1);
    undo();
    expect(count()).toBe(0);
    expect(useHistory.getState().canUndo).toBe(false);
    redo();
    redo();
    expect(count()).toBe(2);
    expect(useHistory.getState().canRedo).toBe(false);
  });

  it('fasst schnelle Folgeänderungen zu einem Schritt zusammen', () => {
    useStore.getState().addWaypoint([8, 50]);
    useStore.getState().addWaypoint([8.1, 50]);
    useStore.getState().addWaypoint([8.2, 50]);
    step();
    undo();
    expect(count()).toBe(0);
  });

  it('meldet „Route geleert“ und verwirft Redo nach neuer Änderung', () => {
    useStore.getState().addWaypoint([8, 50]);
    step();
    useStore.getState().addWaypoint([8.1, 50]);
    step();
    useStore.getState().clearRoute();
    expect(useHistory.getState().notice).toBe('Route geleert');
    undo();
    expect(count()).toBe(2);
    step();
    useStore.getState().addWaypoint([8.3, 50]);
    expect(useHistory.getState().canRedo).toBe(false);
  });

  it('ignoriert Änderungen an Ansicht und Farbmodus', () => {
    useStore.getState().setColorMode('grade');
    useStore.getState().setBasemap('aerial');
    expect(useHistory.getState().canUndo).toBe(false);
  });
});
