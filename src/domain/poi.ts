import type { OsmElement } from '../api/overpass';
import { haversine, simplify, type LngLat } from './geo';

export interface PoiCategory {
  key: string;
  label: string;
  icon: string;
  /** Overpass-Filter (ohne Elementtyp) */
  filters: string[];
  /** auch Flächen/Wege abfragen (Seen, Burgen …) */
  areas?: boolean;
  /** Ersatz-Suche über Photon (nur benannte Orte): osm_key:osm_value */
  photon?: string[];
  /** Photon-Treffer nur mit passendem Namen übernehmen */
  photonName?: RegExp;
}

/** Stopps unterwegs */
export const STOP_CATEGORIES: PoiCategory[] = [
  {
    key: 'cafe',
    label: 'Café & Bäcker',
    icon: '☕',
    filters: ['[amenity=cafe]', '[shop=bakery]', '[amenity=ice_cream]', '[amenity=biergarten]'],
    photon: ['amenity:cafe', 'shop:bakery', 'amenity:ice_cream', 'amenity:biergarten'],
  },
  {
    key: 'water',
    label: 'Trinkwasser',
    icon: '💧',
    filters: ['[amenity=drinking_water]', '[amenity=water_point]'],
    photon: ['amenity:drinking_water'],
  },
  {
    key: 'bike',
    label: 'Rad-Service',
    icon: '🔧',
    filters: ['[amenity=bicycle_repair_station]', '[shop=bicycle]'],
    photon: ['shop:bicycle', 'amenity:bicycle_repair_station'],
  },
  { key: 'view', label: 'Aussicht', icon: '🔭', filters: ['[tourism=viewpoint]'], photon: ['tourism:viewpoint'] },
  { key: 'toilet', label: 'WC', icon: '🚻', filters: ['[amenity=toilets]'], photon: ['amenity:toilets'] },
];

/** Lohnende Ziele für eine Ausfahrt */
export const DESTINATION_CATEGORIES: PoiCategory[] = [
  {
    key: 'view',
    label: 'Aussichtspunkte',
    icon: '🔭',
    filters: ['[tourism=viewpoint][name]'],
    photon: ['tourism:viewpoint'],
  },
  {
    key: 'peak',
    label: 'Gipfel & Pässe',
    icon: '⛰️',
    filters: ['[natural=peak][name]', '[mountain_pass=yes][name]'],
    photon: ['natural:peak', 'mountain_pass:yes'],
  },
  {
    key: 'castle',
    label: 'Burgen & Schlösser',
    icon: '🏰',
    filters: ['[historic=castle][name]', '[historic=monastery][name]'],
    areas: true,
    photon: ['historic:castle', 'historic:monastery'],
  },
  {
    key: 'lake',
    label: 'Seen & Talsperren',
    icon: '🌊',
    filters: ['[natural=water][water~"^(lake|reservoir)$"][name]', '[waterway=dam][name]'],
    areas: true,
    photon: ['natural:water', 'waterway:dam', 'landuse:reservoir'],
    photonName: /see\b|see$|talsperre|stausee|maar|weiher|lake|reservoir|staumauer|damm/i,
  },
  {
    key: 'cafe',
    label: 'Ausflugscafés & Biergärten',
    icon: '☕',
    filters: [
      '[amenity=biergarten][name]',
      '[amenity=cafe][name][cuisine~"cake|coffee_shop"]',
      '[amenity=ice_cream][name]',
    ],
    photon: ['amenity:biergarten', 'amenity:ice_cream'],
  },
  {
    key: 'bike',
    label: 'Radler-Treffs',
    icon: '🚲',
    filters: [
      '[amenity=cafe][name]["bicycle"~"yes|designated"]',
      '[amenity=cafe][name][~"^service:bicycle"~"."]',
      '[shop=bicycle][name]',
    ],
    photon: ['shop:bicycle'],
  },
];

export interface Poi {
  id: string;
  category: string;
  icon: string;
  name: string;
  coord: LngLat;
  tags: Record<string, string>;
  /** Meter ab Routenstart (nur bei Stopps entlang der Route) */
  along?: number;
  /** Abstand zur Route bzw. zum Startpunkt in Metern */
  offset: number;
}

const fmt = (n: number) => n.toFixed(5);

function categoryOf(tags: Record<string, string>, cats: PoiCategory[]): PoiCategory | null {
  for (const c of cats) {
    for (const f of c.filters) {
      // einfache Auswertung der Filter: [k=v], [k~"a|b"], [k] – genügt für die eigenen Filter
      const ok = [...f.matchAll(/\[([^\]]+)\]/g)].every(([, expr]) => {
        const m = expr.match(/^"?([^=~"]+)"?(=|~)?"?([^"]*)"?$/);
        if (!m) return true;
        const [, k, op, v] = m;
        if (k.startsWith('~')) return true;
        if (!op) return k in tags;
        if (op === '=') return tags[k] === v;
        return tags[k] !== undefined && new RegExp(v).test(tags[k]);
      });
      if (ok) return c;
    }
  }
  return null;
}

