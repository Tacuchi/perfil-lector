# Arquitectura de perfil-lector

Revisado el 2026-11-18 contra la versión 0.1.0 (commit `b713101`).

Este documento describe el lector local: sus procesos, interfaces, datos y reglas.
No describe la implementación del panel, la api ni su infraestructura.
Los valores son predeterminados o condiciones del código; no son mediciones de una instalación.

## 1. Propósito y metas de calidad

El código del lector local puede leer ofertas de LinkedIn y Bumeran desde la Mac de la persona.
Recibe un enlace de corrida, obtiene sus credenciales del Llavero y entrega los avisos a la api.
Cada fuente trabaja de forma independiente y el proceso termina después del cierre de la corrida.

Estado indicado por la persona el 2026-11-18: la api lee LinkedIn y Bumeran mediante Apify y no asigna
ninguna fuente a la máquina de la persona. El lector local permanece instalado y sin uso, a la espera de un uso futuro.

Qué no es:

- Un servidor HTTP: recibe un argumento, no abre un puerto.
- Un servicio programado: el instalador registra una app de enlaces, sin instalar un agente permanente.
- Un cliente para postular a empleos: solo recoge las respuestas de las páginas.
- Un lector activo de alertas de LinkedIn: ese recorrido existe, pero está desactivado.

| Meta | Escenario |
|---|---|
| Rechazar enlaces inesperados | Una dirección distinta del patrón exacto termina antes del Llavero, Chrome y la api. |
| Independencia de fuentes | Bumeran puede entregar mientras LinkedIn espera el inicio de sesión. |
| Entregar información completa | Un aviso sin título o descripción se descarta; Bumeran exige además su enlace visible. |
| Respetar bloqueos | Una verificación se reporta con un motivo fijo, sin intentar resolverla. |
| Proteger sesiones | Cada conexión usa un perfil persistente propio del Chrome instalado. |

## 2. Contexto y alcance

![Diagrama de contexto de perfil-lector](docs/architecture/context.svg)

