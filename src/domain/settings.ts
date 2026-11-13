/** Wie stark eine Kategorie bevorzugt oder gemieden wird. */
export type Pref = 'prefer' | 'neutral' | 'avoid' | 'forbid';

export const PREFS: Pref[] = ['prefer', 'neutral', 'avoid', 'forbid'];

export const PREF_LABEL: Record<Pref, string> = {
  prefer: 'Bevorzugen',
  neutral: 'Neutral',
  avoid: 'Meiden',
  forbid: 'Sperren',
};

/** Kostenfaktor je Stufe – wird mit Straßen- und Belagsfaktor multipliziert. */
export const PREF_FACTOR: Record<Pref, number> = {
  prefer: 1,
  neutral: 1.25,
  avoid: 3,
  forbid: 10000,
};

export type SurfaceCat = 'asphalt' | 'concrete' | 'paving' | 'cobble' | 'compacted' | 'gravel' | 'unpaved' | 'unknown';

export type RoadCat = 'primary' | 'secondary' | 'tertiary' | 'minor' | 'residential' | 'cycleway' | 'track' | 'path';

export interface CategoryInfo<K extends string> {
  key: K;
  label: string;
  hint: string;
  color: string;
}

export const SURFACES: CategoryInfo<SurfaceCat>[] = [
  { key: 'asphalt', label: 'Asphalt', hint: 'asphalt, paved', color: '#4dabf7' },
  { key: 'concrete', label: 'Beton', hint: 'Betonplatten, Betonwege', color: '#4dabf7' },
  { key: 'paving', label: 'Pflaster (glatt)', hint: 'Verbundpflaster, Holz, Metall', color: '#66d9e8' },
  { key: 'cobble', label: 'Kopfsteinpflaster', hint: 'sett, cobblestone, Rasengitter', color: '#ff922b' },
  { key: 'compacted', label: 'Feiner Schotter', hint: 'compacted, fine_gravel', color: '#ffd43b' },
  { key: 'gravel', label: 'Schotter', hint: 'gravel, pebblestone', color: '#ff922b' },
  { key: 'unpaved', label: 'Unbefestigt', hint: 'Erde, Gras, Sand, Wurzeln', color: '#ff6b6b' },
  { key: 'unknown', label: 'Unbekannt', hint: 'kein Belag in OSM erfasst', color: '#adb5bd' },
];

/**
 * Belagsklasse 1–5 wie in einer Straßenzustandskarte (1 = glatt, 5 = unbefestigt,
 * 0 = unbekannt). Die Farben der Beläge folgen dieser Rampe.
 */
export const SURFACE_CLASS: Record<SurfaceCat, number> = {
  asphalt: 1,
  concrete: 1,
  paving: 2,
  compacted: 3,
  cobble: 4,
  gravel: 4,
  unpaved: 5,
  unknown: 0,
};

export const ROADS: CategoryInfo<RoadCat>[] = [
  { key: 'primary', label: 'Bundesstraße', hint: 'primary, trunk', color: '#ff6b6b' },
  { key: 'secondary', label: 'Landstraße', hint: 'secondary', color: '#ff922b' },
  { key: 'tertiary', label: 'Kreisstraße', hint: 'tertiary', color: '#ffd43b' },
  { key: 'minor', label: 'Nebenstraße', hint: 'unclassified', color: '#dee2e6' },
  { key: 'residential', label: 'Wohnstraße', hint: 'residential, service', color: '#a5b4c4' },
  { key: 'cycleway', label: 'Radweg', hint: 'cycleway, Fahrradstraße', color: '#63e6be' },
  { key: 'track', label: 'Wirtschaftsweg', hint: 'track', color: '#c9a27e' },
  { key: 'path', label: 'Pfad / Trail', hint: 'path, footway, bridleway', color: '#f783ac' },
];

export type BikeType = 'road' | 'gravel' | 'mtb' | 'trekking';

export const BIKE_TYPES: { key: BikeType; label: string }[] = [
  { key: 'road', label: 'Rennrad' },
  { key: 'gravel', label: 'Gravel' },
  { key: 'mtb', label: 'MTB' },
  { key: 'trekking', label: 'Trekking' },
];

/**
 * Höchste erlaubte Trail-Schwierigkeit (OSM mtb:scale S0–S3; fehlt sie,
 * wird sac_scale herangezogen). 'none' = nicht berücksichtigen.
 */
export type TrailLevel = 'none' | '0' | '1' | '2' | '3';

export type TrafficLevel = 0 | 0.3 | 1;
/** 'max' nur intern für Rundtouren mit „möglichst wenig Höhenmeter“ */
export type HillLevel = 'ignore' | 'moderate' | 'strong' | 'max';
export type SpeedLimit = 'off' | '70' | '50';

