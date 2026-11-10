import { cumulativeDistances, haversine, pointAtDistance, projectOnLine, type LngLat } from '../domain/geo';
import type { Photo } from './photos';

/**
 * Fotos von Wikimedia Commons: Millionen frei lizenzierter Bilder mit
 * Ortsangabe – Burgen, Aussichten, Weinberge, Ortsbilder. Ohne Schlüssel,
 * mit Urheber und Lizenz (Pflicht bei der Anzeige).
 */

const API = 'https://commons.wikimedia.org/w/api.php';
/** besonders gute Bilder (von der Commons-Community ausgezeichnet) */
const QUALITY = [
  'Category:Quality images',
  'Category:Featured pictures on Wikimedia Commons',
  'Category:Valued images sorted by promotion date',
];
/** Karten, Pläne, Wappen, Schilder … sind keine schönen Fotos */
const NOT_A_PHOTO =
  /\b(map|karte|plan|lageplan|diagram|logo|wappen|coat of arms|schild|sign|tafel|grundriss|scan|dokument|document|stolperstein)\b/i;

interface Page {
  pageid: number;
  title: string;
  coordinates?: { lat: number; lon: number }[];
  categories?: { title: string }[];
  imageinfo?: {
    thumburl: string;
    url: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime: string;
    extmetadata?: Record<string, { value: string }>;
  }[];
}

export interface CommonsPhoto extends Photo {
  title: string;
  /** Punktzahl für die Auswahl (höher = besser) */
  rank: number;
}

const stripHtml = (s: string) => {
  const d = new DOMParser().parseFromString(s, 'text/html');
  return (d.body.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const cleanTitle = (t: string) =>
  t
    .replace(/^File:/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s*\(\d{6,}\)$/, '')
    .replace(/_/g, ' ');

function toPhoto(p: Page, origin: LngLat): CommonsPhoto | null {
  const ii = p.imageinfo?.[0];
  const c = p.coordinates?.[0];
  if (!ii || !c || ii.mime !== 'image/jpeg' || ii.width < 800) return null;
  if (NOT_A_PHOTO.test(p.title)) return null;
  const m = ii.extmetadata ?? {};
  const coord: LngLat = [c.lon, c.lat];
  const quality = (p.categories ?? []).some((x) => QUALITY.includes(x.title));
  const landscape = ii.width >= ii.height * 1.15;
  const date = m.DateTimeOriginal?.value ? stripHtml(m.DateTimeOriginal.value).slice(0, 10) : undefined;
  return {
    id: `commons:${p.pageid}`,
    source: 'commons',
    coord,
    along: 0,
    thumb: ii.thumburl,
    full: ii.thumburl.replace(/\/\d+px-([^/]+)$/, '/1280px-$1'),
    link: ii.descriptionurl,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : undefined,
    author: m.Artist?.value ? stripHtml(m.Artist.value).slice(0, 80) : undefined,
    license: m.LicenseShortName?.value,
    title: cleanTitle(p.title),
    // ausgezeichnet und quer zuerst, dann groß; Entfernung kostet etwas
    rank: (quality ? 3 : 0) + (landscape ? 1 : 0) + Math.min(1, ii.width / 4000) - haversine(origin, coord) / 3000,
  };
}

/** Commons-Fotos im Umkreis (höchstens 10 km, je Anfrage bis 50 Bilder). */
async function geosearch(p: LngLat, radius: number, signal?: AbortSignal): Promise<CommonsPhoto[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'geosearch',
    ggsnamespace: '6',
    ggscoord: `${p[1].toFixed(5)}|${p[0].toFixed(5)}`,
    ggsradius: String(Math.round(Math.min(10000, radius))),
    ggslimit: '50',
    prop: 'imageinfo|coordinates|categories',
    // ohne colimit liefert die API nur für 10 Bilder Koordinaten
    colimit: 'max',
    clcategories: QUALITY.join('|'),
    cllimit: 'max',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '480',
    iiextmetadatafilter: 'Artist|LicenseShortName|DateTimeOriginal',
  });
  const res = await fetch(`${API}?${params}`, { signal });
  if (!res.ok) throw new Error('Wikimedia Commons nicht erreichbar');
  const j = await res.json();
  const pages = Object.values((j.query?.pages ?? {}) as Record<string, Page>);
  return pages.map((x) => toPhoto(x, p)).filter((x): x is CommonsPhoto => !!x);
}

