import { bearing, cumulativeDistances, haversine, pointAtDistance, type LngLat } from '../domain/geo';

export interface Photo {
  id: string;
  source: 'panoramax' | 'mapillary';
  coord: LngLat;
  /** Meter ab Routenstart */
  along: number;
  thumb: string;
  full: string;
  /** Link zur Ansicht beim Anbieter */
  link: string;
  date?: string;
  /** Blickrichtung (Grad) */
  heading?: number;
  author?: string;
}

interface Candidate {
  id: string;
  coord: LngLat;
  thumb: string;
  full: string;
  link: string;
  date?: string;
  heading?: number;
  author?: string;
}

async function panoramax(box: number[], signal: AbortSignal): Promise<Candidate[]> {
  const res = await fetch(`https://api.panoramax.xyz/api/search?bbox=${box.join(',')}&limit=8`, { signal });
  if (!res.ok) return [];
  const j = await res.json();
  return (j.features ?? []).map(
    (f: {
      id: string;
      geometry: { coordinates: LngLat };
      properties: Record<string, unknown>;
      assets: Record<string, { href: string }>;
      providers?: { name: string }[];
    }) => ({
      id: f.id,
      coord: f.geometry.coordinates,
      thumb: f.assets.thumb?.href ?? f.assets.sd?.href,
      full: f.assets.sd?.href ?? f.assets.hd?.href,
      link: `https://api.panoramax.xyz/#focus=pic&pic=${f.id}&map=17/${f.geometry.coordinates[1]}/${f.geometry.coordinates[0]}`,
      date: (f.properties.datetime as string | undefined)?.slice(0, 10),
      heading: f.properties['view:azimuth'] as number | undefined,
      author: f.providers?.[0]?.name,
    }),
  );
}

async function mapillary(box: number[], token: string, signal: AbortSignal): Promise<Candidate[]> {
  const url =
    `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}` +
    `&fields=id,thumb_256_url,thumb_1024_url,computed_geometry,geometry,captured_at,compass_angle,creator&bbox=${box.join(',')}&limit=8`;
  const res = await fetch(url, { signal });
  if (res.status === 401 || res.status === 403) throw new Error('Mapillary-Token ungültig');
  if (!res.ok) return [];
  const j = await res.json();
  return (j.data ?? []).map(
    (d: {
      id: string;
      thumb_256_url: string;
      thumb_1024_url: string;
      computed_geometry?: { coordinates: LngLat };
      geometry: { coordinates: LngLat };
      captured_at?: number;
      compass_angle?: number;
      creator?: { username?: string };
    }) => ({
      id: d.id,
      coord: (d.computed_geometry ?? d.geometry).coordinates,
      thumb: d.thumb_256_url,
      full: d.thumb_1024_url,
      link: `https://www.mapillary.com/app/?pKey=${d.id}&focus=photo`,
      date: d.captured_at ? new Date(d.captured_at).toISOString().slice(0, 10) : undefined,
      heading: d.compass_angle,
      author: d.creator?.username,
    }),
  );
}

/** Kleines Suchfenster um einen Punkt (±m Meter). */
function boxAround(p: LngLat, m: number): number[] {
  const dLat = m / 111320;
  const dLng = m / (111320 * Math.cos((p[1] * Math.PI) / 180));
  return [p[0] - dLng, p[1] - dLat, p[0] + dLng, p[1] + dLat].map((x) => Number(x.toFixed(6)));
}

/**
 * Sucht entlang der Route in regelmäßigen Abständen je ein Foto – möglichst
 * nah an der Route und in Fahrtrichtung aufgenommen.
 */
export async function photosAlong(
  coords: LngLat[],
  opts: { mapillaryToken?: string; max?: number; signal: AbortSignal; onProgress?: (p: Photo[]) => void },
): Promise<Photo[]> {
  const dist = cumulativeDistances(coords);
  const total = dist[dist.length - 1];
  const n = Math.max(2, Math.min(opts.max ?? 40, Math.round(total / 1000)));
  const spacing = total / n;
  const samples = Array.from({ length: n }, (_, k) => spacing * (k + 0.5));
  const found: Photo[] = [];
  let queue = 0;

  const work = async () => {
    while (queue < samples.length) {
      const d = samples[queue++];
      const p = pointAtDistance(coords, dist, d);
      const dir = bearing(pointAtDistance(coords, dist, d - 20), pointAtDistance(coords, dist, d + 20));
      const box = boxAround(p, 120);
      let cands: (Candidate & { source: Photo['source'] })[] = [];
      try {
        const lists = await Promise.all([
          panoramax(box, opts.signal).catch(() => []),
          opts.mapillaryToken ? mapillary(box, opts.mapillaryToken, opts.signal) : Promise.resolve([]),
        ]);
        cands = [
          ...lists[0].map((c) => ({ ...c, source: 'panoramax' as const })),
          ...lists[1].map((c) => ({ ...c, source: 'mapillary' as const })),
        ];
      } catch (e) {
        if (opts.signal.aborted) return;
        throw e;
      }
      let best: (Candidate & { source: Photo['source'] }) | null = null;
      let bestScore = Infinity;
      for (const c of cands) {
        const off = haversine(p, c.coord);
        let angle = 0;
        if (c.heading !== undefined) {
          const diff = Math.abs(((c.heading - dir + 540) % 360) - 180);
          angle = diff;
        }
        const score = off + angle * 0.6;
        if (off < 120 && score < bestScore) {
          best = c;
          bestScore = score;
        }
      }
      if (best && !found.some((f) => f.id === best!.id)) {
        found.push({ ...best, along: d });
        found.sort((a, b) => a.along - b.along);
        opts.onProgress?.([...found]);
      }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  return found;
}