export interface RoutingSettings {
  /** Radtyp: bestimmt Tempo-Modell und Texte (alte gespeicherte Einstellungen: Rennrad) */
  bike?: BikeType;
  /** schwierigere Trails sperren */
  trailLevel?: TrailLevel;
  surface: Record<SurfaceCat, Pref>;
  road: Record<RoadCat, Pref>;
  /** Verkehrsreiche Straßen meiden (BRouter estimated_traffic_class). */
  traffic: TrafficLevel;
  /** Steigungen vermeiden. */
  hills: HillLevel;
  /** Straßen mit höherem Tempolimit meiden. */
  speedLimit: SpeedLimit;
  /** Schlechte Fahrbahnqualität (smoothness=bad …) meiden. */
  avoidBadSmoothness: boolean;
  /** Ausgeschilderte Radrouten bevorzugen. */
  preferCycleRoutes: boolean;
  /** Fähren erlauben. */
  allowFerries: boolean;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  settings: RoutingSettings;
}

const roadBikeBase: RoutingSettings = {
  bike: 'road',
  trailLevel: '0',
  surface: {
    asphalt: 'prefer',
    concrete: 'neutral',
    paving: 'avoid',
    cobble: 'avoid',
    compacted: 'avoid',
    gravel: 'forbid',
    unpaved: 'forbid',
    unknown: 'avoid',
  },
  road: {
    primary: 'avoid',
    secondary: 'neutral',
    tertiary: 'prefer',
    minor: 'prefer',
    residential: 'neutral',
    cycleway: 'neutral',
    track: 'neutral',
    path: 'avoid',
  },
  traffic: 0.3,
  hills: 'ignore',
  speedLimit: 'off',
  avoidBadSmoothness: true,
  preferCycleRoutes: false,
  allowFerries: true,
};

