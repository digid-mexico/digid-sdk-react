import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'playground',
  plugins: [react()],
  server: {
    port: 5199,
    // proxy al backend local de Digid para evitar CORS en desarrollo
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/storage': 'http://127.0.0.1:8000',
      '/docments': 'http://127.0.0.1:8000',
    },
  },
});
