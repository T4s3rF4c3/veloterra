import { useEffect, useRef, useState } from 'react';
import {
  GROUP_LABEL,
  clipToBounds,
  listByArea,
  routeDetails,
  routeLink,
  symbolUrl,
  type NetRoute,
  type NetRouteDetails,
  type NetworkGroup,
  type NetworkKind,
} from '../api/waymarked';
import { formatKm, type LngLat } from '../domain/geo';
import { importTrack } from '../hooks/useImport';
import { useStore } from '../store';
import { Icon } from './Icon';

const GROUPS: NetworkGroup[] = ['INT', 'NAT', 'REG', 'LOC'];
const GROUP_ORDER: Record<NetworkGroup, number> = { INT: 0, NAT: 1, REG: 2, LOC: 3 };

/**
 * Beschilderte Radrouten (bzw. MTB-Routen) im Kartenausschnitt: auf der Karte
 * als Netz, hier als Liste. Eine Route lässt sich ganz oder als sichtbarer
 * Abschnitt als bearbeitbare Route übernehmen.
 */
export function NetworkPanel({
  bounds,
  fit,
}: {
  bounds: () => [number, number, number, number] | null;
  fit: (c: LngLat[], maxZoom?: number) => void;
}) {
  const kind = useStore((s) => s.networkKind);
  const groups = useStore((s) => s.networkGroups);
  const routes = useStore((s) => s.networkRoutes);
  const active = useStore((s) => s.activeNetwork);
  const view = useStore((s) => s.view);
  const bike = useStore((s) => s.settings.bike);
  const st = useStore.getState;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<NetRouteDetails | null>(null);
  const [adopting, setAdopting] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // MTB-Fahrer sehen beim ersten Öffnen gleich die MTB-Routen
  useEffect(() => {
    if (bike === 'mtb' && kind !== 'mtb' && !st().networkRoutes.length) st().setNetworkKind('mtb');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Liste folgt dem Kartenausschnitt
  useEffect(() => {
    const b = bounds();
    if (!b) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await listByArea(kind, b, ctrl.signal);
        // gewählte Route behalten, auch wenn sie aus dem Bild gescrollt ist
        const keep = st().networkRoutes.find((r) => r.id === st().activeNetwork && r.kind === kind);
        const list = keep && !found.some((r) => r.id === keep.id) ? [keep, ...found] : found;
        st().setNetworkRoutes(list);
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, kind]);

  // Details und Verlauf der gewählten Route laden
  useEffect(() => {
    setDetails(null);
    const r = st().networkRoutes.find((x) => x.id === active);
    if (!r) return;
    let alive = true;
    routeDetails(r)
      .then((d) => {
        if (!alive) return;
        setDetails(d);
        st().setActiveNetwork(d.id, d.lines);
      })
      .catch((e: Error) => alive && setError(e.message));
    listRef.current?.querySelector('li.on')?.scrollIntoView({ block: 'nearest' });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const shown = routes
    .filter((r) => groups.includes(r.group))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.name.localeCompare(b.name, 'de'));

  const select = (r: NetRoute) => {
    if (active === r.id) {
      st().setActiveNetwork(null);
      return;
    }
    st().setActiveNetwork(r.id);
  };

  const adopt = async (part: boolean) => {
    if (!details) return;
    const b = bounds();
    const path = part && b ? clipToBounds(details.path, b) : details.path;
    setAdopting(true);
    setError(null);
    try {
      await importTrack(part ? `${details.name} (Abschnitt)` : details.name, path);
      fit(path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdopting(false);
    }
  };

  const setKind = (k: NetworkKind) => k !== kind && st().setNetworkKind(k);

  return (
    <section className="card loop">
      <div className="choice wide-choice">
        <button className={kind === 'cycling' ? 'on' : ''} onClick={() => setKind('cycling')}>
          <Icon name="signpost" /> Radrouten
        </button>
        <button className={kind === 'mtb' ? 'on' : ''} onClick={() => setKind('mtb')}>
          <Icon name="mountain" /> MTB-Routen
        </button>
      </div>
      <p className="muted small">
        Beschilderte Routen im Kartenausschnitt – auf der Karte farbig markiert. Karte verschieben aktualisiert die
        Liste, ein Klick auf eine Route auf der Karte wählt sie aus.
      </p>
      <div className="chips">
        {GROUPS.map((g) => (
          <button
            key={g}
            className={groups.includes(g) ? 'on' : ''}
            onClick={() => st().setNetworkGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g])}
          >
            {GROUP_LABEL[g]}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {loading && !shown.length && <p className="muted small">Suche Routen …</p>}
      {!loading && !error && !shown.length && (
        <p className="muted small">Keine beschilderten Routen hier – Karte verschieben oder herauszoomen.</p>
      )}

      {shown.length > 0 && (
        <ul className="suggestions network" ref={listRef}>
          {shown.map((r) => {
            const on = active === r.id;
            return (
              <li key={`${r.kind}-${r.id}`} className={on ? 'on' : ''} onClick={() => select(r)}>
                <span className="net-symbol">
                  {r.symbolId ? (
                    <img src={symbolUrl(r.kind, r.symbolId)} alt="" loading="lazy" />
                  ) : (
                    <Icon name="signpost" size={22} />
                  )}
                </span>
                <div className="sugg-main">
                  <div className="sugg-head">
                    <b className="poi-name">{r.name}</b>
                  </div>
                  <div className="sugg-tags">
                    <span>{GROUP_LABEL[r.group]}</span>
                    {r.ref && r.ref !== r.name && <span>{r.ref}</span>}
                    {on && details && (details.officialLength || details.length) && (
                      <span>{formatKm((details.officialLength ?? details.length)!)}</span>
                    )}
                  </div>
                  {on && (
                    <div className="net-detail" onClick={(e) => e.stopPropagation()}>
                      {!details && <p className="muted small">Lade Verlauf …</p>}
                      {details?.description && <p className="small">{details.description}</p>}
                      {details && (
                        <div className="net-actions">
                          <button
                            className="primary"
                            disabled={adopting || details.path.length < 2}
                            onClick={() => adopt(true)}
                            title="Nur den Teil der Route übernehmen, der gerade auf der Karte zu sehen ist"
                          >
                            {adopting ? 'Übernehme …' : 'Sichtbaren Abschnitt übernehmen'}
                          </button>
                          <button
                            disabled={adopting || details.path.length < 2}
                            onClick={() => adopt(false)}
                            title="Komplette Route als bearbeitbare Route übernehmen"
                          >
                            Ganze Route
                            {details.length ? ` (${formatKm(details.length)})` : ''}
                          </button>
                          <button className="ghost" onClick={() => fit(details.lines.flat())}>
                            Zeigen
                          </button>
                        </div>
                      )}
                      {details && (
                        <div className="poi-links">
                          <a href={routeLink(r.kind, r.id)} target="_blank" rel="noreferrer">
                            Waymarked Trails
                          </a>
                          {details.website && (
                            <a href={details.website} target="_blank" rel="noreferrer">
                              Website
                            </a>
                          )}
                          {details.wikipedia && /^[a-z-]{2,12}$/.test(details.wikipedia.lang) && (
                            <a
                              href={`https://${details.wikipedia.lang}.wikipedia.org/wiki/${encodeURIComponent(details.wikipedia.title)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Wikipedia
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {loading && shown.length > 0 && <p className="muted small">Aktualisiere …</p>}
    </section>
  );
}
