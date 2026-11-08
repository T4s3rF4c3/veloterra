import { useEffect, useMemo, useRef, useState } from 'react';
import { requestKey, routeLeg, type LegRequest } from '../api/brouter';
import { combineLegs, legKey, type CombinedRoute, type LegResult, type Nogo } from '../domain/route';
import { useStore } from '../store';

export interface LegStatus {
  key: string;
  index: number;
  loading: boolean;
  error?: string;
}

const cache = new Map<string, LegResult>();

/**
 * Etappen der aktuellen Route im Browser speichern – nach dem Neuladen ist
 * die Route sofort da, und importierte/übernommene Etappen bleiben exakt.
 */
const STORE_KEY = 'bike-planner-legs';
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, LegResult>;
  for (const [k, v] of Object.entries(saved)) cache.set(k, v);
} catch {
  /* ignorieren */
}

let current: Record<string, LegResult> = {};

/** Etappen der aktuellen Route (z. B. zum Speichern in „Meine Routen“). */
export function snapshotLegs(): Record<string, LegResult> {
  return current;
}

/** Gespeicherte Etappen wieder in den Cache legen. */
export function restoreLegs(legs: Record<string, LegResult>) {
  for (const [k, v] of Object.entries(legs)) cache.set(k, v);
}

function persistLegs(keys: string[]) {
  const out: Record<string, LegResult> = {};
  for (const k of keys) {
    const r = cache.get(k);
    if (r) out[k] = r;
  }
  current = out;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch {
    /* Speicher voll – dann eben ohne */
  }
}

/** Fertig berechnete Etappe vorab in den Cache legen (z. B. aus einer Rundtour). */
export function primeLeg(req: LegRequest, result: LegResult) {
  cache.set(requestKey(req), result);
}

/** Sperrzonen, die für jede Etappe gelten – dieselbe Reihenfolge wie im Hook. */
export function globalNogos(blocks: { nogos: Nogo[] }[]): Nogo[] {
  return blocks.flatMap((b) => b.nogos);
}

/**
 * Berechnet alle Etappen zwischen den Wegpunkten. Ergebnisse werden pro
 * Anfrage gecacht – nur geänderte Etappen gehen an den Server.
 */
export function useRouting() {
  const waypoints = useStore((s) => s.waypoints);
  const settings = useStore((s) => s.settings);
  const overrides = useStore((s) => s.overrides);
  const blocks = useStore((s) => s.blocks);
  const [tick, setTick] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const errors = useRef(new Map<string, string>());
  const pending = useRef(new Set<string>());
  const lastRoute = useRef<CombinedRoute | null>(null);

  const requests = useMemo(() => {
    const blockNogos = globalNogos(blocks);
    const out: { key: string; req: LegRequest; rk: string }[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const key = legKey(from, to);
      const o = overrides[key];
      const req: LegRequest = {
        from,
        to,
        settings: o?.settings ?? settings,
        nogos: [...blockNogos, ...(o?.avoid ?? []).flatMap((a) => a.nogos)],
        alternative: o?.alternative ?? 0,
      };
      out.push({ key, req, rk: requestKey(req) });
    }
    return out;
  }, [waypoints, settings, overrides, blocks]);

  useEffect(() => {
    // kurz warten, damit schnelles Klicken/Schieben nicht jede Zwischenstufe anfragt.
    // Laufende Anfragen werden nicht abgebrochen: Ihr Ergebnis landet im Cache,
    // und eine abgebrochene Anfrage würde sonst nie neu gestellt.
    const t = setTimeout(() => {
      for (const { rk, req } of requests) {
        if (cache.has(rk) || pending.current.has(rk) || errors.current.has(rk)) continue;
        pending.current.add(rk);
        setTick((n) => n + 1);
        routeLeg(req)
          .then((r) => cache.set(rk, r))
          .catch((e: Error) => {
            if (e.name !== 'AbortError') errors.current.set(rk, e.message);
          })
          .finally(() => {
            pending.current.delete(rk);
            setTick((n) => n + 1);
          });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [requests, retryToken]);

  const readyKey = requests.map((r) => (cache.has(r.rk) ? r.rk : '-')).join('|');
  const complete = requests.length > 0 && requests.every((r) => cache.has(r.rk));

  const route = useMemo(() => {
    if (!requests.length) return null;
    if (!complete) return null;
    return combineLegs(requests.map((r) => ({ key: r.key, result: cache.get(r.rk)! })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey, complete]);

  if (route || !requests.length) lastRoute.current = route;

  useEffect(() => {
    if (complete || !requests.length) persistLegs(requests.map((r) => r.rk));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey, complete]);

  const legs: LegStatus[] = requests.map(({ key, rk }, index) => ({
    key,
    index,
    loading: !cache.has(rk) && !errors.current.has(rk),
    error: errors.current.get(rk),
  }));
  void tick;

  return {
    /** aktuelle Route, oder während der Neuberechnung die vorige */
    route: route ?? lastRoute.current,
    stale: !route && !!lastRoute.current,
    legs,
    loading: legs.some((l) => l.loading),
    errors: legs.filter((l) => l.error),
    retry: () => {
      errors.current.clear();
      setRetryToken((n) => n + 1);
    },
  };
}