export const PRESETS: Preset[] = [
  // Rennrad
  {
    id: 'road',
    label: 'Rennrad',
    description: 'Asphalt, ruhige Landstraßen, kein Schotter',
    settings: roadBikeBase,
  },
  {
    id: 'road-quiet',
    label: 'Rennrad ruhig',
    description: 'Wenig Verkehr, Bundesstraßen gesperrt',
    settings: {
      ...roadBikeBase,
      road: { ...roadBikeBase.road, primary: 'forbid', secondary: 'avoid', track: 'prefer', cycleway: 'prefer' },
      traffic: 1,
      speedLimit: '70',
    },
  },
  {
    id: 'road-fast',
    label: 'Schnell & direkt',
    description: 'Gute Straßen, auch größere, möglichst direkt',
    settings: {
      ...roadBikeBase,
      road: { ...roadBikeBase.road, primary: 'neutral', secondary: 'prefer' },
      traffic: 0,
    },
  },
  // Gravel
  {
    id: 'allroad',
    label: 'Allroad',
    description: 'Asphalt und feiner Schotter, kaum grobe Wege',
    settings: {
      ...roadBikeBase,
      bike: 'gravel',
      surface: { ...roadBikeBase.surface, compacted: 'neutral', gravel: 'avoid', unpaved: 'avoid', unknown: 'neutral' },
      road: { ...roadBikeBase.road, track: 'prefer', path: 'neutral', primary: 'forbid' },
      traffic: 1,
    },
  },
  {
    id: 'gravel',
    label: 'Gravel',
    description: 'Schotter- und Wirtschaftswege, Asphalt nur zum Verbinden',
    settings: {
      bike: 'gravel',
      trailLevel: '1',
      surface: {
        asphalt: 'neutral',
        concrete: 'neutral',
        paving: 'avoid',
        cobble: 'avoid',
        compacted: 'prefer',
        gravel: 'prefer',
        unpaved: 'neutral',
        unknown: 'neutral',
      },
      road: {
        primary: 'forbid',
        secondary: 'avoid',
        tertiary: 'neutral',
        minor: 'neutral',
        residential: 'neutral',
        cycleway: 'prefer',
        track: 'prefer',
        path: 'neutral',
      },
      traffic: 1,
      hills: 'ignore',
      speedLimit: '70',
      avoidBadSmoothness: false,
      preferCycleRoutes: false,
      allowFerries: true,
    },
  },
  // MTB
  {
    id: 'mtb-tour',
    label: 'MTB Tour',
    description: 'Forst- und Feldwege, leichte Trails bis S1',
    settings: {
      bike: 'mtb',
      trailLevel: '1',
      surface: {
        asphalt: 'avoid',
        concrete: 'avoid',
        paving: 'avoid',
        cobble: 'avoid',
        compacted: 'prefer',
        gravel: 'prefer',
        unpaved: 'prefer',
        unknown: 'neutral',
      },
      road: {
        primary: 'forbid',
        secondary: 'forbid',
        tertiary: 'avoid',
        minor: 'neutral',
        residential: 'neutral',
        cycleway: 'neutral',
        track: 'prefer',
        path: 'neutral',
      },
      traffic: 1,
      hills: 'ignore',
      speedLimit: '70',
      avoidBadSmoothness: false,
      preferCycleRoutes: false,
      allowFerries: true,
    },
  },
  {
    id: 'mtb-trail',
    label: 'MTB Trail',
    description: 'Möglichst viele Trails bis S2, wenig Asphalt',
    settings: {
      bike: 'mtb',
      trailLevel: '2',
      surface: {
        asphalt: 'avoid',
        concrete: 'avoid',
        paving: 'avoid',
        cobble: 'avoid',
        compacted: 'neutral',
        gravel: 'prefer',
        unpaved: 'prefer',
        unknown: 'prefer',
      },
      road: {
        primary: 'forbid',
        secondary: 'forbid',
        tertiary: 'avoid',
        minor: 'avoid',
        residential: 'neutral',
        cycleway: 'neutral',
        track: 'neutral',
        path: 'prefer',
      },
      traffic: 1,
      hills: 'ignore',
      speedLimit: '50',
      avoidBadSmoothness: false,
      preferCycleRoutes: false,
      allowFerries: true,
    },
  },
  // Trekking / Alltag
  {
    id: 'trekking',
    label: 'Trekking',
    description: 'Radwege und ruhige Wege, Belag gemischt',
    settings: {
      bike: 'trekking',
      trailLevel: '0',
      surface: {
        asphalt: 'prefer',
        concrete: 'neutral',
        paving: 'neutral',
        cobble: 'avoid',
        compacted: 'neutral',
        gravel: 'avoid',
        unpaved: 'avoid',
        unknown: 'neutral',
      },
      road: {
        primary: 'forbid',
        secondary: 'avoid',
        tertiary: 'neutral',
        minor: 'prefer',
        residential: 'neutral',
        cycleway: 'prefer',
        track: 'neutral',
        path: 'avoid',
      },
      traffic: 1,
      hills: 'ignore',
      speedLimit: '70',
      avoidBadSmoothness: true,
      preferCycleRoutes: true,
      allowFerries: true,
    },
  },
  {
    id: 'commute',
    label: 'Alltag',
    description: 'Direkt und sicher: Radwege, Asphalt, wenig Steigung',
    settings: {
      bike: 'trekking',
      trailLevel: '0',
      surface: {
        asphalt: 'prefer',
        concrete: 'prefer',
        paving: 'neutral',
        cobble: 'avoid',
        compacted: 'neutral',
        gravel: 'avoid',
        unpaved: 'forbid',
        unknown: 'avoid',
      },
      road: {
        primary: 'avoid',
        secondary: 'neutral',
        tertiary: 'neutral',
        minor: 'neutral',
        residential: 'prefer',
        cycleway: 'prefer',
        track: 'avoid',
        path: 'avoid',
      },
      traffic: 0.3,
      hills: 'moderate',
      speedLimit: 'off',
      avoidBadSmoothness: true,
      preferCycleRoutes: false,
      allowFerries: true,
    },
  },
];

export const DEFAULT_SETTINGS = PRESETS[0].settings;

export function cloneSettings(s: RoutingSettings): RoutingSettings {
  return {
    ...s,
    surface: { ...s.surface },
    road: { ...s.road },
  };
}

/**
 * Eigene Einstellungen einer Etappe auf ein geändertes Profil übertragen:
 * Was die Etappe gegenüber dem alten Profil anders hatte („hier Schotter ok“,
 * „weniger Höhenmeter“), bleibt – alles andere folgt dem neuen Profil.
 */
export function rebaseSettings(
  own: RoutingSettings,
  oldBase: RoutingSettings,
  newBase: RoutingSettings,
): RoutingSettings {
  const out = cloneSettings(newBase);
  for (const k of Object.keys(own) as (keyof RoutingSettings)[]) {
    if (k === 'surface' || k === 'road') continue;
    if (own[k] !== oldBase[k]) (out as unknown as Record<string, unknown>)[k] = own[k];
  }
  for (const k of Object.keys(own.surface) as SurfaceCat[])
    if (own.surface[k] !== oldBase.surface[k]) out.surface[k] = own.surface[k];
  for (const k of Object.keys(own.road) as RoadCat[]) if (own.road[k] !== oldBase.road[k]) out.road[k] = own.road[k];
  return out;
}
