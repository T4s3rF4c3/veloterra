import { useCallback, useRef, useState } from 'react';
import { routeRoundTrip } from '../api/brouter';
import type { LegResult, Waypoint } from '../domain/route';
import {
  LENGTH_PER_RADIUS,
  candidateDirections,
  isSimilar,
  legCountFor,
  removeSpurs,
  roundTripSettings,
  splitIntoLegs,
} from '../domain/roundtrip';
import { uid, useStore, type Suggestion } from '../store';
import { globalNogos, primeLeg } from './useRouting';

/** Wie weit die Länge vom Wunsch abweichen darf, bevor einmal nachkorrigiert wird. */
const TOLERANCE = 0.12;

export interface Progress {
  done: number;
  total: number;
}

export function useRoundTrip() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  /** Einstellungen + Sperren, mit denen die Vorschläge berechnet wurden */
  const basis = useRef('');

  const generate = useCallback(async () => {
    const st = useStore.getState();
    const start = st.loopStart;
    if (!start) return;
    ctrl.current?.abort();
    const abort = new AbortController();
    ctrl.current = abort;

    const { distance, direction, climb = 'any', maxAscend = 0 } = st.loopOptions;
    const dirs = candidateDirections(direction, climb !== 'any' || maxAscend > 0);
    const nogos = globalNogos(st.blocks);
    // Höhenmeter-Wunsch fließt in die Steigungs-Strafe von BRouter ein
    const settings = roundTripSettings(st.settings, climb, maxAscend);
    // Vergleichsbasis sind die eigenen Einstellungen: Die gefundene Runde wird exakt übernommen,
    // auch wenn die Suche mit stärkerer Steigungs-Strafe lief
    basis.current = JSON.stringify([st.settings, nogos]);
    const found: Suggestion[] = [];
    let failures = 0;
    setError(null);
    st.setSuggestions([]);
    st.setActiveSuggestion(null);
    setProgress({ done: 0, total: dirs.length });

    // Stichstraßen (hin und auf demselben Weg zurück) gleich herausschneiden
    const run = async (radius: number, dir: number) =>
      removeSpurs(
        await routeRoundTrip(
          { start: { lng: start[0], lat: start[1] }, settings, nogos, radius, direction: dir },
          abort.signal,
        ),
      );

    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      try {
        let radius = distance / LENGTH_PER_RADIUS;
        let best: LegResult = await run(radius, dir);
        // Länge bis zu zweimal nachkorrigieren (Stichstraßen-Schnitt verkürzt manche Runden deutlich)
        let last = best;
        for (let k = 0; k < 2 && Math.abs(best.length - distance) / distance > TOLERANCE; k++) {
          radius *= distance / last.length;
          last = await run(radius, dir);
          if (Math.abs(last.length - distance) < Math.abs(best.length - distance)) best = last;
        }
        if (!found.some((f) => isSimilar(f.leg, best))) {
          found.push({ id: uid(), leg: best, direction: dir });
          useStore.getState().setSuggestions([...found]);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        failures++;
        if (failures === dirs.length) setError((e as Error).message);
      }
      setProgress({ done: i + 1, total: dirs.length });
    }
    setProgress(null);
  }, []);

  const cancel = useCallback(() => {
    ctrl.current?.abort();
    setProgress(null);
  }, []);

  /** Vorschlag als normale, bearbeitbare Route mit Etappen übernehmen. */
  const apply = useCallback((s: Suggestion) => {
    const st = useStore.getState();
    const { points, legs } = splitIntoLegs(s.leg, legCountFor(s.leg.length));
    const wps: Waypoint[] = points.map((p) => ({ id: uid(), lng: p[0], lat: p[1] }));
    const nogos = globalNogos(st.blocks);
    // Etappen sind exakte Teilstücke der Rundtour → keine neuen Server-Anfragen nötig.
    // Wurden Einstellungen inzwischen geändert, rechnet das normale Routing neu.
    if (basis.current === JSON.stringify([st.settings, nogos])) {
      legs.forEach((leg, i) =>
        primeLeg({ from: wps[i], to: wps[i + 1], settings: st.settings, nogos, alternative: 0 }, leg),
      );
    }
    st.replaceRoute(wps);
  }, []);

  return { generate, cancel, apply, progress, error };
}
