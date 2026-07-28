import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Modo móvil: `npm run dev:movil` levanta el server con HTTPS (certificado
// autofirmado) y expuesto en la red local, porque getUserMedia (cámara) solo
// funciona en contextos seguros — desde el celular no existe "localhost".
const httpsForMobile = process.env.DIGID_DEV_HTTPS === '1';

export default defineConfig({
  root: 'playground',
  plugins: [react(), ...(httpsForMobile ? [basicSsl()] : [])],
  server: {
    port: 5199,
    host: httpsForMobile ? true : undefined, // exponer en la LAN solo en modo móvil
    // proxy al backend local de Digid para evitar CORS en desarrollo
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/storage': 'http://127.0.0.1:8000',
      '/docments': 'http://127.0.0.1:8000',
    },
  },
});
