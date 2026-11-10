import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadHeat } from './api/heatStore';
import { loadTraceCache } from './api/osmTraces';
import { initSite } from './api/site';
import { initSync } from './api/sync';
import { initHistory } from './history';
import { initPwa } from './pwa';
import './styles.css';

// Worker explizit als Asset einbinden, sonst fehlt er im Produktions-Build
setWorkerUrl(workerUrl);

// installierbar und offline nutzbar
initPwa();

// Rückgängig/Wiederholen für Änderungen an der Route
initHistory();

// eigene Heatmap aus dem Browser-Speicher laden
void loadHeat();
void loadTraceCache();
// Veloterra-Server (Konten mit Sync, seitenweite Einstellungen, GPS-Spuren)
initSync();
void initSite();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
