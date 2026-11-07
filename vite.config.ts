import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // MapLibre 6 lädt seinen Worker relativ zu import.meta.url –
  // das Vorbündeln durch Vite würde den Pfad brechen.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
