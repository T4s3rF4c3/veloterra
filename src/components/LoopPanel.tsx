import { useEffect, useMemo } from 'react';
import { cumulativeDistances, formatDuration, formatKm } from '../domain/geo';
import { estimateTime } from '../domain/pace';
import { usePace } from '../hooks/usePace';
import {
  DIRECTIONS,
  SUGGESTION_COLORS,
  ascendPerKm,
  rateRoundTrip,
  sortSuggestions,
  type Climb,
  type Direction,
  type Ranking,
  type ReturnWay,
  type TourShape,
} from '../domain/roundtrip';
import { summarizeWind, windAlong, type WindForecast } from '../domain/wind';
import { useHeat } from '../api/heatStore';
import { useRoundTrip } from '../hooks/useRoundTrip';
import { departureTime } from '../hooks/useWind';
import { useStore } from '../store';
import { WindCard } from './WindCard';

/** Kompass: 3×3-Raster mit „Beliebig“ in der Mitte. */
const COMPASS: (Direction | null)[] = [315, 0, 45, 270, 'any', 90, 225, 180, 135];

const RANKINGS: { value: Ranking; label: string }[] = [
  { value: 'quality', label: 'Beste Straßen' },
  { value: 'flat', label: 'Flach' },
  { value: 'hilly', label: 'Hügelig' },
  { value: 'wind', label: 'Rückenwind heim' },
  { value: 'novel', label: 'Neue Straßen' },
];

const CLIMBS: { value: Climb; label: string; hint: string; ranking: Ranking }[] = [
  { value: 'any', label: 'Egal', hint: 'Höhenmeter wie im Routing-Profil eingestellt', ranking: 'quality' },
  {
    value: 'low',
    label: 'Möglichst wenig',
    hint: 'Steigungen kosten bei der Suche viel, mehr Richtungen werden ausprobiert – die flachsten zuerst',
    ranking: 'flat',
  },
  { value: 'high', label: 'Gern viel', hint: 'Bergige Runden zuerst', ranking: 'hilly' },
];

const SHAPES: { value: TourShape; label: string; hint: string }[] = [
  { value: 'loop', label: 'Runde', hint: 'Rundtour zurück zum Start' },
  { value: 'outback', label: 'Hin & zurück', hint: 'In eine Richtung bis zu einem Wendepunkt und zurück' },
];

const RETURNS: { value: ReturnWay; label: string; hint: string }[] = [
  { value: 'other', label: 'Anderer Weg', hint: 'Rückweg möglichst nicht auf dem Hinweg' },
  { value: 'same', label: 'Gleicher Weg', hint: 'Auf demselben Weg zurück – bekannt und planbar' },
];

/** Schieberegler: ganz rechts = ohne Grenze */
const LIMIT_OFF = 3050;

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 75 ? 'good' : score >= 50 ? 'ok' : 'bad';
  return (
    <span className={`score ${cls}`} title="Passt zu deinen Einstellungen (Belag, Straßenart, wenig doppelt, Länge)">
      {score}
    </span>
  );
}

