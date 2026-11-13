import { useEffect, useRef, useState } from 'react';
import { routeLeg } from '../api/brouter';
import { cumulativeDistances, formatDuration, formatKmExact } from '../domain/geo';
import { GOAL_LABEL, improveGoals, improvedSettings, judge, type ImproveGoal } from '../domain/improve';
import { estimateTime } from '../domain/pace';
import { legKey, type CombinedRoute, type LegOverride, type LegResult } from '../domain/route';
import { joinLegs, legStats } from '../domain/roundtrip';
import type { RoutingSettings } from '../domain/settings';
import { usePace } from '../hooks/usePace';
import { cachedLeg, globalNogos, legRequestFor, primeLeg } from '../hooks/useRouting';
import { useStore } from '../store';
import { Icon } from './Icon';
import { Panel } from './Panel';

interface LegPlan {
  key: string;
  index: number;
  before: LegResult;
  after: LegResult | null;
  settings: RoutingSettings | null;
  verdict: 'better' | 'detour' | 'none';
  accepted: boolean;
}

interface Result {
  goal: ImproveGoal;
  /** keine Verbesserung ohne Umweg – nur Varianten mit großem Umweg */
  detourOnly: boolean;
  legs: LegPlan[];
  before: LegResult;
  after: LegResult;
}

