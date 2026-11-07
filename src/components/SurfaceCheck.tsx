import { useEffect, useState } from 'react';
import { avoidRange } from '../actions';
import { photosAlong, type Photo } from '../api/photos';
import { formatKm, pointAtDistance, sliceLine, type LngLat } from '../domain/geo';
import type { CombinedRoute } from '../domain/route';
import { uncertaintyText, type UncertainSection } from '../domain/surfaceCheck';
import { useStore } from '../store';

const KIND_CLASS: Record<UncertainSection['kind'], string> = { missing: 'bad', unclear: 'bad', guessed: 'ok' };
const KIND_LABEL: Record<UncertainSection['kind'], string> = {
  missing: 'unbekannt',
  unclear: 'unklar',
  guessed: 'geschätzt',
};

/** Ein Foto vom Abschnitt (Panoramax/Mapillary), falls vorhanden. */
function SectionPhoto({ line }: { line: LngLat[] }) {
  const token = useStore((s) => s.mapillaryToken);
  const [photo, setPhoto] = useState<Photo | null | undefined>(undefined);
  const key = `${line[0]}|${line[line.length - 1]}`;
  useEffect(() => {
    const ctrl = new AbortController();
    setPhoto(undefined);
    photosAlong(line, { max: 3, mapillaryToken: token || undefined, signal: ctrl.signal })
      .then((p) => !ctrl.signal.aborted && setPhoto(p[Math.floor(p.length / 2)] ?? null))
      .catch(() => !ctrl.signal.aborted && setPhoto(null));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token]);
  if (photo === undefined) return <p className="muted small">Suche Foto …</p>;
  if (!photo) return <p className="muted small">Kein Straßenfoto vorhanden – Luftbild auf der Karte prüfen.</p>;
  return (
    <a className="check-photo" href={photo.link} target="_blank" rel="noreferrer" title="Foto beim Anbieter öffnen">
      <img src={photo.full} alt="Straßenfoto des Abschnitts" />
      <small>
        {photo.source === 'mapillary' ? 'Mapillary' : 'Panoramax'}
        {photo.date && ` · ${new Date(photo.date).toLocaleDateString('de-DE')}`}
      </small>
    </a>
  );
}

/**
 * Belags-Check: Abschnitte, deren Belag in OSM fehlt oder nur geschätzt ist.
 * Ein Klick zeigt die Stelle im Luftbild (Route ausgeblendet) mit Foto.
 */
export function SurfaceCheck({
  route,
  sections,
  fit,
}: {
  route: CombinedRoute;
  sections: UncertainSection[];
  fit: (c: LngLat[], maxZoom?: number) => void;
}) {
  const checked = useStore((s) => s.checkedSurfaces);
  const active = useStore((s) => s.activeCheck);
  const st = useStore.getState;
  const open = sections.filter((s) => !checked.includes(s.id));
  const done = sections.length - open.length;
  const total = open.reduce((a, s) => a + s.end - s.start, 0);

  const close = () => {
    st().setActiveCheck(null);
    st().setSelection(null);
    st().setHideRoute(false);
  };

  const show = (s: UncertainSection) => {
    if (active === s.id) return close();
    const b = st().basemap;
    if (b !== 'satellite' && b !== 'aerial') st().setBasemap('aerial');
    st().setActiveCheck(s.id);
    st().setSelection({ start: s.start, end: s.end });
    st().setHideRoute(true);
    fit(sliceLine(route.coords, route.dist, s.start, s.end), 17);
  };

  const next = (s: UncertainSection) => {
    const rest = open.filter((x) => x.id !== s.id);
    const after = rest.find((x) => x.start > s.start) ?? rest[0];
    if (after) show(after);
    else close();
  };

  if (!sections.length) return null;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Belags-Check</h2>
        {done > 0 && (
          <button className="mini ghost" onClick={() => st().resetCheckedSurfaces()} title="Bestätigungen zurücksetzen">
            {done} geprüft ↺
          </button>
        )}
      </div>
      {open.length === 0 ? (
        <p className="muted small">Alle unsicheren Abschnitte geprüft ✓</p>
      ) : (
        <p className="muted small">
          {open.length} {open.length === 1 ? 'Abschnitt' : 'Abschnitte'} ({formatKm(total)}) mit unbekanntem oder nur
          geschätztem Belag – auf der Karte gepunktet. Anklicken zum Prüfen im Luftbild.
        </p>
      )}
      <ul className="list checks">
        {open.map((s) => {
          const mid = pointAtDistance(route.coords, route.dist, (s.start + s.end) / 2);
          const on = active === s.id;
          return (
            <li key={s.id} className={on ? 'on' : ''}>
              <button className="check-main" onClick={() => show(s)}>
                <span className="km">km {(s.start / 1000).toFixed(1).replace('.', ',')}</span>
                <span className="check-text">
                  <b>
                    {formatKm(s.end - s.start)} · {s.wayLabel}
                  </b>
                  <small>
                    {uncertaintyText(s)}
                    {s.detail && ` · ${s.detail}`}
                  </small>
                </span>
                <span className={`score ${KIND_CLASS[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
              </button>
              {on && (
                <div className="check-detail">
                  <SectionPhoto line={sliceLine(route.coords, route.dist, s.start, s.end)} />
                  <div className="check-actions">
                    <button
                      className="primary"
                      onClick={() => {
                        st().markSurfaceOk(s.id);
                        next(s);
                      }}
                      title="Belag ist in Ordnung – nicht mehr anzeigen"
                    >
                      ✓ Passt
                    </button>
                    <button
                      onClick={() => {
                        avoidRange(route, s.start, s.end);
                        close();
                      }}
                      title="Abschnitt umfahren – die Etappe wird neu berechnet"
                    >
                      ⤳ Umgehen
                    </button>
                    <button className="ghost" onClick={() => next(s)} title="Zum nächsten Abschnitt">
                      Weiter →
                    </button>
                  </div>
                  <div className="poi-links">
                    <a
                      href={`https://www.openstreetmap.org/edit?editor=id#map=19/${mid[1].toFixed(6)}/${mid[0].toFixed(6)}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Belag (surface) im OpenStreetMap-Editor eintragen – hilft allen Routenplanern"
                    >
                      In OpenStreetMap eintragen ↗
                    </a>
                    <span className="muted small">Taste H: Route ein-/ausblenden</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
