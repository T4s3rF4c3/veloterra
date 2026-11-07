import { compassLabel, windAt, type WindForecast, type WindSummary } from '../domain/wind';
import { departureTime } from '../hooks/useWind';
import { useStore } from '../store';

/** datetime-local erwartet lokale Zeit ohne Zeitzone */
function toLocalInput(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Pfeil zeigt, wohin der Wind weht (also von „from“ weg). */
export function WindArrow({ from, size = 18 }: { from: number; size?: number }) {
  return (
    <span className="wind-arrow" style={{ transform: `rotate(${from + 180}deg)`, fontSize: size }} aria-hidden>
      ↑
    </span>
  );
}

interface Props {
  forecast: WindForecast | null;
  error: string | null;
  summary?: WindSummary | null;
  /** Rundtour: Richtung „gegen den Wind starten“ anbieten */
  onRecommend?: (deg: number) => void;
}

export function WindCard({ forecast, error, summary, onRecommend }: Props) {
  const departure = useStore((s) => s.departure);
  const t = departureTime(departure);
  const w = forecast ? windAt(forecast, t) : null;
  const now = Date.now();
  const last = forecast?.hours[forecast.hours.length - 1]?.time ?? now;

  return (
    <div className="wind">
      <div className="wind-head">
        <label className="opt-label">Abfahrt</label>
        <input
          type="datetime-local"
          value={toLocalInput(t)}
          min={toLocalInput(now - 3600_000)}
          max={toLocalInput(last)}
          step={3600}
          onChange={(e) => {
            const v = Date.parse(e.target.value);
            useStore.getState().setDeparture(Number.isFinite(v) ? v : null);
          }}
        />
        {departure !== null && (
          <button
            className="mini ghost"
            onClick={() => useStore.getState().setDeparture(null)}
            title="Auf jetzt setzen"
          >
            Jetzt
          </button>
        )}
      </div>
      {error && <p className="muted small">{error}</p>}
      {!error && !forecast && <p className="muted small">Windvorhersage wird geladen …</p>}
      {forecast && !w && <p className="muted small">Für diesen Zeitpunkt gibt es noch keine Vorhersage.</p>}
      {w && (
        <div className="wind-now">
          <WindArrow from={w.from} />
          <span>
            <b>{Math.round(w.speed)} km/h</b> aus {compassLabel(w.from)}
            <small>Böen bis {Math.round(w.gust)} km/h</small>
          </span>
          {onRecommend && w.speed >= 8 && (
            <button
              className="mini"
              onClick={() => onRecommend((Math.round(w.from / 45) * 45) % 360)}
              title="Runde in die Richtung legen, aus der der Wind kommt – heimwärts Rückenwind"
            >
              Gegen den Wind starten
            </button>
          )}
        </div>
      )}
      {summary && w && w.speed >= 3 && (
        <div className="wind-bar" title="Anteil der Strecke mit Gegen-, Seiten- und Rückenwind">
          <span className="head" style={{ width: `${summary.head * 100}%` }} />
          <span className="cross" style={{ width: `${summary.cross * 100}%` }} />
          <span className="tail" style={{ width: `${summary.tail * 100}%` }} />
        </div>
      )}
      {summary && w && w.speed >= 3 && (
        <p className="muted small">
          {Math.round(summary.head * 100)} % Gegenwind · {Math.round(summary.tail * 100)} % Rückenwind
          {summary.secondHalf < summary.firstHalf - 3
            ? ' · heimwärts Rückenwind 👍'
            : summary.secondHalf > summary.firstHalf + 3
              ? ' · heimwärts Gegenwind – Route umkehren?'
              : ''}
        </p>
      )}
    </div>
  );
}
