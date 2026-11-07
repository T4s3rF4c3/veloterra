import { useRef, useState } from 'react';
import { searchPois } from '../api/poiSearch';
import { bearing, destination, formatKm, type LngLat } from '../domain/geo';
import { DESTINATION_CATEGORIES, radiusQuery, rankDestinations, type DestinationSort, type Poi } from '../domain/poi';
import { compassLabel } from '../domain/wind';
import { useStore } from '../store';

/** höchstens so viele Ziele anzeigen (Karte bleibt übersichtlich) */
const MAX = 60;

const SORTS: { value: DestinationSort; label: string }[] = [
  { value: 'interest', label: 'Sehenswert' },
  { value: 'near', label: 'Nah' },
  { value: 'far', label: 'Weit' },
];

/** Ziele für eine Ausfahrt vorschlagen: Aussichtspunkte, Gipfel, Seen, Burgen, Cafés … */
export function ExplorePanel({ fly, fit }: { fly: (c: LngLat, z?: number) => void; fit: (c: LngLat[]) => void }) {
  const start = useStore((s) => s.loopStart);
  const options = useStore((s) => s.exploreOptions);
  const destinations = useStore((s) => s.destinations);
  const active = useStore((s) => s.activePoi);
  const st = useStore.getState;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [partial, setPartial] = useState(false);
  /** alle Treffer der letzten Suche – Sortieren braucht keine neue Abfrage */
  const raw = useRef<{ pois: Poi[]; radius: number } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const sort: DestinationSort = options.sort ?? 'interest';

  const show = (pois: Poi[], radius: number, s: DestinationSort, fitMap: boolean) => {
    if (!start) return;
    raw.current = { pois, radius };
    const ranked = rankDestinations(pois, start, radius, s).slice(0, MAX);
    st().setDestinations(ranked);
    if (fitMap && ranked.length) fit([start, ...ranked.map((p) => p.coord)]);
  };

  const search = async () => {
    if (!start) return;
    ctrl.current?.abort();
    const abort = new AbortController();
    ctrl.current = abort;
    setLoading(true);
    setError(null);
    setPartial(false);
    st().setActivePoi(null);
    st().setDestinations([]);
    const cats = DESTINATION_CATEGORIES.filter((c) => options.categories.includes(c.key));
    const d = options.distance;
    try {
      // Ersatzsuche: Mitte plus 6 Punkte auf halbem Radius decken den Umkreis ab
      const ring = [
        { p: start, radiusKm: (d * 0.5) / 1000 },
        ...Array.from({ length: 6 }, (_, k) => ({
          p: destination(start, k * 60, d * 0.6),
          radiusKm: (d * 0.5) / 1000,
        })),
      ];
      const res = await searchPois({
        overpassQuery: radiusQuery(start, d, cats),
        cats,
        photonPoints: ring,
        signal: abort.signal,
        onPartial: (r) => {
          show(r.pois, d, sort, true);
          setPartial(true);
        },
      });
      if (abort.signal.aborted) return;
      show(res.pois, d, sort, res.source === 'osm' || !useStore.getState().destinations.length);
      setPartial(res.source === 'photon');
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) {
        setLoading(false);
        setSearched(true);
      }
    }
  };

  const toggle = (key: string) => {
    const c = options.categories;
    st().setExploreOptions({ categories: c.includes(key) ? c.filter((x) => x !== key) : [...c, key] });
  };

  return (
    <section className="card loop">
      <div className={`loop-start ${start ? 'set' : ''}`}>
        <span className="pin">S</span>
        {start ? (
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
        Umkreis (Luftlinie) <b className="val">bis {Math.round(options.distance / 1000)} km</b>
      </label>
      <input
        type="range"
        className="range"
        min={5}
        max={80}
        step={5}
        value={options.distance / 1000}
        onChange={(e) => st().setExploreOptions({ distance: Number(e.target.value) * 1000 })}
      />
      <div className="range-scale">
        <span>5</span>
        <span>20</span>
        <span>40</span>
        <span>60</span>
        <span>80 km</span>
      </div>
      <p className="muted small">
        Runde zum entferntesten Ziel ca. {Math.round((options.distance / 1000) * 2.4)} km – nähere Ziele entsprechend
        kürzer.
      </p>

      <label className="opt-label">Was für Ziele?</label>
      <div className="chips">
        {DESTINATION_CATEGORIES.map((c) => (
          <button key={c.key} className={options.categories.includes(c.key) ? 'on' : ''} onClick={() => toggle(c.key)}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <button className="primary wide-btn" disabled={!start || loading || !options.categories.length} onClick={search}>
        {loading ? 'Suche Ziele …' : destinations.length ? 'Neu suchen' : 'Ziele vorschlagen'}
      </button>
      {loading && !partial && (
        <p className="muted small">Fragt OpenStreetMap ab – das kann bis zu 30 Sekunden dauern.</p>
      )}
      {partial && (
        <p className="muted small">
          {loading
            ? 'Erste Vorschläge – vollständige OpenStreetMap-Daten folgen …'
            : 'OpenStreetMap-Server ausgelastet: Vorschläge aus der Photon-Suche (ohne Höhen & Details).'}
        </p>
      )}
      {error && <div className="error">{error}</div>}
      {searched && !loading && !error && destinations.length === 0 && (
        <p className="muted small">
          Keine passenden Ziele gefunden – größeren Umkreis oder andere Kategorien probieren.
        </p>
      )}

      {destinations.length > 0 && start && (
        <div className="dest-head">
          <small className="muted">
            {raw.current && raw.current.pois.length > destinations.length
              ? `${destinations.length} von ${rankDestinations(raw.current.pois, start, raw.current.radius).length} Zielen`
              : `${destinations.length} Ziele`}
          </small>
          <div className="choice">
            {SORTS.map((o) => (
              <button
                key={o.value}
                className={sort === o.value ? 'on' : ''}
                onClick={() => {
                  st().setExploreOptions({ sort: o.value });
                  if (raw.current) show(raw.current.pois, raw.current.radius, o.value, false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {destinations.length > 0 && start && (
        <ul className="suggestions">
          {destinations.map((p) => (
            <li
              key={p.id}
              className={active === p.id ? 'on' : ''}
              onMouseEnter={() => st().setActivePoi(p.id)}
              onClick={() => {
                st().setActivePoi(p.id);
                fly(p.coord, 13);
              }}
            >
              <span className="poi-icon small">{p.icon}</span>
              <div className="sugg-main">
                <div className="sugg-head">
                  <b className="poi-name">{p.name}</b>
                </div>
                <div className="sugg-tags">
                  <span>{formatKm(p.offset)}</span>
                  <span>Richtung {compassLabel(bearing(start, p.coord))}</span>
                  {p.tags.ele && <span>{Math.round(Number(p.tags.ele))} m</span>}
                  {(p.tags.wikipedia || p.tags.wikidata) && <span>bekannt</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {destinations.length > 0 && (
        <p className="muted small">
          Ziel anklicken → „Runde über dieses Ziel“ plant hin und auf anderem Weg zurück. Danach wie gewohnt bearbeiten.
        </p>
      )}
    </section>
  );
}
