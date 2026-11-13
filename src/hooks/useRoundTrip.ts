import { useCallback, useRef, useState } from 'react';
import { routeLeg, routeRoundTrip } from '../api/brouter';
import { cumulativeDistances, destination, type LngLat } from '../domain/geo';
import { nogosAlongLine, type LegResult, type Nogo, type Waypoint } from '../domain/route';
import {
  DETOUR,
  LENGTH_PER_RADIUS,
  candidateDirections,
  isSimilar,
  joinLegs,
  legCountFor,
  removeSpurs,
  roundTripSettings,
  splitIntoLegs,
  type ReturnWay,
} from '../domain/roundtrip';
import type { RoutingSettings } from '../domain/settings';
import { uid, useStore, type Suggestion } from '../store';
import { globalNogos, primeLeg } from './useRouting';

/** Wie weit die Länge vom Wunsch abweichen darf, bevor einmal nachkorrigiert wird. */
const TOLERANCE = 0.12;

export interface Progress {
  done: number;
  total: number;
}

/**
 * Hin & zurück in eine Richtung: Wendepunkt in passender Entfernung, Hinweg
 * dorthin und Rückweg – auf demselben Weg oder (mit Sperren entlang des
 * Hinwegs) möglichst anders. Die Länge wird bis zu zweimal nachkorrigiert.
 */
async function outAndBack(
  start: LngLat,
  dir: number,
  distance: number,
  returnWay: ReturnWay,
  settings: RoutingSettings,
  nogos: Nogo[],
  signal: AbortSignal,
): Promise<[LegResult, LegResult]> {
  const from: Waypoint = { id: 's', lng: start[0], lat: start[1] };
  const route = (a: Waypoint, b: Waypoint, extra: Nogo[] = []) =>
    routeLeg({ from: a, to: b, settings, nogos: [...nogos, ...extra], alternative: 0 }, signal);
  let crow = distance / 2 / DETOUR;
  let best: [LegResult, LegResult] | null = null;
  const off = (p: [LegResult, LegResult]) => Math.abs(p[0].length + p[1].length - distance);
  for (let k = 0; k < 3; k++) {
    const p = destination(start, dir, crow);
    const out = await route(from, { id: 'p', lng: p[0], lat: p[1] });
    const end = out.coords[out.coords.length - 1];
    const turn: Waypoint = { id: 't', lng: end[0], lat: end[1] };
    let back: LegResult;
    if (returnWay === 'same') back = await route(turn, from);
    else {
      // Hinweg sperren (nicht am Start und am Wendepunkt), damit der Rückweg woanders verläuft
      const d = cumulativeDistances(out.coords);
      const avoid = nogosAlongLine(out.coords, d, { spacing: 400, radius: 120, margin: 1500 });
      back = await route(turn, from, avoid).catch(() => route(turn, from));
    }
    const pair: [LegResult, LegResult] = [out, back];
    if (!best || off(pair) < off(best)) best = pair;
    const total = out.length + back.length;
    if (Math.abs(total - distance) / distance <= TOLERANCE) break;
    crow *= distance / total;
  }
  return best!;
}

export function useRoundTrip() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  /** Einstellungen + Sperren, mit denen die Vorschläge berechnet wurden */
  const basis = useRef('');
  const [searchedWith, setSearchedWith] = useState('');

  const generate = useCallback(async () => {
    const st = useStore.getState();
    const start = st.loopStart;
    if (!start) return;
    ctrl.current?.abort();
    const abort = new AbortController();
    ctrl.current = abort;

    const { distance, direction, climb = 'any', maxAscend = 0, shape = 'loop', returnWay = 'other' } = st.loopOptions;
    const dirs = candidateDirections(direction, climb !== 'any' || maxAscend > 0);
    const nogos = globalNogos(st.blocks);
    // Höhenmeter-Wunsch fließt in die Steigungs-Strafe von BRouter ein
    const settings = roundTripSettings(st.settings, climb, maxAscend);
    // Vergleichsbasis sind die eigenen Einstellungen: Die gefundene Runde wird exakt übernommen,
    // auch wenn die Suche mit stärkerer Steigungs-Strafe lief
    basis.current = JSON.stringify([st.settings, nogos]);
    setSearchedWith(basis.current);
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
        if (shape === 'outback') {
          const parts = await outAndBack(start, dir, distance, returnWay, settings, nogos, abort.signal);
          const leg = joinLegs(parts[0], parts[1]);
          if (!found.some((f) => isSimilar(f.leg, leg))) {
            found.push({ id: uid(), leg, direction: dir, parts, sameWay: returnWay === 'same' });
            useStore.getState().setSuggestions([...found]);
          }
          setProgress({ done: i + 1, total: dirs.length });
          continue;
        }
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
    let points: LngLat[];
    let legs: LegResult[];
    if (s.parts) {
      // Hin & zurück: Wendepunkt wird ein Wegpunkt, Hin- und Rückweg je in Etappen
      const half = (l: LegResult) => Math.max(1, Math.min(6, Math.round(l.length / 10000)));
      const a = splitIntoLegs(s.parts[0], half(s.parts[0]));
      const b = splitIntoLegs(s.parts[1], half(s.parts[1]));
      points = [...a.points, ...b.points.slice(1)];
      legs = [...a.legs, ...b.legs];
    } else ({ points, legs } = splitIntoLegs(s.leg, legCountFor(s.leg.length)));
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

  /** Vorschläge noch mit anderen Profil-Einstellungen bzw. Sperren berechnet? */
  const settings = useStore((s) => s.settings);
  const blocks = useStore((s) => s.blocks);
  const stale = !!searchedWith && searchedWith !== JSON.stringify([settings, globalNogos(blocks)]);

  return { generate, cancel, apply, progress, error, stale };
}
