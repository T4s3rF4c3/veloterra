import { useEffect, useState } from 'react';
import type { LngLat } from '../domain/geo';
import type { CombinedRoute } from '../domain/route';
import { fetchWeatherAlong, weatherSamples, type WeatherPoint } from '../domain/weather';
import { fetchWind, type WindForecast } from '../domain/wind';

/** Windvorhersage für einen Punkt (gerundet, gecacht). */
export function useWind(point: LngLat | null) {
  const [forecast, setForecast] = useState<WindForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = point ? `${point[0].toFixed(2)},${point[1].toFixed(2)}` : '';

  useEffect(() => {
    if (!point) {
      setForecast(null);
      return;
    }
    let alive = true;
    setError(null);
    fetchWind(point)
      .then((f) => alive && setForecast(f))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { forecast, error };
}

/** Abfahrtszeit: gewählt oder jetzt (auf volle Stunde gerundet). */
export function departureTime(departure: number | null): number {
  if (departure !== null) return departure;
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/** Wetter entlang der Route zur jeweiligen Ankunftszeit (Open-Meteo, gecacht). */
export function useRouteWeather(route: CombinedRoute | null, departure: number) {
  const [points, setPoints] = useState<WeatherPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const samples = route ? weatherSamples(route.coords, route.dist, departure, route.time) : [];
  const key = samples
    .map((s) => `${s.coord[0].toFixed(2)},${s.coord[1].toFixed(2)},${Math.round(s.time / 3600_000)}`)
    .join('|');

  useEffect(() => {
    if (!samples.length) {
      setPoints(null);
      return;
    }
    let alive = true;
    setError(null);
    fetchWeatherAlong(samples)
      .then((p) => alive && setPoints(p))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { points, error };
}
