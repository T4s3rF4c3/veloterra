import { create } from 'zustand';
import { useStore } from './store';

/** Teil des Zustands, der rückgängig gemacht werden kann. */
type Snapshot = Pick<
  ReturnType<typeof useStore.getState>,
  'waypoints' | 'overrides' | 'blocks' | 'settings' | 'presetId' | 'routeName' | 'savedId'
>;

/** Änderungen an diesen Feldern erzeugen einen Schritt im Verlauf */
const TRACKED = ['waypoints', 'overrides', 'blocks', 'settings', 'presetId'] as const;

const LIMIT = 50;
/** Änderungen kurz hintereinander (z. B. „Anders planen“ = mehrere Aktionen) zählen als ein Schritt */
const MERGE_MS = 400;

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  /** kurzer Hinweis nach größeren Änderungen, z. B. „Route geleert“ */
  notice: string | null;
  dismissNotice: () => void;
}

export const useHistory = create<HistoryState>()((set) => ({
  canUndo: false,
  canRedo: false,
  notice: null,
  dismissNotice: () => set({ notice: null }),
}));

const past: Snapshot[] = [];
const future: Snapshot[] = [];
let applying = false;
let lastPush = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function snapshot(s: Snapshot): Snapshot {
  return {
    waypoints: s.waypoints,
    overrides: s.overrides,
    blocks: s.blocks,
    settings: s.settings,
    presetId: s.presetId,
    routeName: s.routeName,
    savedId: s.savedId,
  };
}

function sync() {
  useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 });
}

function notify(text: string) {
  clearTimeout(noticeTimer);
  useHistory.setState({ notice: text });
  noticeTimer = setTimeout(() => useHistory.setState({ notice: null }), 7000);
}

/** Was ist passiert? Für den Hinweis nach größeren Änderungen. */
function describe(prev: Snapshot, next: Snapshot): string | null {
  if (prev.waypoints.length >= 2 && next.waypoints.length === 0) return 'Route geleert';
  const ids = new Set(prev.waypoints.map((w) => w.id));
  if (prev.waypoints.length >= 2 && next.waypoints.length > 0 && !next.waypoints.some((w) => ids.has(w.id)))
    return 'Route ersetzt';
  if (next.blocks.length < prev.blocks.length) return 'Sperre entfernt';
  return null;
}

let started = false;

/** Verlauf mitschreiben. Einmal beim Start aufrufen. */
export function initHistory() {
  if (started) return;
  started = true;
  useStore.subscribe((state, prev) => {
    if (applying) return;
    if (!TRACKED.some((k) => state[k] !== prev[k])) return;
    const now = Date.now();
    if (now - lastPush > MERGE_MS || !past.length) {
      past.push(snapshot(prev));
      if (past.length > LIMIT) past.shift();
    }
    lastPush = now;
    future.length = 0;
    const text = describe(prev, state);
    if (text) notify(text);
    sync();
  });
}

function apply(s: Snapshot) {
  applying = true;
  useStore.setState({ ...s, selection: null, editingLeg: null, activeCheck: null });
  applying = false;
  lastPush = 0;
}

export function undo() {
  const s = past.pop();
  if (!s) return;
  future.push(snapshot(useStore.getState()));
  apply(s);
  useHistory.setState({ notice: null });
  sync();
}

export function redo() {
  const s = future.pop();
  if (!s) return;
  past.push(snapshot(useStore.getState()));
  apply(s);
  sync();
}

/** Nur für Tests */
export function resetHistory() {
  past.length = 0;
  future.length = 0;
  lastPush = 0;
  useHistory.setState({ canUndo: false, canRedo: false, notice: null });
}