const PREVIEW = 'Vorschlag';

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Eine Zeile „vorher → nachher“ mit farbiger Differenz */
function Row({
  label,
  a,
  b,
  fmt,
  lowerIsBetter = true,
  unit = '',
}: {
  label: string;
  a: number;
  b: number;
  fmt: (n: number) => string;
  lowerIsBetter?: boolean;
  unit?: string;
}) {
  const d = b - a;
  const good = lowerIsBetter ? d < 0 : d > 0;
  const same = Math.abs(d) < 1e-9 || fmt(a) === fmt(b);
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{fmt(a)}</td>
      <td>
        <b>{fmt(b)}</b>
      </td>
      <td className={same ? 'muted' : good ? 'good' : 'bad'}>
        {same ? '±0' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${unit}`}
      </td>
    </tr>
  );
}

/**
 * Route verbessern: jede Etappe mit geschärften Einstellungen neu rechnen
 * (weniger Höhenmeter, besserer Belag, weniger Verkehr), Vorschlag auf der
 * Karte zeigen und auf Wunsch als angepasste Etappen übernehmen.
 */
export function ImprovePanel({ route }: { route: CombinedRoute }) {
  const settings = useStore((s) => s.settings);
  const pace = usePace();
  const goals = improveGoals(settings.bike);
  const [goal, setGoal] = useState<ImproveGoal>('climb');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const clearPreview = () => {
    if (useStore.getState().importTrack?.name === PREVIEW) useStore.getState().setImportTrack(null);
  };

  // Route geändert: alter Vorschlag passt nicht mehr
  useEffect(() => {
    ctrl.current?.abort();
    setResult(null);
    setBusy(null);
    clearPreview();
  }, [route]);
  useEffect(() => () => clearPreview(), []);

  /** Fahrzeit wie in der Übersicht: eigenes Tempo, sonst BRouter */
  const time = (l: LegResult) => (pace ? estimateTime(cumulativeDistances(l.coords), l.ele, pace) : l.time);

  const compute = async () => {
    const st = useStore.getState();
    const wps = st.waypoints;
    const blockNogos = globalNogos(st.blocks);
    ctrl.current?.abort();
    const abort = new AbortController();
    ctrl.current = abort;
    setError(null);
    setResult(null);
    clearPreview();
    const plans: LegPlan[] = [];
    const total = wps.length - 1;
    setBusy({ done: 0, total });
    try {
      for (let i = 0; i < total; i++) {
        const key = legKey(wps[i], wps[i + 1]);
        const o: LegOverride | undefined = st.overrides[key];
        const req = legRequestFor(wps[i], wps[i + 1], st.settings, o, blockNogos);
        const before = cachedLeg(req);
        if (!before) throw new Error('Route wird noch berechnet – gleich noch einmal versuchen.');
        // Importierte, umfahrene oder als Alternative gewählte Etappen bleiben, wie sie sind
        const fixed = o?.presetLabel === 'Import' || !!o?.avoid?.length || !!o?.alternative;
        let after: LegResult | null = null;
        let next: RoutingSettings | null = null;
        if (!fixed) {
          next = improvedSettings(req.settings, goal);
          if (JSON.stringify(next) !== JSON.stringify(req.settings))
            after = await routeLeg({ ...req, settings: next, alternative: 0 }, abort.signal);
        }
        const verdict = after ? judge(goal, req.settings.bike, legStats(before), legStats(after)) : 'none';
        plans.push({ key, index: i, before, after, settings: next, verdict, accepted: verdict === 'better' });
        setBusy({ done: i + 1, total });
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      setBusy(null);
      return;
    }
    // nichts ohne Umweg gefunden: dann die Umweg-Varianten zeigen (zum bewussten Übernehmen)
    const detourOnly = !plans.some((p) => p.accepted) && plans.some((p) => p.verdict === 'detour');
    if (detourOnly) for (const p of plans) p.accepted = p.verdict === 'detour';
    const before = plans.map((p) => p.before).reduce(joinLegs);
    const after = plans.map((p) => (p.accepted ? p.after! : p.before)).reduce(joinLegs);
    setResult({ goal, detourOnly, legs: plans, before, after });
    setBusy(null);
    if (plans.some((p) => p.accepted)) useStore.getState().setImportTrack({ name: PREVIEW, coords: after.coords });
  };

  const apply = () => {
    if (!result) return;
    const st = useStore.getState();
    const wps = st.waypoints;
    const blockNogos = globalNogos(st.blocks);
    const overrides = { ...st.overrides };
    for (const p of result.legs) {
      if (!p.accepted || !p.after || !p.settings) continue;
      const o = st.overrides[p.key];
      // fertige Etappe in den Cache – keine erneute Anfrage
      primeLeg(
        { from: wps[p.index], to: wps[p.index + 1], settings: p.settings, nogos: blockNogos, alternative: 0 },
        p.after,
      );
      overrides[p.key] = {
        ...o,
        settings: p.settings,
        alternative: undefined,
        presetLabel: `Verbessert: ${GOAL_LABEL[result.goal]}`,
      };
    }
    clearPreview();
    // ein Schritt im Verlauf – Rückgängig nimmt die ganze Verbesserung zurück
    useStore.setState({ overrides });
    setResult(null);
  };

  const discard = () => {
    setResult(null);
    clearPreview();
  };

  const changed = result?.legs.filter((p) => p.accepted).length ?? 0;
  const a = result ? legStats(result.before) : null;
  const b = result ? legStats(result.after) : null;

  return (
    <Panel
      id="improve"
      icon="sliders"
      title="Route verbessern"
      summary="weniger Höhenmeter, besserer Belag, weniger Verkehr"
    >
      <div className="choice wrap">
        {goals.map((g) => (
          <button
            key={g.value}
            className={goal === g.value ? 'on' : ''}
            title={g.hint}
            onClick={() => {
              setGoal(g.value);
              discard();
            }}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="muted small">
        Jede Etappe wird mit geschärften Einstellungen neu gerechnet. Übernommen wird nur, was spürbar besser ist und
        höchstens 30 % länger – importierte und umfahrene Etappen bleiben, wie sie sind.
      </p>
      {busy ? (
        <div className="loop-progress">
          <div className="progress">
            <span style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} />
          </div>
          <div className="loop-progress-row">
            <small>
              Rechne Etappe {Math.min(busy.done + 1, busy.total)} von {busy.total} …
            </small>
            <button className="mini" onClick={() => ctrl.current?.abort()}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        !result && (
          <button className="primary wide-btn" onClick={compute}>
            <Icon name="sliders" size={16} /> Vorschlag berechnen
          </button>
        )
      )}
      {error && <div className="error">{error}</div>}
      {result && a && b && (
        <div className="improve-result">
          {changed === 0 ? (
            <p className="small">
              Keine bessere Variante gefunden – für „{GOAL_LABEL[result.goal]}“ ist die Route hier schon gut.
            </p>
          ) : (
            <>
              <p className="small">
                {result.detourOnly ? (
                  <>
                    Ohne Umweg geht es nicht besser. <b>Mit Umweg</b> (mehr als 30 % länger) ginge es so – auf der Karte
                    lila gestrichelt:
                  </>
                ) : (
                  <>
                    <b>
                      {changed} von {result.legs.length} {result.legs.length === 1 ? 'Etappe' : 'Etappen'}
                    </b>{' '}
                    geändert – auf der Karte lila gestrichelt.
                  </>
                )}
              </p>
              <table className="improve-table">
                <thead>
                  <tr>
                    <th />
                    <th>vorher</th>
                    <th>nachher</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <Row label="Distanz" a={a.length} b={b.length} fmt={(n) => `${formatKmExact(n)} km`} unit="" />
                  <Row label="Anstieg" a={a.ascend} b={b.ascend} fmt={(n) => `${Math.round(n)} hm`} />
                  <Row label="Fahrzeit" a={time(result.before)} b={time(result.after)} fmt={formatDuration} />
                  {result.goal === 'surface' && (
                    <Row
                      label={settings.bike === 'gravel' || settings.bike === 'mtb' ? 'Unbefestigt' : 'Asphalt'}
                      a={settings.bike === 'gravel' || settings.bike === 'mtb' ? a.unpaved : a.paved}
                      b={settings.bike === 'gravel' || settings.bike === 'mtb' ? b.unpaved : b.paved}
                      fmt={pct}
                      lowerIsBetter={false}
                    />
                  )}
                  {result.goal === 'traffic' && <Row label="Hauptstraßen" a={a.busy} b={b.busy} fmt={pct} />}
                </tbody>
              </table>
            </>
          )}
          <div className="admin-actions">
            {changed > 0 && (
              <button className="primary" onClick={apply}>
                <Icon name="check" size={15} /> {result.detourOnly ? 'Trotzdem übernehmen' : 'Übernehmen'}
              </button>
            )}
            <button className="ghost" onClick={discard}>
              {changed > 0 ? 'Verwerfen' : 'Schließen'}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
