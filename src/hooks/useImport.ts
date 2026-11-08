import { useCallback, useState } from 'react';
import { routeVia } from '../api/brouter';
import { cumulativeDistances, resample, type LngLat } from '../domain/geo';
import { parseGpx } from '../domain/gpx';
import type { LegOverride, Waypoint } from '../domain/route';
import { legKey } from '../domain/route';
import { legCountFor, splitIntoLegs } from '../domain/roundtrip';
import { ROADS, SURFACES, type RoutingSettings } from '../domain/settings';
import { uid, useStore } from '../store';
import { globalNogos, primeLeg } from './useRouting';

/** Profil, das dem importierten Track möglichst genau folgt: nichts bevorzugt, nichts gesperrt. */
export const FOLLOW_SETTINGS: RoutingSettings = {
  surface: Object.fromEntries(SURFACES.map((s) => [s.key, 'neutral'])) as RoutingSettings['surface'],
  road: Object.fromEntries(ROADS.map((r) => [r.key, 'neutral'])) as RoutingSettings['road'],
  traffic: 0,
  hills: 'ignore',
  speedLimit: 'off',
  avoidBadSmoothness: false,
  preferCycleRoutes: false,
  allowFerries: true,
};

/**
 * Fremden Verlauf (GPX-Track, beschilderte Radroute …) übernehmen: Er wird mit
 * dichten Stützpunkten über BRouter nachgerechnet, damit Belag und Straßenart
 * bekannt sind, und dann in bearbeitbare Etappen zerlegt.
 */
export async function importTrack(name: string, coords: LngLat[]) {
  const dist = cumulativeDistances(coords);
  const total = dist[dist.length - 1];
  if (!(total >= 200)) throw new Error('Der Verlauf ist zu kurz.');
  const spacing = Math.max(700, total / 180);
  const points = resample(coords, dist, spacing);
  const leg = await routeVia(points, FOLLOW_SETTINGS, []);
  const { points: cuts, legs } = splitIntoLegs(leg, legCountFor(leg.length));
  const wps: Waypoint[] = cuts.map((p) => ({ id: uid(), lng: p[0], lat: p[1] }));
  const st = useStore.getState();
  const nogos = globalNogos(st.blocks);
  const overrides: Record<string, LegOverride> = {};
  legs.forEach((l, i) => {
    overrides[legKey(wps[i], wps[i + 1])] = { settings: FOLLOW_SETTINGS, presetLabel: 'Import' };
    primeLeg({ from: wps[i], to: wps[i + 1], settings: FOLLOW_SETTINGS, nogos, alternative: 0 }, l);
  });
  st.replaceRoute(wps, overrides, name);
  st.setImportTrack({ name, coords });
}

/** GPX-Datei laden (Knopf oder Datei auf die Karte ziehen). */
export function useImport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const { name, coords } = parseGpx(await file.text());
      await importTrack(name, coords);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { importFile, busy, error };
}
