import type { LngLat } from '../domain/geo';
import { sunTimes } from '../domain/sun';
import { weatherInfo, type WeatherPoint } from '../domain/weather';
import { compassLabel, windAt, type WindForecast, type WindSummary } from '../domain/wind';
import { departureTime } from '../hooks/useWind';
import { useStore } from '../store';
import { Icon } from './Icon';

/** datetime-local erwartet lokale Zeit ohne Zeitzone */
function toLocalInput(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Pfeil zeigt, wohin der Wind weht (also von „from“ weg). */
export function WindArrow({ from, size = 18 }: { from: number; size?: number }) {
  return (
    <span className="wind-arrow" style={{ transform: `rotate(${from + 180}deg)` }} aria-hidden>
      <Icon name="arrow-up" size={size} />
    </span>
  );
}

interface Props {
  forecast: WindForecast | null;
  error: string | null;
  summary?: WindSummary | null;
  /** Rundtour: Richtung „gegen den Wind starten“ anbieten */
  onRecommend?: (deg: number) => void;
  /** Startpunkt (für Sonnenauf- und -untergang) */
  start?: LngLat | null;
  /** Fahrzeit in Sekunden – für den Hinweis „Ankunft nach Sonnenuntergang“ */
  duration?: number;
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const mins = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h` : `${m} min`;
};

/** Sonnenauf- und -untergang am Abfahrtstag, mit Hinweis auf Fahrt im Dunkeln */
function SunLine({ start, departure, duration }: { start: LngLat; departure: number; duration?: number }) {
  const noon = new Date(departure);
  noon.setHours(12, 0, 0, 0);
  const sun = sunTimes(noon.getTime(), start[1], start[0]);
  if (!sun.sunrise || !sun.sunset) return null;
  const arrival = duration ? departure + duration * 1000 : null;
  let note: string | null = null;
  let dark = false;
  if (departure < sun.sunrise) {
    note = `Start ${mins(sun.sunrise - departure)} vor Sonnenaufgang – Licht mitnehmen`;
    dark = !!sun.dawn && departure < sun.dawn;
  } else if (departure > sun.sunset) {
    note = 'Start nach Sonnenuntergang – Licht mitnehmen';
    dark = true;
  } else if (arrival && arrival > sun.sunset) {
    note = `Ankunft ca. ${hhmm(arrival)} – ${mins(arrival - sun.sunset)} nach Sonnenuntergang${
      sun.dusk && arrival > sun.dusk ? ', dann schon dunkel' : ''
    }. Licht mitnehmen`;
    dark = !!sun.dusk && arrival > sun.dusk;
  } else if (arrival && sun.sunset - arrival < 45 * 60_000) {
    note = `Ankunft ca. ${hhmm(arrival)} – knapp vor Sonnenuntergang`;
  }
  return (
    <div className="sun">
      <div className="sun-times">
        <span title="Sonnenaufgang">
          <Icon name="sunrise" size={16} /> {hhmm(sun.sunrise)}
        </span>
        <span title="Sonnenuntergang">
          <Icon name="sunset" size={16} /> {hhmm(sun.sunset)}
        </span>
        {sun.dusk && <small title="Ende der bürgerlichen Dämmerung">dunkel ab {hhmm(sun.dusk)}</small>}
      </div>
      {note && <p className={`sun-note ${dark ? 'dark' : ''}`}>{note}</p>}
    </div>
  );
}

export function WindCard({ forecast, error, summary, onRecommend, start, duration }: Props) {
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
      {start && <SunLine start={start} departure={t} duration={duration} />}
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

const clock = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Wetter entlang der Route: je Stelle Ankunftszeit, Lage, Temperatur und Regen. */
export function WeatherAlong({ points, error }: { points: WeatherPoint[] | null; error: string | null }) {
  if (error) return <p className="muted small">{error}</p>;
  if (!points) return <p className="muted small">Wetter entlang der Route wird geladen …</p>;
  return (
    <div className="weather">
      <div className="cap">Unterwegs</div>
      <ol className="weather-list">
        {points.map((p, i) => {
          const info = weatherInfo(p.code);
          return (
            <li key={i} className={p.rainProb >= 50 ? 'wet' : undefined}>
              <span className="weather-at">
                <b>km {Math.round(p.distance / 1000)}</b>
                <small>{clock(p.time)}</small>
              </span>
              <span className="weather-sky" title={info.label}>
                <Icon name={info.icon} size={20} />
                <small>{info.label}</small>
              </span>
              <b className="weather-temp">{Math.round(p.temp)}°</b>
              <span className="weather-rain" title="Regenwahrscheinlichkeit">
                <Icon name="droplet" size={13} />
                {Math.round(p.rainProb)} %{p.rain >= 0.1 && <small>{p.rain.toFixed(1).replace('.', ',')} mm</small>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="muted small">Vorhersage zur voraussichtlichen Ankunftszeit · Open-Meteo</p>
    </div>
  );
}
