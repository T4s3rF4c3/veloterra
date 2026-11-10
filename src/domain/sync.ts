/**
 * Abgleich zwischen Browser und Konto auf dem Veloterra-Server – als reine
 * Funktionen, damit die Regeln testbar sind.
 */

export interface Stamp {
  id: string;
  savedAt: number;
}

export interface RoutePlan {
  /** vom Server holen (neu oder dort neuer) */
  pull: string[];
  /** hochladen (neu oder hier neuer) */
  push: string[];
  /** hier löschen (auf einem anderen Gerät gelöscht) */
  removeLocal: string[];
  /** auf dem Server löschen (hier seit dem letzten Abgleich gelöscht) */
  removeRemote: string[];
}

/**
 * Regeln: Neuerer Stand gewinnt. Eine Route, die hier seit dem letzten
 * Abgleich gelöscht wurde, wird auch auf dem Server gelöscht – außer sie wurde
 * dort inzwischen geändert. Umgekehrt verschwindet eine auf dem Server
 * gelöschte Route hier, außer sie wurde hier nach dem Löschen gespeichert.
 *
 * @param synced Stand je Route beim letzten Abgleich (id → savedAt)
 */
export function planRoutes(
  local: Stamp[],
  remote: Stamp[],
  deleted: Record<string, number>,
  synced: Record<string, number>,
): RoutePlan {
  const plan: RoutePlan = { pull: [], push: [], removeLocal: [], removeRemote: [] };
  const L = new Map(local.map((r) => [r.id, r.savedAt]));
  const R = new Map(remote.map((r) => [r.id, r.savedAt]));
  for (const [id, rAt] of R) {
    const lAt = L.get(id);
    if (lAt === undefined) {
      if (synced[id] !== undefined && synced[id] >= rAt) plan.removeRemote.push(id);
      else plan.pull.push(id);
    } else if (rAt > lAt) plan.pull.push(id);
    else if (lAt > rAt) plan.push.push(id);
  }
  for (const [id, lAt] of L) {
    if (R.has(id)) continue;
    if (deleted[id] !== undefined && deleted[id] >= lAt) plan.removeLocal.push(id);
    else plan.push.push(id);
  }
  return plan;
}

export interface HeatPlan {
  upload: string[];
  download: string[];
}

/** Fahrten: was fehlt wo? Eine Fahrt mit Tempo-Daten ersetzt eine ohne. */
export function planHeat(local: Map<string, boolean>, remote: Map<string, boolean>): HeatPlan {
  const upload: string[] = [];
  const download: string[] = [];
  for (const [id, pace] of local) if (!remote.has(id) || (pace && !remote.get(id))) upload.push(id);
  for (const [id, pace] of remote) if (!local.has(id) || (pace && !local.get(id))) download.push(id);
  return { upload, download };
}

/** In Pakete aufteilen (Anfragen klein halten) */
export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
