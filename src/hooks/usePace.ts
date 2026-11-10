import { useMemo } from 'react';
import { useHeat } from '../api/heatStore';
import { personalPace, type PersonalPace } from '../domain/pace';
import { useStore } from '../store';

/** Persönliches Tempo für den gewählten Radtyp (null = Tempo von BRouter). */
export function usePace(): PersonalPace | null {
  const paces = useHeat((s) => s.paces);
  const bike = useStore((s) => s.settings.bike ?? 'road');
  const enabled = useStore((s) => s.usePersonalPace);
  return useMemo(() => (enabled ? personalPace(paces, bike) : null), [paces, bike, enabled]);
}

/** Tempo auch ohne Schalter (für die Anzeige in „Meine Heatmap“) */
export function useAvailablePace(): PersonalPace | null {
  const paces = useHeat((s) => s.paces);
  const bike = useStore((s) => s.settings.bike ?? 'road');
  return useMemo(() => personalPace(paces, bike), [paces, bike]);
}
