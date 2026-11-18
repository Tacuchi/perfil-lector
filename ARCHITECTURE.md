# Arquitectura de perfil-lector

Revisado el 2026-11-18 contra la versión 0.1.0 (commit `b713101`).

Este documento describe el lector local: sus procesos, interfaces, datos y reglas.
No describe la implementación del panel, la api ni su infraestructura.
Los valores son predeterminados o condiciones del código; no son mediciones de una instalación.

- Qué es: un lector local de ofertas de LinkedIn y Bumeran.
- Quién lo usa: la persona, desde su Mac, mediante un enlace de corrida.
- Con qué habla: la api, el proxy de acceso y las páginas abiertas en Chrome.
- Dónde guarda datos: Llavero, perfiles de Chrome y registro local; avisos en memoria.
- Regla principal: validar el enlace completo antes de acceder al Llavero o a la api.

## 1. Propósito y metas de calidad

El lector recibe un enlace, obtiene credenciales del Llavero y entrega avisos a la api.
Cada fuente trabaja independientemente y el proceso termina tras cerrar la corrida.

Estado indicado por la persona el 2026-11-18: la api lee ambas fuentes mediante Apify, sin asignarlas a la máquina.
El lector permanece instalado y sin uso, a la espera de un uso futuro.

Qué no es:

- Un servidor HTTP: recibe un argumento, sin abrir puertos.
- Un servicio programado: registra una app de enlaces, sin agente permanente.
- Un cliente para postular: solo recoge respuestas de las páginas.

