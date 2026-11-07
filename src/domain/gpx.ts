import { formatKm } from './geo';
import type { CombinedRoute } from './route';
import { turnPoints, type TurnPoint } from './turns';

const esc = (s: string) => s.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** GPX-Symbolnamen, die Garmin/Wahoo/Locus als Abbiege-Symbol kennen */
const GPX_SYM: Record<TurnPoint['kind'], string> = {
  left: 'Left',
  right: 'Right',
  straight: 'Straight',
  'slight-left': 'Slight Left',
  'slight-right': 'Slight Right',
  'sharp-left': 'Sharp Left',
  'sharp-right': 'Sharp Right',
  uturn: 'U-Turn',
};

/** TCX CoursePoint PointType */
const TCX_TYPE: Record<TurnPoint['kind'], string> = {
  left: 'Left',
  right: 'Right',
  straight: 'Straight',
  'slight-left': 'Left',
  'slight-right': 'Right',
  'sharp-left': 'Left',
  'sharp-right': 'Right',
  uturn: 'Generic',
};

export function toGpx(route: CombinedRoute, name: string, withTurns = true): string {
  const pts = route.coords
    .map(
      (c, i) =>
        `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}"><ele>${route.ele[i].toFixed(1)}</ele></trkpt>`,
    )
    .join('\n');
  const wpts = withTurns
    ? turnPoints(route)
        .map(
          (t) =>
            `  <wpt lat="${t.coord[1].toFixed(6)}" lon="${t.coord[0].toFixed(6)}"><name>${esc(t.text)}</name>` +
            `<desc>${esc(`${t.text} bei ${formatKm(t.distance)}`)}</desc><sym>${GPX_SYM[t.kind]}</sym>` +
            `<type>${GPX_SYM[t.kind]}</type></wpt>`,
        )
        .join('\n')
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Veloterra" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name></metadata>
${wpts}
  <trk>
    <name>${esc(name)}</name>
    <type>cycling</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/**
 * TCX-Kurs mit CoursePoints – Garmin-Geräte zeigen diese als Abbiegehinweise
 * an, auch ohne eigene Neuberechnung.
 */
export function toTcx(route: CombinedRoute, name: string): string {
  const total = route.dist[route.dist.length - 1] || 1;
  // Zeitachse aus der geschätzten Fahrzeit, damit Geräte Zeit/Tempo anzeigen
  const t0 = Date.UTC(2020, 0, 1, 8);
  const timeAt = (d: number) => new Date(t0 + (route.time * 1000 * d) / total).toISOString();
  const short = esc(name.slice(0, 15));
  const pts = route.coords
    .map(
      (c, i) =>
        `        <Trackpoint><Time>${timeAt(route.dist[i])}</Time><Position><LatitudeDegrees>${c[1].toFixed(6)}</LatitudeDegrees>` +
        `<LongitudeDegrees>${c[0].toFixed(6)}</LongitudeDegrees></Position><AltitudeMeters>${route.ele[i].toFixed(1)}</AltitudeMeters>` +
        `<DistanceMeters>${route.dist[i].toFixed(1)}</DistanceMeters></Trackpoint>`,
    )
    .join('\n');
  const cps = turnPoints(route)
    .map(
      (t) =>
        `      <CoursePoint><Name>${esc(t.short)}</Name><Time>${timeAt(t.distance)}</Time>` +
        `<Position><LatitudeDegrees>${t.coord[1].toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${t.coord[0].toFixed(6)}</LongitudeDegrees></Position>` +
        `<PointType>${TCX_TYPE[t.kind]}</PointType><Notes>${esc(t.text)}</Notes></CoursePoint>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Courses>
    <Course>
      <Name>${short}</Name>
      <Lap>
        <TotalTimeSeconds>${Math.round(route.time)}</TotalTimeSeconds>
        <DistanceMeters>${total.toFixed(1)}</DistanceMeters>
        <Intensity>Active</Intensity>
      </Lap>
      <Track>
${pts}
      </Track>
${cps}
    </Course>
  </Courses>
</TrainingCenterDatabase>
`;
}

export function fileName(name: string, ext: string) {
  return `${name.replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'route'}.${ext}`;
}

export function downloadText(text: string, name: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadRoute(route: CombinedRoute, name: string, format: 'gpx' | 'gpx-plain' | 'tcx') {
  if (format === 'tcx') downloadText(toTcx(route, name), fileName(name, 'tcx'), 'application/vnd.garmin.tcx+xml');
  else downloadText(toGpx(route, name, format === 'gpx'), fileName(name, 'gpx'), 'application/gpx+xml');
}

/** Liest Track- oder Routenpunkte aus einer GPX-Datei. */
export function parseGpx(text: string): { name: string; coords: [number, number][]; ele: number[] } {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Die Datei ist keine gültige GPX-Datei.');
  let pts = Array.from(doc.getElementsByTagName('trkpt'));
  if (pts.length < 2) pts = Array.from(doc.getElementsByTagName('rtept'));
  if (pts.length < 2) throw new Error('In der GPX-Datei wurde kein Track gefunden.');
  const coords: [number, number][] = [];
  const ele: number[] = [];
  for (const p of pts) {
    const lat = Number(p.getAttribute('lat'));
    const lon = Number(p.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    coords.push([lon, lat]);
    ele.push(Number(p.getElementsByTagName('ele')[0]?.textContent ?? 0));
  }
  const name =
    doc.querySelector('trk > name')?.textContent?.trim() ||
    doc.querySelector('metadata > name')?.textContent?.trim() ||
    'Importierte Route';
  return { name, coords, ele };
}
