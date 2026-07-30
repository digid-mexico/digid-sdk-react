import { defineConfig } from 'tsup';

export default defineConfig({
  // Dos entradas: la API estable y el motor de escaneo/detección, que se
  // publica en el subpath ./engine como API inestable (ver docs/VERSIONADO.md).
  entry: { index: 'src/index.ts', engine: 'src/engine.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  onSuccess: 'cp src/theme/styles.css dist/styles.css',
});
