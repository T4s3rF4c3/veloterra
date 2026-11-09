import { useEffect, useState } from 'react';
import { photosAlong } from '../api/photos';
import type { CombinedRoute } from '../domain/route';
import { useStore } from '../store';
import { useSite } from '../api/site';

/** Fotos entlang der Route (Panoramax, optional Mapillary). */
export function usePhotos(route: CombinedRoute | null) {
  const show = useStore((s) => s.showPhotos);
  const siteToken = useSite((s) => s.config.mapillaryToken);
  const token = useStore((s) => s.mapillaryToken) || siteToken;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sig = route ? `${route.coords.length}|${route.length}|${route.coords[0]}` : '';

  useEffect(() => {
    const st = useStore.getState();
    if (!show || !route) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      st.setPhotos([]);
      setLoading(true);
      setError(null);
      try {
        await photosAlong(route.coords, {
          mapillaryToken: token || undefined,
          signal: ctrl.signal,
          onProgress: (p) => !ctrl.signal.aborted && useStore.getState().setPhotos(p),
        });
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
  }, [show, sig, token]);

  return { loading, error };
}
