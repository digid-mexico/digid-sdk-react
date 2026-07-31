import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FirmaAutografa } from '../src';
import '../src/theme/styles.css';

const token = new URLSearchParams(location.search).get('token') ?? '';

// StrictMode a propósito: es el default de la plantilla React de Vite, así que
// es lo que tiene la mayoría de los integradores. Sin él, el playground no
// reproducía el ciclo montar → desmontar → remontar de desarrollo, y por eso
// dejó pasar a producción un bug que colgaba la captura de INE en cualquier
// app que sí lo usara (ver CHANGELOG 1.0.2). El entorno de pruebas debe
// parecerse al del consumidor, no ser más benigno que él.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {token ? (
      <FirmaAutografa
        token={token}
        baseUrl=""
        onComplete={() => console.log('completado')}
        onExit={(r) => console.log('salida:', r)}
        onError={(e) => console.error(e)}
      />
    ) : (
      <p>Agrega ?token=&lt;token-firmante&gt; a la URL para probar.</p>
    )}
  </StrictMode>,
);
