import { createRoot } from 'react-dom/client';
import { FirmaAutografa } from '../src';
import '../src/theme/styles.css';

const token = new URLSearchParams(location.search).get('token') ?? '';

createRoot(document.getElementById('root')!).render(
  token ? (
    <FirmaAutografa
      token={token}
      baseUrl=""
      onComplete={() => console.log('completado')}
      onExit={(r) => console.log('salida:', r)}
      onError={(e) => console.error(e)}
    />
  ) : (
    <p>Agrega ?token=&lt;token-firmante&gt; a la URL para probar.</p>
  ),
);
