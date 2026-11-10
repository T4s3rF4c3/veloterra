/**
 * Sonnenauf- und -untergang für einen Ort und Tag – lokal berechnet (nach
 * den Formeln der NOAA/SunCalc, auf etwa eine Minute genau), ohne Netz.
 */
const RAD = Math.PI / 180;
const DAY = 86400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397;

const toDays = (ms: number) => ms / DAY - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY;

export interface SunTimes {
  /** Unix-Zeit in ms; null in Polarnacht/-tag */
  sunrise: number | null;
  sunset: number | null;
  /** Ende der bürgerlichen Dämmerung (Sonne 6° unter dem Horizont) – danach ist es dunkel */
  dusk: number | null;
  dawn: number | null;
}

/**
 * @param date beliebiger Zeitpunkt am gewünschten Tag (am besten Mittag Ortszeit)
 */
export function sunTimes(date: number, lat: number, lng: number): SunTimes {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(E));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

  const at = (h: number): [number | null, number | null] => {
    const cosW = (Math.sin(RAD * h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1 || cosW > 1) return [null, null];
    const w = Math.acos(cosW);
    const set = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    return [fromJulian(noon - (set - noon)), fromJulian(set)];
  };
  const [sunrise, sunset] = at(-0.833);
  const [dawn, dusk] = at(-6);
  return { sunrise, sunset, dawn, dusk };
}
