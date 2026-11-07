import type { RoadCat, SurfaceCat } from './settings';

/**
 * Tag-Gruppen. Werden sowohl im Browser zur Einfärbung als auch im
 * generierten BRouter-Profil verwendet – damit beide dieselbe Sicht haben.
 * Nur Werte, die in BRouters lookups.dat bekannt sind!
 */
export const SURFACE_TAGS: Record<Exclude<SurfaceCat, 'unknown'>, string[]> = {
  asphalt: ['asphalt', 'paved'],
  concrete: ['concrete'],
  paving: ['paving_stones', 'wood', 'metal'],
  cobble: ['sett', 'cobblestone', 'stone', 'grass_paver'],
  compacted: ['compacted', 'fine_gravel'],
  gravel: ['gravel', 'pebblestone'],
  unpaved: ['unpaved', 'ground', 'dirt', 'earth', 'grass', 'mud', 'sand', 'clay', 'rock'],
};

export const ROAD_TAGS: Record<Exclude<RoadCat, 'cycleway'>, string[]> = {
  primary: ['trunk', 'trunk_link', 'primary', 'primary_link'],
  secondary: ['secondary', 'secondary_link'],
  tertiary: ['tertiary', 'tertiary_link'],
  minor: ['unclassified', 'road'],
  residential: ['residential', 'living_street', 'service'],
  track: ['track'],
  path: ['path', 'footway', 'pedestrian', 'bridleway', 'steps'],
};

/** Straßen, bei denen ein fehlendes surface-Tag als Asphalt angenommen wird. */
export const ASSUME_PAVED_HIGHWAYS = [
  ...ROAD_TAGS.primary,
  ...ROAD_TAGS.secondary,
  ...ROAD_TAGS.tertiary,
  ...ROAD_TAGS.minor,
  ...ROAD_TAGS.residential,
  'cycleway',
];

export const GOOD_SMOOTHNESS = ['excellent', 'very_good', 'good'];
export const BAD_SMOOTHNESS = ['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable', 'rough', 'poor'];

/** Pfade, die als Radweg gelten (bicycle=designated). */
export const DESIGNATED_PATHS = ['path', 'footway', 'pedestrian', 'bridleway'];

export type Tags = Record<string, string>;

export function parseWayTags(s: string): Tags {
  const tags: Tags = {};
  for (const part of s.split(' ')) {
    const i = part.indexOf('=');
    if (i > 0) tags[part.slice(0, i)] = part.slice(i + 1);
  }
  return tags;
}

export interface SurfaceResult {
  cat: SurfaceCat;
  /** true, wenn der Belag nicht getaggt, sondern abgeleitet wurde. */
  inferred: boolean;
}

export function classifySurface(t: Tags): SurfaceResult {
  const s = t.surface;
  if (s) {
    for (const [cat, values] of Object.entries(SURFACE_TAGS)) {
      if (values.includes(s)) return { cat: cat as SurfaceCat, inferred: false };
    }
    // BRouter normalisiert Aliasse (z. B. chipseal → paved), Rest: unbekannt
    return { cat: 'unknown', inferred: false };
  }
  const tt = t.tracktype;
  if (tt === 'grade1') return { cat: 'asphalt', inferred: true };
  if (tt === 'grade2') return { cat: 'compacted', inferred: true };
  if (tt === 'grade3') return { cat: 'gravel', inferred: true };
  if (tt === 'grade4' || tt === 'grade5') return { cat: 'unpaved', inferred: true };
  if (t.highway && ASSUME_PAVED_HIGHWAYS.includes(t.highway)) return { cat: 'asphalt', inferred: true };
  if (t.smoothness && GOOD_SMOOTHNESS.includes(t.smoothness)) return { cat: 'asphalt', inferred: true };
  return { cat: 'unknown', inferred: true };
}

export function classifyRoad(t: Tags): RoadCat {
  const h = t.highway ?? '';
  if (h === 'cycleway' || t.bicycle_road === 'yes') return 'cycleway';
  if (DESIGNATED_PATHS.includes(h) && t.bicycle === 'designated') return 'cycleway';
  for (const [cat, values] of Object.entries(ROAD_TAGS)) {
    if (values.includes(h)) return cat as RoadCat;
  }
  // Fähren, Sonstiges
  return 'minor';
}

export const HIGHWAY_LABEL: Record<string, string> = {
  trunk: 'Kraftfahrstraße',
  primary: 'Bundesstraße',
  secondary: 'Landstraße',
  tertiary: 'Kreisstraße',
  unclassified: 'Nebenstraße',
  residential: 'Wohnstraße',
  living_street: 'Spielstraße',
  service: 'Zufahrt',
  cycleway: 'Radweg',
  track: 'Wirtschaftsweg',
  path: 'Pfad',
  footway: 'Fußweg',
  pedestrian: 'Fußgängerzone',
  steps: 'Treppe',
};
