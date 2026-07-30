# Política de versionado

Cómo se numeran las versiones de `@digid-sdk/firma-autografa-react` y qué puede
esperar un integrador al actualizar.

---

## 1. Qué es API pública

No todo lo que el paquete exporta está cubierto por SemVer. Hay dos niveles:

### Entrada principal — estable

```ts
import { FirmaAutografa } from '@digid-sdk/firma-autografa-react';
```

Cubierta por SemVer: quitar, renombrar o cambiar la forma de cualquier cosa que
salga de aquí exige un **major**. Son ~39 símbolos: el componente raíz y sus
props, el núcleo del flujo (`useAutografaFlow`, `ApiClient`, `flowReducer`), los
tipos de la API, el theming, el i18n y los componentes de paso sueltos.

### Subpath `/engine` — inestable

```ts
import { initDocScan, MARCO_ASPECT } from '@digid-sdk/firma-autografa-react/engine';
```

**No está cubierto por SemVer.** Contiene el motor de escaneo con OpenCV, los
detectores on-device y la geometría del marco guiado: ~77 símbolos, de los cuales
buena parte son umbrales calibrados con fotos reales (`WASH_VALVE_CAP`,
`EXTREME_BLUR_RATIO`, `MARCO_MIN_COVERAGE`, `SHARPNESS_MIN`…).

Esos umbrales se reajustan cuando los datos de campo lo piden, y eso puede pasar
en cualquier versión, incluida una patch. Quien dependa de este subpath debería
fijar la versión exacta del SDK y revisar el CHANGELOG antes de actualizar.

> **Por qué están separados.** Con todo en una sola entrada, la superficie
> pública eran 116 símbolos y ajustar un umbral de calibración era técnicamente
> un breaking change. Eso dejaba dos opciones malas: subir major por una
> recalibración, o incumplir SemVer y que las versiones dejaran de significar
> algo. La separación permite que el núcleo prometa estabilidad de verdad.

---

## 2. Qué número sube

| | Cuándo | Ejemplos reales |
|---|---|---|
| **PATCH**<br>`1.0.0 → 1.0.1` | Correcciones que no tocan la API | Arreglar el desborde del toolbar en móvil; recalibrar un umbral del escáner |
| **MINOR**<br>`1.0.0 → 1.1.0` | Funcionalidad nueva compatible hacia atrás | Agregar `tokenTransport` con un default que preserva el comportamiento previo |
| **MAJOR**<br>`1.0.0 → 2.0.0` | Cualquier ruptura | Quitar o renombrar una prop; cambiar la forma de un tipo exportado; **cambiar un default** |

### El caso que se pasa por alto

Cambiar un valor por default es **major**, aunque no se toque ninguna firma. El
día que `tokenTransport` pase de `'both'` a `'header'`, quien no haya actualizado
el backend se rompe sin haber cambiado una línea de su código.

---

## 3. La dimensión que SemVer no cubre: el backend

Este SDK no es una librería aislada — habla con la plataforma de Digid. SemVer
versiona el código del paquete, no el contrato con la API, así que una
combinación incompatible de SDK y backend no la detecta npm.

**Regla de diseño:** cuando el SDK necesite algo nuevo del backend, debe
**degradar, no romperse**. Ya se aplica en dos lugares:

- `tokenTransport: 'both'` por default funciona igual contra un backend que no
  conoce el header.
- Si `scan-assets/` no se sirve, los pasos de INE caen a captura manual en vez
  de fallar.

### Matriz de compatibilidad

Se mantiene en la guía de integración y se actualiza cuando una versión pasa a
requerir algo nuevo del backend.

| SDK | Backend mínimo | Nota |
|---|---|---|
| 0.8.x | cualquiera | `tokenTransport='both'` funciona con el backend legacy |
| — | con `X-Digid-Token` | requerido solo si se usa `tokenTransport='header'` |

---

## 4. Deprecación

Nada se quita de golpe de la API estable:

1. **Se marca** con `@deprecated` en un **minor**, indicando el reemplazo.
2. **Se documenta** en el CHANGELOG, en la sección "Obsoleto".
3. **Se quita** en el siguiente **major**.

Ejemplo vivo: `detectionAssets.zxingWasmUrl` ya no lo consume ningún paso desde
que el reverso de la INE usa el escáner de OpenCV, pero sigue en el tipo por
compatibilidad. Se quitará en el próximo major.

---

## 5. Pre-releases

Para validar un cambio grande con un cliente antes de exponerlo a todos:

```bash
npm version 1.1.0-beta.1
npm publish --tag next
```

El cliente lo instala explícitamente y el resto no se entera:

```bash
npm install @digid-sdk/firma-autografa-react@next
```

`latest` no se mueve hasta el release definitivo. Es la vía recomendada para
cualquier cambio que toque el contrato con el backend.

---

## 6. Mecánica de un release

```bash
npm version minor      # actualiza package.json, crea el commit y el tag
git push --follow-tags # el tag dispara el workflow de publicación
```

Antes de eso:

- [ ] `npm ci && npm run typecheck && npm test && npm run build`
- [ ] CHANGELOG actualizado: mover lo de "Sin publicar" a la versión nueva
- [ ] Si cambió el contrato con el backend, actualizar la matriz de la sección 3

El detalle del publish está en [PUBLICACION.md](PUBLICACION.md).

---

## 7. Sobre llegar a 1.0.0

El paquete estuvo en `0.x` durante todo el desarrollo previo a la publicación,
donde SemVer permite romper compatibilidad en un minor.

Ahora que la superficie estable está acotada a ~39 símbolos, **la primera
versión publicada debería ser `1.0.0`**: es una promesa que sí se puede
sostener, y le dice al integrador que el SDK está listo para producción.

Quedarse en `0.x` solo tiene sentido si se prefiere margen para mover la API
mientras los primeros clientes integran.
