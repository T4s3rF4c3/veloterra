import { useEffect, useRef, useState } from 'react';
import { useHeat } from '../api/heatStore';
import { GpsTracesOptions } from './GpsTraces';
import { Icon, type IconName } from './Icon';
import { redo, undo, useHistory } from '../history';
import { useStore, type Basemap, type ColorMode } from '../store';

const BASEMAPS: { value: Basemap; label: string; hint: string }[] = [
  { value: 'light', label: 'Hell', hint: 'Ruhige Karte, Route gut sichtbar' },
  { value: 'standard', label: 'Standard', hint: 'Mehr Details, Wege und Orte' },
  { value: 'satellite', label: 'Satellit', hint: 'Esri, weltweit' },
  { value: 'aerial', label: 'Luftbild DE', hint: 'Amtlich, 20–40 cm (RLP, NRW, HE, BY)' },
];

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'surface', label: 'Untergrund' },
  { value: 'road', label: 'Straßenart' },
  { value: 'grade', label: 'Steigung' },
  { value: 'wind', label: 'Wind' },
  { value: 'novelty', label: 'Neu für mich' },
  { value: 'plain', label: 'Einfarbig' },
];

function Toggle({
  on,
  onChange,
  icon,
  label,
  hint,
}: {
  on: boolean;
  onChange: () => void;
  icon: IconName;
  label: string;
  hint: string;
}) {
  return (
    <button className={`layer-toggle ${on ? 'on' : ''}`} onClick={onChange} role="switch" aria-checked={on}>
      <span className="switch" aria-hidden />
      <span>
        <span className="layer-label">
          <Icon name={icon} size={15} /> {label}
        </span>
        <small>{hint}</small>
      </span>
    </button>
  );
}

/**
 * Kartenleiste: Rückgängig, ein „Ebenen“-Menü für Kartenstil, Einfärbung und
 * Einblendungen, und Route ein-/ausblenden. Hält die Karte frei von Knöpfen.
 */
export function MapToolbar({
  hasRoute,
  bounds,
}: {
  hasRoute: boolean;
  bounds: () => [number, number, number, number] | null;
}) {
  const canUndo = useHistory((s) => s.canUndo);
  const canRedo = useHistory((s) => s.canRedo);
  const mode = useStore((s) => s.mode);
  const basemap = useStore((s) => s.basemap);
  const colorMode = useStore((s) => s.colorMode);
  const hideRoute = useStore((s) => s.hideRoute);
  const showStops = useStore((s) => s.showStops);
  const showPhotos = useStore((s) => s.showPhotos);
  const netOverlay = useStore((s) => s.netOverlay);
  const showGpsTraces = useStore((s) => s.showGpsTraces);
  const showMyHeat = useStore((s) => s.showMyHeat);
  const heatCount = useHeat((s) => s.tracks.length);
  const st = useStore.getState;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const key = mac ? '⌘' : 'Strg+';

  // Menü schließen bei Klick daneben oder Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const routeMode = mode === 'route';

  return (
    <div className="map-tools">
      {routeMode && (
        <div className="choice history">
          <button onClick={undo} disabled={!canUndo} title={`Rückgängig (${key}Z)`} aria-label="Rückgängig">
            <Icon name="undo" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title={`Wiederholen (${key}${mac ? '⇧Z' : 'Y'})`}
            aria-label="Wiederholen"
          >
            <Icon name="redo" />
          </button>
        </div>
      )}

      <div className="layers" ref={ref}>
        <button className={`tool-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name="layers" /> Ebenen
          {routeMode && hasRoute && <small>· {COLOR_MODES.find((c) => c.value === colorMode)?.label}</small>}
        </button>
        {open && (
          <div className="layers-menu" role="dialog" aria-label="Kartenebenen">
            <h4>Karte</h4>
            <div className="basemaps">
              {BASEMAPS.map((b) => (
                <button
                  key={b.value}
                  className={`basemap bm-${b.value} ${basemap === b.value ? 'on' : ''}`}
                  onClick={() => st().setBasemap(b.value)}
                  title={b.hint}
                >
                  <span className="bm-thumb" aria-hidden />
                  {b.label}
                </button>
              ))}
            </div>

            {routeMode && (
              <>
                <h4>Route einfärben nach</h4>
                <div className="choice wrap">
                  {COLOR_MODES.filter((m) => m.value !== 'novelty' || heatCount > 0).map((m) => (
                    <button
                      key={m.value}
                      className={colorMode === m.value ? 'on' : ''}
                      onClick={() => st().setColorMode(m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <h4>Einblenden</h4>
            {routeMode && (
              <>
                <Toggle
                  on={showStops}
                  onChange={() => st().setShowStops(!showStops)}
                  icon="coffee"
                  label="Stopps unterwegs"
                  hint="Cafés, Trinkwasser, Rad-Service an der Route"
                />
                <Toggle
                  on={showPhotos}
                  onChange={() => st().setShowPhotos(!showPhotos)}
                  icon="camera"
                  label="Fotos der Strecke"
                  hint="Straßenfotos über dem Höhenprofil"
                />
              </>
            )}
            {mode !== 'network' && (
              <>
                <Toggle
                  on={netOverlay === 'cycling'}
                  onChange={() => st().setNetOverlay(netOverlay === 'cycling' ? 'off' : 'cycling')}
                  icon="signpost"
                  label="Beschilderte Radrouten"
                  hint="Radfernwege und regionale Routen"
                />
                <Toggle
                  on={netOverlay === 'mtb'}
                  onChange={() => st().setNetOverlay(netOverlay === 'mtb' ? 'off' : 'mtb')}
                  icon="mountain"
                  label="MTB-Routen"
                  hint="Ausgeschilderte Mountainbike-Strecken"
                />
              </>
            )}
            {mode === 'network' && <p className="muted small">Im Tab „Radwege“ ist das Routennetz immer sichtbar.</p>}
            <Toggle
              on={showMyHeat && heatCount > 0}
              onChange={() => heatCount > 0 && st().setShowMyHeat(!showMyHeat)}
              icon="flame"
              label="Meine Fahrten"
              hint={heatCount ? `${heatCount} importierte Fahrten` : 'Erst unter „Meine Heatmap“ importieren'}
            />
            <Toggle
              on={showGpsTraces}
              onChange={() => st().setShowGpsTraces(!showGpsTraces)}
              icon="map"
              label="Öffentliche GPS-Spuren"
              hint="Hochgeladene Tracks aus OpenStreetMap – zeigt, wo viel gefahren wird"
            />
            {showGpsTraces && <GpsTracesOptions bounds={bounds} />}
          </div>
        )}
      </div>

      {routeMode && hasRoute && (
        <button
          className={`tool-btn ${hideRoute ? 'on' : ''}`}
          onClick={() => st().setHideRoute(!hideRoute)}
          title="Route ausblenden, um die Straße darunter zu sehen (Taste H)"
          aria-label={hideRoute ? 'Route zeigen' : 'Route ausblenden'}
        >
          <Icon name={hideRoute ? 'eye' : 'eye-off'} />
          <span className="tool-label">{hideRoute ? 'Route zeigen' : 'Route ausblenden'}</span>
        </button>
      )}
    </div>
  );
}
