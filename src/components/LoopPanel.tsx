import { useEffect, useMemo } from 'react';
import { cumulativeDistances, formatDuration, formatKm } from '../domain/geo';
import {
  DIRECTIONS,
  SUGGESTION_COLORS,
  rateRoundTrip,
  sortSuggestions,
  type Direction,
  type Ranking,
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
  const heat = useHeat((s) => s.index);
  // bei Gravel/MTB interessiert der Anteil unbefestigt, sonst der Asphalt
  const offroad = settings.bike === 'gravel' || settings.bike === 'mtb';
  const departure = departureTime(useStore((s) => s.departure));
  const st = useStore.getState;
  const { generate, cancel, apply, progress, error } = useRoundTrip();

  // Farben bleiben an der Reihenfolge des Eintreffens, Sortierung nur in der Liste
  const rated = useMemo(
    () =>
      sortSuggestions(
        suggestions.map((s, i) => {
          const stats = rateRoundTrip(s.leg, settings, options.distance);
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
      ),
    [suggestions, settings, options.distance, options.ranking, wind.forecast, departure, heat],
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

      <label className="opt-label">
        Länge <b className="val">{Math.round(options.distance / 1000)} km</b>
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
          {suggestions.length ? 'Neu suchen' : 'Rundtouren vorschlagen'}
        </button>
      )}
      {error && <div className="error">{error}</div>}

      {rated.length > 0 && (
        <ul className="suggestions">
          {rated.map((s) => (
            <li
              key={s.id}
              className={active === s.id ? 'on' : ''}
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
                  <span>{Math.round(s.stats.ascend)} hm</span>
                  <span>{formatDuration(s.leg.time)}</span>
                  <ScoreBadge score={s.stats.score} />
                </div>
                <div className="sugg-tags">
                  {offroad ? (
                    <span>{Math.round(s.stats.unpaved * 100)}% Schotter & Trail</span>
                  ) : (
                    <span>{Math.round(s.stats.paved * 100)}% Asphalt</span>
                  )}
                  <span>Richtung {DIRECTIONS[Math.round(s.direction / 45) % 8].label}</span>
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
      {rated.length > 0 && !progress && (
        <p className="muted small">
          Nach dem Übernehmen kannst du die Runde wie gewohnt bearbeiten – Abschnitte umgehen, anders planen, Wegpunkte
          verschieben.
        </p>
      )}
    </section>
  );
}
