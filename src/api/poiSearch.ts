import type { LngLat } from '../domain/geo';
import { parsePois, type Poi, type PoiCategory } from '../domain/poi';
import { overpass } from './overpass';

interface PhotonFeature {
  geometry: { coordinates: LngLat };
  properties: { osm_type: string; osm_id: number; osm_key: string; osm_value: string; name?: string };
}

const OSM_TYPE: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };

/** Benannte Orte um einen Punkt über Photon (komoot) – schnell, aber ohne Details. */
async function photonAround(p: LngLat, radiusKm: number, cats: PoiCategory[], signal: AbortSignal): Promise<Poi[]> {
  const tags = [...new Set(cats.flatMap((c) => c.photon ?? []))];
  if (!tags.length) return [];
  const q = new URLSearchParams({
    lon: p[0].toFixed(5),
    lat: p[1].toFixed(5),
    radius: String(Math.max(0.2, Math.round(radiusKm * 10) / 10)),
    limit: '50',
    lang: 'de',
  });
  tags.forEach((t) => q.append('osm_tag', t));
  const res = await fetch(`https://photon.komoot.io/reverse?${q.toString()}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { features: PhotonFeature[] };
  const out: Poi[] = [];
  for (const f of json.features ?? []) {
    const pr = f.properties;
    const tag = `${pr.osm_key}:${pr.osm_value}`;
    const cat = cats.find((c) => c.photon?.includes(tag));
    if (!cat || (cat.photonName && !cat.photonName.test(pr.name ?? ''))) continue;
    out.push({
      id: `${OSM_TYPE[pr.osm_type] ?? 'node'}/${pr.osm_id}`,
      category: cat.key,
      icon: cat.icon,
      name: pr.name ?? cat.label,
      coord: f.geometry.coordinates,
      tags: { [pr.osm_key]: pr.osm_value, ...(pr.name ? { name: pr.name } : {}) },
      offset: 0,
    });
  }
  return out;
}

async function photonSearch(points: { p: LngLat; radiusKm: number }[], cats: PoiCategory[], signal: AbortSignal) {
  const found = new Map<string, Poi>();
  let next = 0;
  const work = async () => {
    while (next < points.length) {
      const { p, radiusKm } = points[next++];
      for (const poi of await photonAround(p, radiusKm, cats, signal).catch(() => [])) found.set(poi.id, poi);
    }
  };
  await Promise.all([work(), work(), work()]);
  signal.throwIfAborted();
  return [...found.values()];
}

export interface PoiSearchResult {
  pois: Poi[];
  /** 'osm' = vollständig (Overpass), 'photon' = nur benannte Orte */
  source: 'osm' | 'photon';
}

/**
 * Sucht POIs über Overpass. Antwortet Overpass nicht schnell, werden
 * zwischenzeitlich Photon-Ergebnisse gemeldet; fällt Overpass ganz aus,
 * bleiben diese das Ergebnis.
 */
export async function searchPois(opts: {
  overpassQuery: string;
  cats: PoiCategory[];
  photonPoints: { p: LngLat; radiusKm: number }[];
  signal: AbortSignal;
  onPartial?: (r: PoiSearchResult) => void;
  /** nach so vielen ms Photon parallel starten */
  fallbackAfter?: number;
}): Promise<PoiSearchResult> {
  const { cats, signal } = opts;
  let photon: Promise<Poi[]> | null = null;
  const startPhoton = () => {
    if (!photon) {
      photon = photonSearch(opts.photonPoints, cats, signal);
      photon.then((pois) => !signal.aborted && opts.onPartial?.({ pois, source: 'photon' })).catch(() => undefined);
    }
    return photon;
  };
  const timer = setTimeout(startPhoton, opts.fallbackAfter ?? 10000);
  try {
    const els = await overpass(opts.overpassQuery, signal);
    return { pois: parsePois(els, cats), source: 'osm' };
  } catch (e) {
    if (signal.aborted) throw e;
    const pois = await startPhoton();
    if (!pois.length) throw e;
    return { pois, source: 'photon' };
  } finally {
    clearTimeout(timer);
  }
}
