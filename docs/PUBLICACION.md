# Plan de publicación en npm

Cómo llevar `@digid/firma-autografa-react` al registro público de npm para que
cualquier cliente pueda instalarlo con `npm install`.

---

## 0. Bloqueante antes del primer publish: la licencia

`package.json` declara `"license": "UNLICENSED"`, que significa *todos los derechos
reservados, sin permiso de uso*. Publicar así en el registro **público** es
contradictorio: el paquete queda descargable por cualquiera, pero el campo de
licencia dice que nadie puede usarlo. npm lo permite técnicamente, pero deja a los
clientes sin base legal clara para integrarlo.

Hay que elegir antes de publicar. Es una decisión legal/comercial, no técnica:

| Opción | Implica |
|---|---|
| **Licencia propietaria con archivo `LICENSE`** | Mantener `UNLICENSED` (o un identificador propio como `SEE LICENSE IN LICENSE`) y agregar un `LICENSE` que conceda uso a clientes con contrato vigente. Es lo más cercano al modelo de negocio actual. |
| **MIT / Apache-2.0** | Permisivas y sin fricción para el cliente. Apache-2.0 además incluye concesión expresa de patentes. Implica aceptar que cualquiera —cliente o no— pueda usar el código. |

> **Nota sobre el código fuente.** El paquete incluye los source maps
> (`dist/index.js.map`, ~370 kB), que embeben el TypeScript original. Publicar en npm
> público expone el código fuente **aunque el repositorio de GitHub sea privado**. Si
> no se quiere eso, hay que quitar los sourcemaps del build (`sourcemap: false` en
> `tsup.config.ts`) antes de publicar.

---

## 1. Preparar la cuenta y el scope

El scope `@digid` no tiene paquetes publicados. Para un scope público:

```bash
npm login
```

Luego crear la organización `digid` en https://www.npmjs.com/org/create (el plan
gratuito permite paquetes **públicos** ilimitados; el de pago solo hace falta para
privados). Verificar que la cuenta quedó como miembro con permiso de publicación:

```bash
npm whoami
npm org ls digid
```

> Si el scope `@digid` ya está tomado por un tercero, la alternativa es renombrar el
> paquete a `@digid-mexico/firma-autografa-react` para que coincida con la
> organización de GitHub. Ese cambio toca `package.json`, el README y la guía.

Activar 2FA en la cuenta npm y dejarlo en modo *auth-and-writes*. Para publicar desde
CI hace falta un **Automation token**, que es el único que salta el 2FA:
npmjs.com → Access Tokens → Generate → *Automation*.

---

## 2. Verificación previa a cada publish

Ya está configurado `prepublishOnly: npm run build`, así que el build corre solo. Lo
que conviene ejecutar antes, en local o en CI:

```bash
npm ci && npm run typecheck && npm test && npm run build && npm pack --dry-run
```

Qué revisar en la salida de `npm pack --dry-run`:

- **Contenido**: solo `dist/`, `scan-assets/`, `README.md` y `package.json` (lo
  declarado en `files`). Que no se cuelen `src/`, `playground/` ni `.env`.
- **Tamaño**: ~3.2 MB comprimido / ~10.3 MB desempaquetado. Lo domina
  `scan-assets/opencv.js` (9 MB). Es esperado; si crece de golpe, algo se coló.

---

## 3. Primer publish

La primera vez, un paquete con scope necesita `--access public` de forma explícita
(el `publishConfig.access: "public"` de `package.json` ya lo cubre, pero pasarlo
explícito evita sorpresas):

```bash
npm publish --access public
```

Comprobar que quedó bien instalable desde fuera, en un directorio temporal limpio:

```bash
npm view @digid/firma-autografa-react
```

---

## 4. Releases siguientes

```bash
npm version patch      # o minor / major -> crea el commit y el tag
git push --follow-tags
npm publish
```

Mientras el paquete siga en `0.x`, SemVer permite romper compatibilidad en un
**minor**. Conviene comunicarlo en el README (ya está) y llegar a `1.0.0` cuando la
API pública deje de moverse.

Cambios que obligan a **major** una vez en 1.x: renombrar o quitar props de
`FirmaAutografa`, cambiar la forma de los tipos exportados, o mover el default de
`tokenTransport`.

---

## 5. Publicar desde CI (recomendado)

Publicar desde GitHub Actions evita releases hechas desde una laptop con estado
sucio, y habilita **provenance**: npm firma el paquete y muestra en su página desde
qué commit y workflow se construyó.

Guardar el Automation token como secret `NPM_TOKEN` en el repositorio, y agregar
`.github/workflows/publish.yml`:

```yaml
name: Publish
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write        # requerido para --provenance
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Con esto el flujo de release completo queda:

```bash
npm version minor
git push --follow-tags     # el tag dispara el workflow y publica
```

---

## 6. Qué comunicar a los clientes

Al anunciar la disponibilidad, lo que necesitan saber para integrar:

1. `npm install @digid/firma-autografa-react`
2. Importar `@digid/firma-autografa-react/styles.css`.
3. Copiar `scan-assets/` a su directorio de estáticos (si no, los pasos de INE caen a
   captura manual).
4. Agregar su dominio al allowlist de CORS del backend de Digid.
5. Leer la [guía de integración](GUIA-INTEGRACION.md), en particular la
   [sección 5.1](GUIA-INTEGRACION.md#51-cómo-viaja-el-token-tokentransport) sobre
   `tokenTransport` y la [10.3](GUIA-INTEGRACION.md#103-content-security-policy-csp)
   sobre CSP.

---

## Checklist del primer release

- [ ] Decidir la licencia y agregar el archivo `LICENSE` (sección 0)
- [ ] Decidir si se publican los sourcemaps (exponen el código fuente)
- [ ] Crear/confirmar la organización `digid` en npm y el permiso de publicación
- [ ] Activar 2FA y generar el Automation token
- [ ] `npm ci && npm run typecheck && npm test && npm run build`
- [ ] Revisar `npm pack --dry-run` (contenido y tamaño)
- [ ] `npm publish --access public`
- [ ] Verificar la instalación en un proyecto limpio
- [ ] Configurar el workflow de publicación desde CI
