import { Panel } from './Panel';
import { useEffect, useState } from 'react';
import { avoidRange } from '../actions';
import { photosAlong, type Photo } from '../api/photos';
import { formatKm, pointAtDistance, sliceLine, type LngLat } from '../domain/geo';
import type { CombinedRoute } from '../domain/route';
import { uncertaintyText, type UncertainSection } from '../domain/surfaceCheck';
import { useStore } from '../store';
import { Icon } from './Icon';
import { useSite } from '../api/site';

const KIND_CLASS: Record<UncertainSection['kind'], string> = { missing: 'bad', unclear: 'bad', guessed: 'ok' };
const KIND_LABEL: Record<UncertainSection['kind'], string> = {
  missing: 'unbekannt',
  unclear: 'unklar',
  guessed: 'geschätzt',
};

/** Ein Foto vom Abschnitt (Panoramax/Mapillary), falls vorhanden. */
function SectionPhoto({ line }: { line: LngLat[] }) {
  const siteToken = useSite((s) => s.config.mapillaryToken);
  const token = useStore((s) => s.mapillaryToken) || siteToken;
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

/** Etwas Route davor und danach mit ins Bild nehmen (Meter) */
const CONTEXT_M = 250;

/**
 * Prüfen eines Abschnitts: Luftbild, hinzoomen, Abschnitt auf der Karte gelb
 * hervorheben. Die Route bleibt sichtbar, damit klar ist, welcher Teil gemeint ist.
 */
function useCheck(route: CombinedRoute, fit: (c: LngLat[], maxZoom?: number) => void) {
  const active = useStore((s) => s.activeCheck);
  const st = useStore.getState;
  const close = () => {
    st().setActiveCheck(null);
    st().setSelection(null);
  };
  const show = (s: UncertainSection) => {
    if (active === s.id) return close();
    const b = st().basemap;
    if (b !== 'satellite' && b !== 'aerial') st().setBasemap('aerial');
    st().setActiveCheck(s.id);
    st().setSelection({ start: s.start, end: s.end });
    const total = route.dist[route.dist.length - 1];
    fit(sliceLine(route.coords, route.dist, Math.max(0, s.start - CONTEXT_M), Math.min(total, s.end + CONTEXT_M)), 17);
  };
  return { active, close, show };
}

/**
 * Belags-Check: Abschnitte, deren Belag in OSM fehlt oder nur geschätzt ist.
 * Ein Klick zeigt die Stelle im Luftbild – gelb hervorgehoben auf der Route – mit Foto.
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
  const st = useStore.getState;
  const { active, close, show } = useCheck(route, fit);
  const open = sections.filter((s) => !checked.includes(s.id));
  const done = sections.length - open.length;
  const total = open.reduce((a, s) => a + s.end - s.start, 0);

  const next = (s: UncertainSection) => {
    const rest = open.filter((x) => x.id !== s.id);
    const after = rest.find((x) => x.start > s.start) ?? rest[0];
    if (after) show(after);
    else close();
  };

  if (!sections.length) return null;

  return (
    <Panel
      id="surface-check"
      icon="search"
      title="Belags-Check"
      tone={open.length > 0 ? 'warn' : undefined}
      badge={open.length > 0 ? open.length : <Icon name="check" size={12} />}
      summary={open.length ? `${formatKm(total)} mit unsicherem Belag` : 'alles geprüft'}
      actions={
        done > 0 && (
          <button className="mini ghost" onClick={() => st().resetCheckedSurfaces()} title="Bestätigungen zurücksetzen">
            {done} geprüft <Icon name="rotate-ccw" size={13} />
          </button>
        )
      }
    >
      {open.length === 0 ? (
        <p className="muted small">
          <Icon name="check" size={13} /> Alle unsicheren Abschnitte geprüft
        </p>
      ) : (
        <p className="muted small">
          {open.length} {open.length === 1 ? 'Abschnitt' : 'Abschnitte'} ({formatKm(total)}) mit unbekanntem oder nur
          geschätztem Belag – auf der Karte gepunktet. Anklicken zeigt den Abschnitt gelb im Luftbild.
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
                      <Icon name="check" /> Passt
                    </button>
                    <button
                      onClick={() => {
                        avoidRange(route, s.start, s.end);
                        close();
                      }}
                      title="Abschnitt umfahren – die Etappe wird neu berechnet"
                    >
                      <Icon name="detour" /> Umfahren
                    </button>
                    <button className="ghost" onClick={() => next(s)} title="Zum nächsten Abschnitt">
                      Weiter <Icon name="arrow-right" size={14} />
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
                    <span className="muted small">Taste H blendet die Route aus, um die Straße zu sehen</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