const nearCache = new Map<string, Promise<CommonsPhoto[]>>();

/** Die schönsten Fotos nahe einem Ort (z. B. für ein Ziel). */
export function commonsNear(p: LngLat, radius = 300, max = 6): Promise<CommonsPhoto[]> {
  const key = `${p[0].toFixed(4)},${p[1].toFixed(4)},${radius}`;
  let f = nearCache.get(key);
  if (!f) {
    f = geosearch(p, radius).then((list) => list.sort((a, b) => b.rank - a.rank).slice(0, max));
    f.catch(() => nearCache.delete(key));
    nearCache.set(key, f);
  }
  return f;
}

/** Datei per Titel (OSM-Tag wikimedia_commons=File:…) */
export async function commonsFile(title: string, origin: LngLat): Promise<CommonsPhoto | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    titles: title.startsWith('File:') ? title : `File:${title}`,
    prop: 'imageinfo|coordinates',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '480',
    iiextmetadatafilter: 'Artist|LicenseShortName|DateTimeOriginal',
  });
  try {
    const j = await (await fetch(`${API}?${params}`)).json();
    const page = Object.values((j.query?.pages ?? {}) as Record<string, Page>)[0];
    // ohne Koordinaten am Bild den Ort des POI nehmen
    if (page && !page.coordinates) page.coordinates = [{ lat: origin[1], lon: origin[0] }];
    return page ? toPhoto(page, origin) : null;
  } catch {
    return null;
  }
}

/**
 * Highlights entlang der Route: Suchkreise etwa alle 4 km, nur Fotos bis
 * 400 m neben der Strecke, je ~1,5 km das beste – höchstens 40.
 */
export async function commonsAlong(
  coords: LngLat[],
  opts: { signal: AbortSignal; onProgress?: (p: Photo[]) => void },
): Promise<Photo[]> {
  const dist = cumulativeDistances(coords);
  const total = dist[dist.length - 1];
  const n = Math.max(1, Math.round(total / 4000));
  const centers = Array.from({ length: n }, (_, k) => pointAtDistance(coords, dist, (total * (k + 0.5)) / n));
  const radius = Math.min(10000, total / n / 2 + 600);
  const buckets = new Map<number, CommonsPhoto>();
  const seen = new Set<string>();
  const BUCKET = Math.max(1500, total / 40);
  let next = 0;

  const publish = () =>
    opts.onProgress?.([...buckets.values()].sort((a, b) => a.along - b.along).map((p) => ({ ...p })));

  const work = async () => {
    while (next < centers.length && !opts.signal.aborted) {
      const c = centers[next++];
      let list: CommonsPhoto[];
      try {
        list = await geosearch(c, radius, opts.signal);
      } catch {
        if (opts.signal.aborted) return;
        continue;
      }
      for (const ph of list) {
        if (seen.has(ph.id)) continue;
        seen.add(ph.id);
        const proj = projectOnLine(ph.coord, coords, dist);
        if (!proj || proj.offset > 400) continue;
        ph.along = proj.distance;
        // nah an der Strecke ist besser
        const rank = ph.rank + 1 - proj.offset / 400;
        const b = Math.floor(proj.distance / BUCKET);
        const cur = buckets.get(b);
        if (!cur || cur.rank < rank) buckets.set(b, { ...ph, rank });
      }
      publish();
    }
  };
  await Promise.all([work(), work(), work()]);
  return [...buckets.values()].sort((a, b) => a.along - b.along);
}
