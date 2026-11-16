# perfil-lector

Lee desde la Mac de la persona las fuentes de ofertas que no se dejan leer desde el servidor y las entrega a la API
del perfil. Hoy lee LinkedIn y Bumeran, sin que una espere a la otra.

## Cómo se usa

1. `npm ci`
2. `npm run instalar` — compila, crea `~/Applications/PerfilLector.app` (el enlace `perfil-lector://`) y guarda en el
   Llavero la URL de la API y el token de servicio de Cloudflare Access.
3. En el panel, «Conexiones» → «Leer desde mi máquina».

`npm run desinstalar` quita la app y las entradas del Llavero.

## Qué hace una corrida

- Valida la dirección del enlace antes de nada. Si no es exactamente `perfil-lector://leer?corrida=<código>`, termina
  sin leer el Llavero, sin abrir Chrome y sin llamar a la API.
- Toma la URL de la API y el token solo del Llavero.
- Abre Google Chrome con un perfil propio por conexión en `~/Library/Application Support/perfil-lector/`.
- Si falta la sesión de LinkedIn, abre la ventana en el inicio de sesión y lee al terminar.
- Lee como mucho 25 avisos por corrida, entrega y termina. No postula ni escribe nada en LinkedIn.
- Bumeran se lee siempre en una ventana de Chrome que la persona ve abrirse y cerrarse: una sola carga de la búsqueda
  de avisos de tecnología más recientes, de la que solo se escucha lo que la propia página carga. Una verificación o
  un bloqueo detienen la lectura sin resolverlo.

El registro local está en `~/Library/Logs/perfil-lector/lector.log` y nunca guarda el código de la corrida ni el
token.

Nunca corras `playwright install chrome`: en macOS borra el Chrome instalado.

## Pruebas

- `npm test`
- Corrida contra la API local (`./mvnw spring-boot:test-run` en perfil-api):
  `PERFIL_API_LOCAL=http://localhost:8080 PERFIL_API_TARGET=<perfil-api>/target npm test`
