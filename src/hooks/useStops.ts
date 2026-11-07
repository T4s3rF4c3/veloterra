import { useEffect, useState } from 'react';
import { searchPois } from '../api/poiSearch';
import { projectOnLine, resample } from '../domain/geo';
import { STOP_CATEGORIES, corridorQuery, type Poi } from '../domain/poi';
import type { CombinedRoute } from '../domain/route';
import { useStore } from '../store';

/** Maximaler Abstand eines Stopps von der Route */
const CORRIDOR = 300;

/** Lädt Cafés, Trinkwasser usw. entlang der Route (nur wenn eingeschaltet). */
export function useStops(route: CombinedRoute | null) {
  const show = useStore((s) => s.showStops);
  const mode = useStore((s) => s.mode);
  const cats = useStore((s) => s.stopCategories);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const sig = route ? `${route.coords.length}|${route.length}|${route.coords[0]}|${cats.join(',')}` : '';

  useEffect(() => {
    const st = useStore.getState();
    if (!show || mode !== 'route' || !route || !cats.length) {
      st.setStops([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const categories = STOP_CATEGORIES.filter((c) => cats.includes(c.key));
    const alongRoute = (pois: Poi[]) =>
      pois
        .map((p) => {
          const proj = projectOnLine(p.coord, route.coords, route.dist);
          return { ...p, along: proj?.distance ?? 0, offset: proj?.offset ?? Infinity };
        })
        .filter((p) => p.offset <= CORRIDOR)
        .sort((a, b) => a.along - b.along);
    // warten, bis die Route nach Änderungen zur Ruhe kommt
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setPartial(false);
      try {
        const res = await searchPois({
          overpassQuery: corridorQuery(route.coords, CORRIDOR, categories),
          cats: categories,
          photonPoints: resample(route.coords, route.dist, 3000).map((p) => ({ p, radiusKm: 1.8 })),
          signal: ctrl.signal,
          onPartial: (r) => {
            useStore.getState().setStops(alongRoute(r.pois));
            setPartial(true);
          },
        });
        if (ctrl.signal.aborted) return;
        useStore.getState().setStops(alongRoute(res.pois));
        setPartial(res.source === 'photon');
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 800);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, mode, sig]);

  return { loading, error, partial };
}
