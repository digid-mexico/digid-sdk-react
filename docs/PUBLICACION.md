# Plan de publicación en npm

Cómo llevar `@digid/firma-autografa-react` al registro público de npm para que
cualquier cliente pueda instalarlo con `npm install`.

---

## 0. Licencia — resuelto

El paquete se publica bajo **Apache-2.0** (`LICENSE`, copyright 2026 Digid). Es un
identificador SPDX estándar, así que no genera fricción con el escaneo de
dependencias ni con las áreas legales de los clientes, e incluye concesión expresa
de patentes y protección de marca.

Que el código sea abierto no regala el servicio: el flujo solo funciona contra la
plataforma de Digid con un token de firmante válido, que requiere cuenta activa.

Dos consecuencias a tener presentes:

- **El código fuente queda expuesto.** El paquete incluye los source maps
  (`dist/index.js.map`, ~370 kB), que embeben el TypeScript original. Eso ya es
  coherente con Apache-2.0; si de todos modos se prefiere no publicarlos, basta
  `sourcemap: false` en `tsup.config.ts`.
- **Atribuciones de terceros.** El paquete redistribuye `scan-assets/opencv.js`
  (OpenCV, Apache-2.0) y adapta el algoritmo de jscanify (MIT) en
  `scan-assets/scan-worker.js`. Ambas atribuciones viven en `NOTICE`, que npm
  incluye automáticamente en el tarball. Al actualizar OpenCV o cambiar el
  algoritmo del worker, hay que revisar ese archivo.

El titular del copyright es **CONSTANCIAS DIGITALES**, en `LICENSE`, `NOTICE` y el
campo `author` de `package.json`.

---

## 1. Preparar la cuenta y el scope

Todo este paso se hace en la web de npm y requiere contraseña y 2FA, así que lo
ejecuta una persona; no se puede automatizar desde el repositorio.

### 1.1 Cuenta y 2FA

1. Crear la cuenta en https://www.npmjs.com/signup, o iniciar sesión con la
   existente. Conviene que sea una cuenta de la empresa, no personal: quien la
   controle podrá publicar versiones del SDK.
2. Activar 2FA en https://www.npmjs.com/settings/~/2fa en la modalidad
   **Authorization and Publishing**.
3. Guardar los códigos de recuperación fuera de la laptop.

### 1.2 Comprobar que el scope `@digid` esté libre

Antes de crear nada:

```bash
npm view @digid/firma-autografa-react
```

Un `E404` confirma que el paquete no existe, pero **no** que el scope esté libre:
alguien pudo reservar `digid` sin publicar nada. La prueba definitiva es el
formulario del paso 1.3 — si el nombre está tomado, lo rechaza ahí mismo.

Si `digid` resulta ocupado, las alternativas naturales son
`@constancias-digitales` o `@digid-mexico` (este último hace juego con la
organización de GitHub). Cambiar el scope toca el `name` de `package.json`, el
README y la guía de integración.

### 1.3 Crear la organización

1. Ir a https://www.npmjs.com/org/create
2. Nombre de la organización: `digid` → el scope queda como `@digid`.
3. Elegir el plan **Free**: da paquetes **públicos** ilimitados. El de pago solo
   hace falta para paquetes privados, y este se publica público.
4. Verificar desde la terminal:

```bash
npm login          # abre el navegador para autenticar
npm whoami         # debe imprimir tu usuario
npm org ls digid   # debe listarte como owner/admin
```

### 1.4 Generar el token para CI

Es lo que permite publicar desde GitHub Actions sin capturar el 2FA de forma
interactiva.

1. Ir a https://www.npmjs.com/settings/~/tokens
2. **Generate New Token**, eligiendo el tipo:

   | Tipo | Cuándo usarlo |
   |---|---|
   | **Granular Access Token** (recomendado) | Permite limitarlo a la organización `digid` o al paquete específico y ponerle expiración. Elegir permiso *Read and write*. |
   | **Classic → Automation** | Más simple, sin expiración ni alcance limitado. Funciona, pero si se filtra compromete mucho más. |

3. Copiar el token **en ese momento**: npm no lo vuelve a mostrar.
4. Guardarlo en GitHub como secret:
   `Settings → Secrets and variables → Actions → New repository secret`,
   con el nombre `NPM_TOKEN`.

> **Antes de generar el token, revisa si tu cuenta ya tiene disponible *Trusted
> Publishing* (OIDC) en la configuración del paquete.** Si está, es preferible:
> GitHub Actions se autentica contra npm sin token, así que no hay secret que
> rotar ni que se pueda filtrar, y el `NODE_AUTH_TOKEN` del workflow de la
> sección 5 sobra. Es una función relativamente reciente; si no aparece en la
> interfaz, sigue con el token.

### 1.5 Higiene del token

- Nunca pegarlo en un archivo del repositorio ni en un `.npmrc` commiteado.
- Con Granular Access Token, anotar la fecha de expiración para rotarlo a tiempo y
  no enterarte con un release fallido.
- Si se filtra, revocarlo en la misma pantalla de tokens: queda inválido de
  inmediato.

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

- [x] Licencia decidida (Apache-2.0) con `LICENSE` y `NOTICE` en el repositorio
- [x] Razón social del copyright confirmada (CONSTANCIAS DIGITALES)
- [ ] Decidir si se publican los sourcemaps (exponen el código fuente)
- [ ] Cuenta npm de la empresa creada y con 2FA activo (sección 1.1)
- [ ] Scope `@digid` confirmado libre (sección 1.2)
- [ ] Organización `digid` creada en plan Free (sección 1.3)
- [ ] Token generado y guardado como secret `NPM_TOKEN` en GitHub (sección 1.4)
- [ ] `npm ci && npm run typecheck && npm test && npm run build`
- [ ] Revisar `npm pack --dry-run` (contenido y tamaño)
- [ ] `npm publish --access public`
- [ ] Verificar la instalación en un proyecto limpio
- [ ] Configurar el workflow de publicación desde CI