| Meta | Escenario |
|---|---|
| Rechazar enlaces inesperados | Una dirección fuera del patrón termina antes del Llavero, Chrome y la api. |
| Independencia de fuentes | Bumeran puede entregar mientras LinkedIn espera el inicio de sesión. |
| Entregar información completa | Se descartan avisos incompletos según los [criterios de cada fuente](docs/operacion.md#alcance-y-metas-complementarias). |

La [guía de operación](docs/operacion.md#alcance-y-metas-complementarias) detalla bloqueos, protección de sesiones y alertas desactivadas.

## 2. Contexto y alcance

![Diagrama de contexto de perfil-lector](docs/architecture/context.svg)

[Versión interactiva](https://tacuchi.github.io/perfil-lector/architecture/context.html).

| Interfaz externa | Dirección | Cuándo ocurre |
|---|---|---|
| Panel y macOS | Entrante, enlace local | Entrega `perfil-lector://leer?corrida=<código>`, con el panel identificado como lanzador en un comentario. |
| Llavero de macOS | Local | Tras validar la dirección, lee la URL de la api y el token de servicio. |
| API | Saliente, POST JSON | Inicia, avisa el comienzo por fuente, entrega y termina. |
| Proxy de acceso | Saliente, cabeceras | Recibe el identificador y el secreto del token en cada petición; su validación es externa. |
| LinkedIn | Saliente, Chrome y HTTPS | Lee recomendadas y abre el inicio de sesión si falta o caduca. |
| Bumeran | Saliente, Chrome visible y HTTPS | Carga una búsqueda de tecnología, con avisos recientes primero. |
| Herramientas de macOS | Local | Compilan, firman y registran la app, y guardan o quitan credenciales. |

El código demuestra el enlace y las peticiones; comprobar el botón actual y el proxy exige verificar esos sistemas.
El lector no conecta con el sitio público, la base de datos ni el orquestador.

## 3. Bloques de construcción

![Diagrama de contenedores de perfil-lector](docs/architecture/containers.svg)

[Versión interactiva](https://tacuchi.github.io/perfil-lector/architecture/containers.html).

| Bloque | Responsabilidad | Código |
|---|---|---|
| Entrada y validación | Valida el primer argumento y devuelve el código de salida. | `src/main.ts`, `src/enlace.ts` |
| Coordinador | Inicia la corrida y ejecuta fuentes con `Promise.allSettled`. | `src/corrida.ts` |
| Credenciales y cliente | Lee el Llavero y envía cuatro familias de POST. | `src/credenciales.ts`, `src/api.ts` |
| Lectores y conversores | Capturan respuestas, clasifican fallos y normalizan los avisos. | `src/fuentes/` |
| Navegador | Abre Chrome con un perfil dedicado. | `src/fuentes/navegador.ts` |
| Registro | Añade mensajes y oculta formatos conocidos de códigos. | `src/registro.ts` |
| Instalador | Crea la app AppleScript, registra el esquema y configura el Llavero. | `src/instalador/` |

El [detalle por módulo](docs/operacion.md#módulos-y-responsabilidades) precisa validación, conversiones y fallos del navegador.

Reglas que no se rompen:

- La dirección se valida antes de leer credenciales o contactar con la api.
- El código de corrida va en JSON, nunca añadido a la ruta.
- Cada fuente pide permiso antes de navegar; un 409 omite esa lectura.
- Chrome puede abrirse antes del permiso; abrir el perfil no inicia la lectura del sitio.
- Se capturan peticiones de la página, sin fabricar consultas de datos.
- Bumeran siempre abre ventana y no resuelve verificaciones.
- Un aviso incompleto no se entrega como válido.
- Las alertas de LinkedIn están desactivadas por una constante.

## 4. Vista de ejecución

Corrida iniciada mediante enlace:

1. macOS entrega la dirección a la app, que lanza Node en segundo plano y termina.
2. Node valida el enlace, lee tres entradas del Llavero y comprueba la URL.
3. Inicia la corrida y recibe fuentes, máximos y vencimiento para acotar el inicio de sesión.
4. Ejecuta fuentes en paralelo: abren sus perfiles y piden permiso antes de navegar.
5. Cada fuente autorizada entrega avisos o un fallo de catálogo; cada lector cierra su contexto al finalizar.
6. Pide terminar tras las entregas; una entrega rechazada también provoca un intento de cierre.
7. Registra el resultado y devuelve el código de salida.

La [ejecución detallada](docs/operacion.md#ejecución-detallada) describe los códigos y plazos, la recuperación de sesión de LinkedIn y la captura en Bumeran.

## 5. Vista de despliegue

| Qué | Por defecto | Cuándo aplica | Cómo cambiarlo |
|---|---|---|---|
| Plataforma | macOS | Instalación y operación | No hay otro instalador. |
| Runtime | Node.js 22.20 o superior | Compilar y ejecutar | Usar una versión compatible con el manifiesto. |
| App | `~/Applications/PerfilLector.app` | Tras `npm run instalar` | El instalador fija el destino. |
| Rutas ejecutables | Absolutas, capturadas al instalar | Al abrir enlaces | Reinstalar tras mover Node o el checkout. |
| URL de la api | Ninguna | Al instalar | Repetir `npm run instalar`. |
| Credenciales | Tres entradas del servicio `perfil-lector` | En cada corrida | El instalador actualiza el Llavero. |
| Navegador | Google Chrome instalado | Durante la lectura | No hay respaldo en Chromium descargado. |

Las rutas de datos, límites, fuentes y ajustes de pruebas están en [configuración y límites](docs/operacion.md#configuración-y-límites).
Requiere npm y herramientas de macOS, además de Node y Chrome.
El paquete privado compila TypeScript hacia `dist/`; el instalador accede al Llavero y registra el enlace en LaunchServices.
No hay workflows versionados, contenedor ni servicio permanente.
La desinstalación conserva perfiles y registros; la guía detalla sus efectos.

## 6. Conceptos transversales

Datos y privacidad:

| Pregunta | Respuesta |
|---|---|
| ¿Qué sale y a dónde? | A la api, código, fuente y avisos o fallo; al proxy, token; a cada sitio, peticiones y sesión. |
| ¿Qué nunca sale? | Las entregas a la api excluyen cookies y perfiles; los errores excluyen cuerpos externos. |
| ¿Cuándo ocurre? | Durante corridas por enlace validado; la lectura espera permiso de la api. |
| ¿Dónde se guarda y cuánto? | Llavero, perfiles y registro sin purga ni rotación; avisos convertidos en memoria hasta entregarse. |
| ¿Cómo se ve lo enviado? | Sin auditoría JSON; el registro muestra cantidades, motivos fijos y resultados. |
| ¿Cómo se apaga? | Evitar nuevos enlaces o desinstalar; esto no detiene expresamente procesos ya lanzados. |

La guía precisa [datos, seguridad y persistencia](docs/operacion.md#datos-seguridad-y-persistencia), incluidos permisos, cabeceras y validación de URL.
El token, la caducidad y el uso único del código se validan fuera del lector.
El instalador deja que `security` pida el token, sin pasarlo por Node.
Los errores HTTP conservan el estado sin copiar el cuerpo de rechazo.
Chrome conserva perfiles por fuente fuera del repositorio; no hay base local ni cola persistente de reintentos.

## 7. Decisiones

Los ocho registros permanecen en [docs/decisions/](docs/decisions/); las [otras decisiones](docs/operacion.md#otras-decisiones) conservan su índice.
Las cinco principales:

| Decisión | Registro |
|---|---|
| Chrome instalado con perfiles dedicados | [0001](docs/decisions/0001-chrome-con-perfiles-dedicados.md) |
| Ejecutar y entregar fuentes separadamente | [0002](docs/decisions/0002-fuentes-independientes.md) |
| Validar el enlace completo antes de actuar | [0004](docs/decisions/0004-validar-el-enlace-completo.md) |
| Bumeran con ventana visible | [0005](docs/decisions/0005-bumeran-con-ventana.md) |
| Lectura local solo por acción de la persona | [0008](docs/decisions/0008-lectura-local-iniciada-por-la-persona.md) |

No registrado aún:

- Por qué elegir AppleScript y esquema propio frente a otros mecanismos locales.
- Por qué guardar la credencial de servicio en el Llavero.
- Por qué separar el lector en un repositorio propio.
- Por qué esperar ocho minutos para sesión y treinta segundos por petición.

## Anexo: evidencia

Los números de línea refieren al commit `b713101`. El texto de arriba no enlaza al código a propósito.

| Sección | Evidencia |
|---|---|
| 1. Propósito y metas | `src/main.ts:12-18`, `src/corrida.ts:23-54`, `src/fuentes/linkedin-avisos.ts:54-84`, `src/fuentes/bumeran-avisos.ts:41-57`, `src/fuentes/bumeran.ts:114-127`. Búsqueda de `createServer` y `.listen(` sin resultados en `src/`. |
| 2. Contexto | `src/enlace.ts:1-9`, `src/credenciales.ts:28-31`, `src/api.ts:32-62`, `src/fuentes/linkedin.ts:176-206`, `src/fuentes/bumeran.ts:129-148`. Ninguna llamada directa al sitio público, a una base de datos o a un orquestador aparece en los clientes leídos. |
| 3. Bloques y reglas | `src/enlace.ts:5-14`, `src/corrida.ts:27-67`, `src/api.ts:24-62`, `src/fuentes/linkedin.ts:219-224`, `src/fuentes/bumeran.ts:63-67`. |
| 4. Ejecución | `src/instalador/app.ts:23-34`, `src/main.ts:8-18`, `src/corrida.ts:27-88`, `src/fuentes/linkedin.ts:176-206`, `src/fuentes/bumeran.ts:114-148`. |
| 5. Despliegue | `package.json:4-20`, `tsconfig.json:3-8`, `src/instalador/cli.ts:25-47`, `src/instalador/app.ts:38-61`, `src/credenciales.ts:3-10`. El árbol versionado no contiene workflows ni archivos de contenedor. |
| 6. Conceptos transversales | `src/api.ts:32-69`, `src/credenciales.ts:34-45`, `src/fuentes/navegador.ts:53-70`, `src/registro.ts:5-33`, `src/corrida.ts:91-120`. No hay cola en disco ni purga del registro en los módulos de persistencia. |
| 7. Decisiones | `src/fuentes/navegador.ts:65-67`, `src/corrida.ts:53-54`, `src/enlace.ts:5-9`, `src/fuentes/bumeran.ts:9-13`, `src/main.ts:12-18`. |