function toPoi(el: OsmElement, cats: PoiCategory[]): Poi | null {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const cat = categoryOf(tags, cats);
  if (!cat) return null;
  return {
    id: `${el.type}/${el.id}`,
    category: cat.key,
    icon: cat.icon,
    name: tags.name ?? cat.label.replace(/s$/, ''),
    coord: [lon, lat],
    tags,
    offset: 0,
  };
}

/**
 * Overpass-Abfrage: POIs entlang der Route. Statt eines (langsamen)
 * Korridors per `around` wird die Route in Stücke mit eigenem Rechteck
 * zerlegt – das kann Overpass über den Index sehr schnell beantworten.
 * Den genauen Abstand zur Route prüft danach der Aufrufer.
 */
export function corridorQuery(coords: LngLat[], radius: number, cats: PoiCategory[]): string {
  const line = simplify(coords, 40);
  const padLat = radius / 111320;
  const boxes: string[] = [];
  let i = 0;
  while (i < line.length - 1) {
    let minX = line[i][0];
    let maxX = minX;
    let minY = line[i][1];
    let maxY = minY;
    let j = i;
    // Stück wachsen lassen, bis das Rechteck ~6 km Kantenlänge erreicht
    while (j < line.length - 1) {
      const [x, y] = line[j + 1];
      const nx0 = Math.min(minX, x);
      const nx1 = Math.max(maxX, x);
      const ny0 = Math.min(minY, y);
      const ny1 = Math.max(maxY, y);
      if (j > i && ((nx1 - nx0) * Math.cos((y * Math.PI) / 180) > 0.085 || ny1 - ny0 > 0.055)) break;
      [minX, maxX, minY, maxY] = [nx0, nx1, ny0, ny1];
      j++;
    }
    const padLng = padLat / Math.cos((minY * Math.PI) / 180);
    boxes.push(`${fmt(minY - padLat)},${fmt(minX - padLng)},${fmt(maxY + padLat)},${fmt(maxX + padLng)}`);
    i = j;
  }
  const parts = cats.flatMap((c) => c.filters.flatMap((f) => boxes.map((b) => `node${f}(${b});`)));
  return `[out:json][timeout:25];(${parts.join('')});out tags center 1500;`;
}

/** Overpass-Abfrage: Ziele im Umkreis eines Punktes. */
export function radiusQuery(center: LngLat, radius: number, cats: PoiCategory[]): string {
  const around = `around:${Math.round(radius)},${fmt(center[1])},${fmt(center[0])}`;
  const parts = cats.flatMap((c) =>
    c.filters.flatMap((f) => (c.areas ? [`nwr${f}(${around});`] : [`node${f}(${around});`])),
  );
  return `[out:json][timeout:25];(${parts.join('')});out tags center 600;`;
}

export function parsePois(els: OsmElement[], cats: PoiCategory[]): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const el of els) {
    const p = toPoi(el, cats);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/** Bewertung eines Ziels: bekannte Orte (Wikipedia/Wikidata) und Gipfelhöhe zählen. */
export function poiWeight(p: Poi): number {
  let w = 1;
  if (p.tags.wikipedia || p.tags.wikidata) w += 1.5;
  if (p.tags.tourism === 'attraction') w += 0.5;
  if (p.tags.ele && p.category === 'peak') w += Math.min(1.5, Number(p.tags.ele) / 600 || 0);
  if (p.tags.website || p.tags.opening_hours) w += 0.3;
  return w;
}

export type DestinationSort = 'interest' | 'near' | 'far';

/**
 * Ziele im Umkreis bis `radius` Meter. „Sehenswert“ sortiert bekannte Orte
 * (Wikipedia, hohe Gipfel …) nach vorn und mischt die Kategorien, damit nicht
 * nur Gipfel kommen; „Nah“/„Weit“ sortieren nach Luftlinie.
 */
export function rankDestinations(
  pois: Poi[],
  center: LngLat,
  radius: number,
  sort: DestinationSort = 'interest',
): Poi[] {
  const within = pois
    .map((p) => ({ ...p, offset: haversine(center, p.coord) }))
    .filter((p) => p.offset >= Math.min(1000, radius * 0.1) && p.offset <= radius);
  if (sort === 'near') return within.sort((a, b) => a.offset - b.offset);
  if (sort === 'far') return within.sort((a, b) => b.offset - a.offset);
  const sorted = within.sort((a, b) => poiWeight(b) - poiWeight(a) || a.offset - b.offset);
  const byCat = new Map<string, Poi[]>();
  for (const p of sorted) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  const out: Poi[] = [];
  while (out.length < sorted.length) {
    for (const list of byCat.values()) {
      const p = list.shift();
      if (p) out.push(p);
    }
  }
  return out;
}

export function poiDetails(p: Poi): string[] {
  const t = p.tags;
  const out: string[] = [];
  if (t.ele) out.push(`${Math.round(Number(t.ele))} m ü. NN`);
  if (t.opening_hours) out.push(`Geöffnet: ${t.opening_hours}`);
  if (t.cuisine) out.push(t.cuisine.replace(/_/g, ' ').replace(/;/g, ', '));
  if (t.fee === 'no' && p.category === 'toilet') out.push('kostenlos');
  if (t.description) out.push(t.description);
  return out;
}
