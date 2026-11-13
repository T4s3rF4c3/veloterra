import type { LegStats } from './roundtrip';
import { cloneSettings, type BikeType, type RoutingSettings } from './settings';

/**
 * Route verbessern: jede Etappe noch einmal mit geschärften Einstellungen
 * rechnen und nur übernehmen, was wirklich besser ist – ohne große Umwege.
 */
export type ImproveGoal = 'climb' | 'surface' | 'traffic';

const offroad = (bike: BikeType | undefined) => bike === 'gravel' || bike === 'mtb';

export function improveGoals(bike: BikeType | undefined): { value: ImproveGoal; label: string; hint: string }[] {
  return [
    { value: 'climb', label: 'Weniger Höhenmeter', hint: 'Flachere Wege suchen, Steigungen kosten viel' },
    offroad(bike)
      ? { value: 'surface', label: 'Mehr Schotter & Wege', hint: 'Unbefestigte Wege bevorzugen, weniger Asphalt' }
      : { value: 'surface', label: 'Mehr Asphalt', hint: 'Glatte Fahrbahn bevorzugen, Schotter und Pflaster meiden' },
    { value: 'traffic', label: 'Weniger Verkehr', hint: 'Bundes- und Landesstraßen meiden, Radwege bevorzugen' },
  ];
}

export const GOAL_LABEL: Record<ImproveGoal, string> = {
  climb: 'weniger Höhenmeter',
  surface: 'besserer Belag',
  traffic: 'weniger Verkehr',
};

/** Einstellungen, mit denen eine Etappe für das Ziel neu gerechnet wird */
export function improvedSettings(base: RoutingSettings, goal: ImproveGoal): RoutingSettings {
  const s = cloneSettings(base);
  const soften = (p: string) => (p === 'prefer' || p === 'neutral' ? 'avoid' : p);
  if (goal === 'climb') s.hills = 'max';
  if (goal === 'surface') {
    if (offroad(s.bike)) {
      s.surface.compacted = 'prefer';
      s.surface.gravel = 'prefer';
      if (s.surface.unpaved !== 'forbid') s.surface.unpaved = s.bike === 'mtb' ? 'prefer' : 'neutral';
      if (s.surface.asphalt === 'prefer') s.surface.asphalt = 'neutral';
      if (s.surface.concrete === 'prefer') s.surface.concrete = 'neutral';
    } else {
      s.surface.asphalt = 'prefer';
      s.surface.concrete = 'prefer';
      s.surface.cobble = soften(s.surface.cobble) as typeof s.surface.cobble;
      s.surface.gravel = soften(s.surface.gravel) as typeof s.surface.gravel;
      s.surface.unpaved = soften(s.surface.unpaved) as typeof s.surface.unpaved;
      s.surface.compacted = soften(s.surface.compacted) as typeof s.surface.compacted;
      s.avoidBadSmoothness = true;
    }
  }
  if (goal === 'traffic') {
    s.traffic = 1;
    s.speedLimit = '50';
    s.preferCycleRoutes = true;
    s.road.primary = soften(s.road.primary) as typeof s.road.primary;
    s.road.secondary = soften(s.road.secondary) as typeof s.road.secondary;
  }
  return s;
}

/** Höchstens so viel länger darf eine verbesserte Etappe werden */
export const MAX_DETOUR = 1.3;

/**
 * Urteil über eine neu gerechnete Etappe: spürbar besser, besser aber mit
 * großem Umweg (mehr als 30 % länger) oder nicht besser.
 */
export function judge(
  goal: ImproveGoal,
  bike: BikeType | undefined,
  before: LegStats,
  after: LegStats,
): 'better' | 'detour' | 'none' {
  const gain =
    goal === 'climb'
      ? after.ascend <= before.ascend - Math.max(10, before.ascend * 0.08)
      : goal === 'surface'
        ? offroad(bike)
          ? after.unpaved >= before.unpaved + 0.04
          : after.paved >= before.paved + 0.04
        : after.busy <= before.busy - 0.04;
  if (!gain) return 'none';
  return after.length > before.length * MAX_DETOUR ? 'detour' : 'better';
}

/** Spürbar besser und kein großer Umweg? */
export const isBetter = (goal: ImproveGoal, bike: BikeType | undefined, before: LegStats, after: LegStats) =>
  judge(goal, bike, before, after) === 'better';