[Versión interactiva](https://tacuchi.github.io/perfil-lector/architecture/context.html).

| Interfaz externa | Dirección | Cuándo ocurre |
|---|---|---|
| Panel y macOS | Entrante, enlace local | El contrato de entrada es `perfil-lector://leer?corrida=<código>`. El comentario del código identifica al panel como lanzador. |
| Llavero de macOS | Local | Después de validar la dirección; lee la URL de la api y el token de servicio. |
| API | Saliente, POST JSON | Para iniciar, avisar el comienzo de cada fuente, entregar y terminar. |
| Proxy de acceso | Saliente, credenciales en cabeceras | Cada petición a la api lleva el identificador y el secreto del token de servicio. Su validación ocurre fuera del lector. |
| LinkedIn | Saliente, Chrome y HTTPS | Al leer recomendadas; abre el inicio de sesión si falta o caduca la sesión. |
| Bumeran | Saliente, Chrome visible y HTTPS | Una carga de la búsqueda de tecnología, con los avisos más recientes primero. |
| Herramientas de macOS | Local | El instalador compila, firma y registra la app; guarda o quita credenciales. |

El código local demuestra el formato del enlace y las peticiones del lector.
La presencia actual del botón en el panel y la configuración del proxy de acceso requieren verificar esos sistemas.
No hay una conexión del lector local con el sitio público, la base de datos ni el orquestador.

## 3. Bloques de construcción

![Diagrama de contenedores de perfil-lector](docs/architecture/containers.svg)

[Versión interactiva](https://tacuchi.github.io/perfil-lector/architecture/containers.html).

| Bloque | Responsabilidad | Código |
|---|---|---|
| Entrada | Toma el primer argumento y convierte el resultado en código de salida. | `src/main.ts` |
| Validador del enlace | Acepta únicamente la cadena completa con un código de 43 caracteres base64url. | `src/enlace.ts` |
| Coordinador | Inicia la corrida y ejecuta las fuentes con `Promise.allSettled`. | `src/corrida.ts` |
| Credenciales y cliente | Lee el Llavero y envía cuatro familias de peticiones POST. | `src/credenciales.ts`, `src/api.ts` |
| Lectores | Navegan, escuchan las respuestas de cada página y clasifican fallos. | `src/fuentes/linkedin.ts`, `src/fuentes/bumeran.ts` |
| Conversores | Normalizan, recortan, deduplican y filtran los avisos incompletos. | `src/fuentes/linkedin-avisos.ts`, `src/fuentes/bumeran-avisos.ts` |
| Navegador | Abre Chrome con un perfil dedicado y diferencia ausencia de Chrome de perfil ocupado. | `src/fuentes/navegador.ts` |
| Registro | Añade mensajes locales y tapa cadenas con forma de código de corrida o JWT. | `src/registro.ts` |
| Instalador | Crea la app AppleScript, registra el esquema y configura el Llavero. | `src/instalador/` |

Reglas que no se rompen:

- La dirección se valida antes de leer las credenciales o contactar con la api.
- El código de corrida va en el cuerpo JSON; el cliente no lo añade a la ruta.
- Cada fuente consulta a la api antes de navegar al sitio; un 409 omite esa lectura.
- Chrome puede abrirse antes de esa consulta; abrir el perfil no equivale a empezar la lectura del sitio.
- Las respuestas capturadas proceden de peticiones de la página, sin consultas de datos fabricadas por el lector.
- Bumeran se abre siempre con ventana y no resuelve verificaciones.
- Un aviso incompleto no se entrega como una oferta válida.
- Las alertas de LinkedIn permanecen desactivadas por la constante del lector.

## 4. Vista de ejecución

Corrida iniciada mediante enlace:

1. macOS entrega la dirección a la app, que lanza Node en segundo plano y termina.
2. Node valida el enlace completo. Un formato inválido termina con salida 2.
3. Lee las tres entradas del Llavero y comprueba la URL de la api.
4. Inicia la corrida; recibe las fuentes, sus máximos y la fecha de vencimiento.
5. Calcula el plazo para iniciar sesión: hasta ocho minutos, dejando un minuto antes del vencimiento.
6. Ejecuta las fuentes en paralelo. Cada lector abre su perfil y pide permiso para empezar.
7. Un 409 evita consultar esa fuente. Si se permite, lee y entrega avisos o un fallo de catálogo.
8. Cada lector cierra su contexto de Chrome en su bloque de finalización.
9. Tras las entregas, pide terminar la corrida. Una entrega rechazada provoca también un intento de cierre.
10. Registra el resultado y devuelve el código de salida correspondiente.

Lecturas del navegador:

1. LinkedIn empieza sin ventana y comprueba que la cookie de sesión exista y no esté vacía.
2. Sin sesión, vuelve a abrir con ventana y espera el inicio de sesión manual.
3. Si una sesión existente caduca al navegar, permite un único nuevo inicio de sesión y repite la lectura.
4. Lee recomendadas, escucha las respuestas de avisos y entrega solo los que tienen título y descripción.
5. Bumeran abre una ventana, carga una búsqueda y escucha su respuesta de avisos y enlaces visibles.
6. Los estados de ritmo, verificación o respuesta ilegible se convierten en motivos de catálogo.

## 5. Vista de despliegue

| Qué | Por defecto | Cuándo aplica | Cómo cambiarlo |
|---|---|---|---|
| Plataforma | macOS | Instalación y operación reales | No hay otro instalador implementado. |
| Runtime | Node.js 22.20 o superior | Al compilar y ejecutar | Usar una versión compatible con el manifiesto. |
| App | `~/Applications/PerfilLector.app` | Tras `npm run instalar` | Destino fijado en el instalador. |
| Ruta de Node y del lector | Rutas absolutas capturadas al instalar | Al abrir un enlace | Reinstalar después de mover Node o el checkout. |
| URL de la api | Ninguna | Debe configurarse al instalar | Volver a ejecutar `npm run instalar`. |
| Credenciales | Tres entradas del servicio `perfil-lector` en el Llavero | En cada corrida | El instalador las actualiza. |
| Perfiles | `~/Library/Application Support/perfil-lector/`, subcarpetas por fuente | Al abrir Chrome | No hay opción de usuario. |
| Registro | `~/Library/Logs/perfil-lector/lector.log` | Cuando se registra un mensaje | No hay opción de usuario. |
| Navegador | Google Chrome instalado; vista de 1280 × 860 | Durante una lectura | No hay respaldo en Chromium descargado. |
| Petición a la api | Plazo de 30 segundos | Cada POST | Fijado en el cliente. |
| Inicio de sesión | Hasta ocho minutos y un minuto de margen ante el vencimiento | Si LinkedIn necesita sesión | Acotado también por `venceEn` de la api. |
| Máximo de avisos | `avisosMaximos` de cada fuente | Respuesta de inicio de corrida | Lo determina la api; aquí no hay un máximo fijo de 25. |
| LinkedIn | Recomendadas, alertas desactivadas | Cada lectura autorizada | La constante no es una opción de usuario. |
| Bumeran | Búsqueda peruana de tecnología, recientes primero | Cada lectura autorizada | URL fijada en el lector. |

Requisitos: Node.js, npm, Google Chrome y las herramientas incluidas en macOS.
El paquete es privado y se compila desde el checkout con TypeScript hacia `dist/`.
El instalador necesita acceso al Llavero y registra el enlace en LaunchServices.
No hay workflows versionados, contenedor ni servicio permanente en este repositorio.

Las pruebas opcionales contra una api local usan `PERFIL_API_LOCAL` y `PERFIL_API_TARGET`.
Son ajustes de pruebas; el ejecutable real sigue leyendo sus credenciales del Llavero.
La desinstalación quita la app y las entradas del Llavero; no borra perfiles ni registros.

## 6. Conceptos transversales

Datos y privacidad:

| Pregunta | Respuesta |
|---|---|
| ¿Qué sale de la máquina y a dónde va? | A la api: código de corrida, fuente y avisos normalizados o motivo de fallo. Al proxy de acceso: token de servicio en las cabeceras de esas peticiones. A los sitios: las peticiones de su página en Chrome y su sesión correspondiente. |
| ¿Qué nunca sale? | El lector no incluye cookies ni archivos del perfil en las entregas a la api. No añade cuerpos de respuesta externos a los mensajes de error. Las cookies sí viajan al sitio que las usa. |
| ¿Cuándo ocurre? | Durante una corrida iniciada por enlace, tras validar la dirección. Las lecturas del sitio esperan el permiso de la api. |
| ¿Dónde se guarda y por cuánto tiempo? | Credenciales en el Llavero; sesiones y caché en los perfiles de Chrome; mensajes en el registro local. No hay purga automática ni rotación del registro. Los avisos convertidos viven en memoria hasta entregarse. |
| ¿Cómo se ve exactamente lo que se envió? | No hay auditoría local de cuerpos JSON. El registro muestra cantidades, motivos fijos y resultados, no el contenido íntegro enviado. |
| ¿Cómo se apaga? | No abrir nuevos enlaces evita nuevas corridas. Desinstalar elimina la app registrada y las credenciales, pero no detiene expresamente un proceso ya lanzado. |

Seguridad:

- El patrón exige una ruta exacta y un único parámetro con formato fijo.
- La app cita por separado Node, el script y la dirección en la orden de AppleScript.
- La URL admite HTTPS sin usuario, contraseña, consulta ni fragmento; HTTP solo en `localhost` o `127.0.0.1`.
- El lector envía las cabeceras `CF-Access-Client-Id` y `CF-Access-Client-Secret` hacia la URL configurada.
- El instalador deja que `security` pida el token: sus valores no pasan por el proceso Node del instalador.
- Los errores HTTP conservan el estado, sin copiar el cuerpo de rechazo.
- El registro tapa formatos conocidos de código; no es un filtro general de cualquier secreto arbitrario.
- La creación del directorio de perfil solicita permisos 0700; el archivo de registro solicita 0600 al crearse.
- La validación del token, la caducidad y el uso único del código dependen de la api y del proxy de acceso.

Persistencia:

- Chrome conserva el perfil de cada fuente fuera del repositorio.
- El registro añade líneas con fecha ISO, nivel y mensaje; un fallo al escribir no interrumpe la lectura.
- No hay base de datos local ni cola persistente de reintentos de entregas.
- La desinstalación conserva los perfiles y el registro existentes.

## 7. Decisiones

| Decisión | Registro |
|---|---|
| Usar el Chrome instalado con perfiles dedicados | [0001](docs/decisions/0001-chrome-con-perfiles-dedicados.md) |
| Ejecutar y entregar cada fuente por separado | [0002](docs/decisions/0002-fuentes-independientes.md) |
| Mantener apagadas las alertas de LinkedIn | [0003](docs/decisions/0003-alertas-de-linkedin-desactivadas.md) |
| Validar el enlace como cadena exacta antes de actuar | [0004](docs/decisions/0004-validar-el-enlace-completo.md) |
| Leer Bumeran con una ventana visible | [0005](docs/decisions/0005-bumeran-con-ventana.md) |
| Leer LinkedIn desde la máquina de la persona | [0006](docs/decisions/0006-linkedin-desde-la-maquina.md) |
| Leer Bumeran desde la máquina de la persona | [0007](docs/decisions/0007-bumeran-desde-la-maquina.md) |
| Iniciar la lectura local solo por acción de la persona | [0008](docs/decisions/0008-lectura-local-iniciada-por-la-persona.md) |

No registrado aún:

- El motivo de elegir una app AppleScript y un esquema propio frente a otros mecanismos locales.
- El motivo de almacenar la credencial de servicio en el Llavero.
- El motivo de separar este lector en un repositorio propio.
- El motivo de elegir ocho minutos de espera y treinta segundos por petición.

## Anexo: evidencia

Los números de línea refieren al commit `b713101`. El texto de arriba no enlaza al código a propósito.

| Sección | Evidencia |
|---|---|
| 1. Propósito y metas | `package.json:5-11`, `src/main.ts:12-18`, `src/enlace.ts:5-14`, `src/corrida.ts:23-54`, `src/fuentes/linkedin-avisos.ts:54-84`, `src/fuentes/bumeran-avisos.ts:41-57`, `src/fuentes/bumeran.ts:114-127`, `src/fuentes/linkedin.ts:172-174`, `src/fuentes/linkedin.ts:219-224`, `src/fuentes/navegador.ts:65-75`, `src/instalador/app.ts:23-34`. Búsqueda de `createServer` y `.listen(` sin resultados en `src/`. |
| 2. Contexto | `src/enlace.ts:1-9`, `src/credenciales.ts:28-31`, `src/credenciales.ts:48-65`, `src/api.ts:32-62`, `src/fuentes/linkedin.ts:5-9`, `src/fuentes/linkedin.ts:176-206`, `src/fuentes/bumeran.ts:5-14`, `src/fuentes/bumeran.ts:129-148`, `src/instalador/cli.ts:25-47`, `src/instalador/app.ts:43-61`. Ninguna llamada directa al sitio público, a una base de datos o a un orquestador aparece en los clientes leídos. |
| 3. Bloques y reglas | `src/main.ts:8-18`, `src/enlace.ts:5-14`, `src/corrida.ts:27-67`, `src/api.ts:24-62`, `src/fuentes/linkedin.ts:180-193`, `src/fuentes/linkedin.ts:61-65`, `src/fuentes/linkedin.ts:219-224`, `src/fuentes/bumeran.ts:63-67`, `src/fuentes/bumeran.ts:129-148`, `src/fuentes/linkedin-avisos.ts:58-84`, `src/fuentes/bumeran-avisos.ts:45-68`, `src/fuentes/navegador.ts:53-75`, `src/registro.ts:15-33`, `src/instalador/app.ts:23-56`. |
| 4. Ejecución | `src/instalador/app.ts:23-34`, `src/main.ts:8-18`, `src/corrida.ts:7-10`, `src/corrida.ts:27-88`, `src/api.ts:36-43`, `src/fuentes/linkedin.ts:81-89`, `src/fuentes/linkedin.ts:151-167`, `src/fuentes/linkedin.ts:176-206`, `src/fuentes/linkedin.ts:247-255`, `src/fuentes/bumeran.ts:83-110`, `src/fuentes/bumeran.ts:114-148`. |
| 5. Despliegue | `package.json:4-20`, `tsconfig.json:3-8`, `src/instalador/cli.ts:11-12`, `src/instalador/cli.ts:25-47`, `src/instalador/app.ts:38-61`, `src/credenciales.ts:3-10`, `src/credenciales.ts:52-65`, `src/fuentes/navegador.ts:5-8`, `src/fuentes/navegador.ts:53-61`, `src/registro.ts:5-6`, `src/api.ts:22`, `src/corrida.ts:7-10`, `src/corrida.ts:51-66`, `src/fuentes/linkedin.ts:219-224`, `src/fuentes/bumeran.ts:5-14`, `test/api-local.test.ts:12-19`, `test/api-local.test.ts:50`. El árbol versionado no contiene workflows ni archivos de contenedor. |
| 6. Conceptos transversales | `src/api.ts:4-9`, `src/api.ts:32-69`, `src/tipos.ts:9-19`, `src/enlace.ts:5-14`, `src/credenciales.ts:34-45`, `src/credenciales.ts:48-65`, `src/instalador/app.ts:23-34`, `src/instalador/cli.ts:14-22`, `src/instalador/cli.ts:43-47`, `src/fuentes/linkedin.ts:81-84`, `src/fuentes/navegador.ts:5-8`, `src/fuentes/navegador.ts:53-70`, `src/registro.ts:5-33`, `src/corrida.ts:91-120`. No hay cola en disco ni purga del registro en los módulos de persistencia. |
| 7. Decisiones | `src/fuentes/navegador.ts:65-67`, `src/corrida.ts:53-54`, `src/fuentes/linkedin.ts:219-223`, `src/enlace.ts:5-9`, `src/fuentes/bumeran.ts:9-13`, `src/instalador/app.ts:23-34`, `src/instalador/cli.ts:25-39`, `src/corrida.ts:7-10`, `src/api.ts:22`, `src/main.ts:12-18`, `src/fuentes/linkedin.ts:41-55`, `src/fuentes/linkedin.ts:176-206`, `src/fuentes/bumeran.ts:44-57`, `src/fuentes/bumeran.ts:125-148`, `src/corrida.ts:23-31`. |