export function LoopPanel({
  onFit,
  wind,
}: {
  onFit: (id: string) => void;
  wind: { forecast: WindForecast | null; error: string | null };
}) {
  const loopStart = useStore((s) => s.loopStart);
  const options = useStore((s) => s.loopOptions);
  const suggestions = useStore((s) => s.suggestions);
  const active = useStore((s) => s.activeSuggestion);
  const settings = useStore((s) => s.settings);
  const pace = usePace();
  const heat = useHeat((s) => s.index);
  // bei Gravel/MTB interessiert der Anteil unbefestigt, sonst der Asphalt
  const offroad = settings.bike === 'gravel' || settings.bike === 'mtb';
  const departure = departureTime(useStore((s) => s.departure));
  const st = useStore.getState;
  const { generate, cancel, apply, progress, error, stale } = useRoundTrip();
  const climb = options.climb ?? 'any';
  const shape = options.shape ?? 'loop';
  const returnWay = options.returnWay ?? 'other';
  const maxAscend = options.maxAscend ?? 0;

  // Farben bleiben an der Reihenfolge des Eintreffens, Sortierung nur in der Liste
  const rated = useMemo(
    () =>
      sortSuggestions(
        suggestions.map((s, i) => {
          const stats = rateRoundTrip(s.leg, settings, options.distance, s.sameWay);
          if (wind.forecast) {
            const dist = cumulativeDistances(s.leg.coords);
            const w = windAlong(s.leg.coords, dist, wind.forecast, departure, s.leg.time);
            const sum = summarizeWind(dist, w.hw, w.speed);
            stats.windGain = sum.firstHalf - sum.secondHalf;
          }
          if (heat && heat.size) stats.novelty = heat.novelty(s.leg.coords);
          return { ...s, color: SUGGESTION_COLORS[i % SUGGESTION_COLORS.length], stats };
        }),
        options.ranking,
        maxAscend,
      ),
    [suggestions, settings, options.distance, options.ranking, maxAscend, wind.forecast, departure, heat],
  );

  // Karte auf alle Vorschläge ausrichten, sobald neue eintreffen
  useEffect(() => {
    if (suggestions.length) onFit('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.length]);

  const dirLabel = (d: Direction) => (d === 'any' ? '✱' : DIRECTIONS.find((x) => x.deg === d)!.label);

  return (
    <section className="card loop">
      <div className={`loop-start ${loopStart ? 'set' : ''}`}>
        <span className="pin">S</span>
        {loopStart ? (
          <span>
            Startpunkt gesetzt
            <small>Klick auf die Karte setzt ihn neu</small>
          </span>
        ) : (
          <span>
            Startpunkt wählen
            <small>Auf die Karte klicken oder oben einen Ort suchen</small>
          </span>
        )}
      </div>

      <label className="opt-label">Art</label>
      <div className="choice">
        {SHAPES.map((x) => (
          <button
            key={x.value}
            className={shape === x.value ? 'on' : ''}
            title={x.hint}
            onClick={() => st().setLoopOptions({ shape: x.value })}
          >
            {x.label}
          </button>
        ))}
      </div>
      {shape === 'outback' && (
        <>
          <label className="opt-label">Rückweg</label>
          <div className="choice">
            {RETURNS.map((x) => (
              <button
                key={x.value}
                className={returnWay === x.value ? 'on' : ''}
                title={x.hint}
                onClick={() => st().setLoopOptions({ returnWay: x.value })}
              >
                {x.label}
              </button>
            ))}
          </div>
        </>
      )}

      <label className="opt-label">
        Länge {shape === 'outback' ? 'gesamt ' : ''}
        <b className="val">{Math.round(options.distance / 1000)} km</b>
        {shape === 'outback' && (
          <small className="muted"> · Wendepunkt nach ca. {Math.round(options.distance / 2000)} km</small>
        )}
      </label>
      <input
        type="range"
        className="range"
        min={20}
        max={200}
        step={5}
        value={options.distance / 1000}
        onChange={(e) => st().setLoopOptions({ distance: Number(e.target.value) * 1000 })}
      />
      <div className="range-scale">
        <span>20</span>
        <span>60</span>
        <span>100</span>
        <span>150</span>
        <span>200 km</span>
      </div>

      <label className="opt-label">Höhenmeter</label>
      <div className="choice">
        {CLIMBS.map((c) => (
          <button
            key={c.value}
            className={climb === c.value ? 'on' : ''}
            title={c.hint}
            onClick={() => st().setLoopOptions({ climb: c.value, ranking: c.ranking })}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label className="opt-label">
        Höchstens <b className="val">{maxAscend ? `${maxAscend} hm` : 'ohne Grenze'}</b>
        {maxAscend > 0 && (
          <small className="muted"> · Ø {Math.round(maxAscend / (options.distance / 1000))} hm/km</small>
        )}
      </label>
      <input
        type="range"
        className="range"
        min={100}
        max={LIMIT_OFF}
        step={50}
        value={maxAscend || LIMIT_OFF}
        aria-label="Höchstens Höhenmeter"
        onChange={(e) => {
          const v = Number(e.target.value);
          st().setLoopOptions({ maxAscend: v >= LIMIT_OFF ? 0 : v });
        }}
      />
      <div className="range-scale">
        <span>100</span>
        <span>1000</span>
        <span>2000</span>
        <span>ohne</span>
      </div>
      {(climb === 'low' || maxAscend > 0) && (
        <p className="muted small">
          {climb === 'low'
            ? 'Steigungen kosten bei der Suche viel, und es werden mehr Richtungen ausprobiert.'
            : 'Mit Limit sucht Veloterra flacher und probiert mehr Richtungen aus.'}
          {maxAscend > 0 && ' Runden über dem Limit stehen hinten und sind markiert.'}
        </p>
      )}

      <div className="loop-row">
        <div>
          <label className="opt-label">Richtung</label>
          <div className="compass">
            {COMPASS.map((d) => (
              <button
                key={String(d)}
                className={options.direction === d ? 'on' : ''}
                onClick={() => st().setLoopOptions({ direction: d! })}
                title={d === 'any' ? 'Beliebige Richtung' : `Richtung ${dirLabel(d!)}`}
              >
                {dirLabel(d!)}
              </button>
            ))}
          </div>
        </div>
        <div className="loop-rank">
          <label className="opt-label">Vorschläge sortieren</label>
          <div className="choice vertical">
            {RANKINGS.map((r) => (
              <button
                key={r.value}
                className={options.ranking === r.value ? 'on' : ''}
                onClick={() => st().setLoopOptions({ ranking: r.value })}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="opt-label">Wind</label>
      <WindCard
        forecast={wind.forecast}
        error={wind.error}
        onRecommend={(deg) => st().setLoopOptions({ direction: deg })}
        start={loopStart}
      />

      {progress ? (
        <div className="loop-progress">
          <div className="progress">
            <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <div className="loop-progress-row">
            <small>
              Suche Runden … {progress.done}/{progress.total} Richtungen
            </small>
            <button className="mini" onClick={cancel}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button className="primary wide-btn" disabled={!loopStart} onClick={generate}>
          {suggestions.length ? 'Neu suchen' : shape === 'outback' ? 'Touren vorschlagen' : 'Rundtouren vorschlagen'}
        </button>
      )}
      {error && <div className="error">{error}</div>}
      {stale && suggestions.length > 0 && !progress && (
        <p className="small warn-text">
          Profil oder Sperren wurden geändert – die Vorschläge sind noch mit den alten Einstellungen berechnet. „Neu
          suchen“ berücksichtigt die neuen; beim Übernehmen rechnet Veloterra die Strecke sonst mit deinem Profil neu.
        </p>
      )}

      {rated.length > 0 && (
        <ul className="suggestions">
          {rated.map((s) => (
            <li
              key={s.id}
              className={`${active === s.id ? 'on' : ''} ${maxAscend > 0 && s.stats.ascend > maxAscend ? 'over' : ''}`}
              onMouseEnter={() => st().setActiveSuggestion(s.id)}
              onClick={() => {
                st().setActiveSuggestion(s.id);
                onFit(s.id);
              }}
            >
              <span className="swatch" style={{ background: s.color }} />
              <div className="sugg-main">
                <div className="sugg-head">
                  <b>{formatKm(s.stats.length)}</b>
                  <span title={`Ø ${Math.round(ascendPerKm(s.stats))} hm je km`}>{Math.round(s.stats.ascend)} hm</span>
                  <span>
                    {formatDuration(
                      pace ? estimateTime(cumulativeDistances(s.leg.coords), s.leg.ele, pace) : s.leg.time,
                    )}
                  </span>
                  <ScoreBadge score={s.stats.score} />
                </div>
                <div className="sugg-tags">
                  {offroad ? (
                    <span>{Math.round(s.stats.unpaved * 100)}% Schotter & Trail</span>
                  ) : (
                    <span>{Math.round(s.stats.paved * 100)}% Asphalt</span>
                  )}
                  {maxAscend > 0 && s.stats.ascend > maxAscend && (
                    <span className="warn">+{Math.round(s.stats.ascend - maxAscend)} hm über Limit</span>
                  )}
                  <span>
                    {s.parts ? 'Wendepunkt' : 'Richtung'} {DIRECTIONS[Math.round(s.direction / 45) % 8].label}
                    {s.parts && ` · km ${Math.round(s.parts[0].length / 1000)}`}
                  </span>
                  {s.parts && <span>{s.sameWay ? 'gleicher Rückweg' : 'anderer Rückweg'}</span>}
                  {s.stats.overlap > 0.08 && <span className="warn">{Math.round(s.stats.overlap * 100)}% doppelt</span>}
                  {s.stats.novelty !== undefined && (
                    <span className={s.stats.novelty >= 0.5 ? 'good-tag' : ''}>
                      {Math.round(s.stats.novelty * 100)} % neu
                    </span>
                  )}
                  {s.stats.windGain !== undefined && s.stats.windGain > 3 && (
                    <span className="good-tag">Rückenwind heim</span>
                  )}
                  {s.stats.windGain !== undefined && s.stats.windGain < -3 && (
                    <span className="warn">Gegenwind heim</span>
                  )}
                </div>
              </div>
              <button
                className="primary mini"
                onClick={(e) => {
                  e.stopPropagation();
                  apply(s);
                }}
              >
                Übernehmen
              </button>
            </li>
          ))}
        </ul>
      )}
      {rated.length > 0 && !progress && maxAscend > 0 && rated.every((s) => s.stats.ascend > maxAscend) && (
        <p className="small warn-text">
          Keine Runde bleibt unter {maxAscend} hm. Limit erhöhen, kürzer planen oder eine andere Richtung probieren.
        </p>
      )}
      {rated.length > 0 && !progress && (
        <p className="muted small">
          Nach dem Übernehmen kannst du die Runde wie gewohnt bearbeiten – Abschnitte umfahren, anders planen, Wegpunkte
          verschieben.
        </p>
      )}
    </section>
  );
}
