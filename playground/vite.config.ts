import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Modo móvil: `npm run dev:movil` levanta el server con HTTPS (certificado
// autofirmado) y expuesto en la red local, porque getUserMedia (cámara) solo
// funciona en contextos seguros — desde el celular no existe "localhost".
const httpsForMobile = process.env.DIGID_DEV_HTTPS === '1';

// Sirve los assets de escaneo OpenCV (scan-worker.js + opencv.js, Task 22)
// bajo /digid-scan/ — la misma URL documentada para consumidores del SDK en
// producción (ver docs/GUIA-INTEGRACION.md, sección de escaneo de
// documentos). Los assets viven en scan-assets/ en la raíz del paquete (no
// se empaquetan en dist/: el "files" de package.json los expone tal cual),
// así que en el playground se leen directo de esa carpeta del repo.
function scanAssetsMiddleware(): Plugin {
  const scanAssetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scan-assets');
  return {
    name: 'digid-scan-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/digid-scan/')) return next();
        const filename = req.url.slice('/digid-scan/'.length).split('?')[0] ?? '';
        const filePath = path.join(scanAssetsDir, filename);
        if (!filePath.startsWith(scanAssetsDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return next();
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: 'playground',
  plugins: [react(), scanAssetsMiddleware(), ...(httpsForMobile ? [basicSsl()] : [])],
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
