# perfil-lector

> Lector local de ofertas de LinkedIn y Bumeran, iniciado mediante un enlace en macOS.

Lee desde la Mac de la persona las fuentes de ofertas que no se dejan leer desde el servidor y las entrega a la api
del perfil. Su código puede leer LinkedIn y Bumeran, sin que una espere a la otra.

Estado indicado por la persona el 2026-11-18: la api lee LinkedIn y Bumeran mediante Apify y no asigna
ninguna fuente a la máquina de la persona. El lector local permanece instalado y sin uso, a la espera de un uso futuro.

## Instalación

### Antes de instalar: lo que necesitas

macOS, Node.js 22.20 o superior, npm y Google Chrome instalado.
Necesitas la URL de la api y un token de servicio del proxy de acceso.
El paquete es privado y se instala desde este repositorio.

### Instalar el paquete

1. `npm ci`
2. `npm run instalar` — compila, crea la app del enlace `perfil-lector://` y guarda en el
   Llavero la URL de la api y el token de servicio de Cloudflare Access.
3. En el panel, «Conexiones» → «Leer desde mi máquina», si esa opción sigue disponible en su versión.

El lector implementa ese contrato de enlace; este repositorio no comprueba la interfaz actual del panel.

Nunca corras `playwright install chrome`: en macOS borra el Chrome instalado.

### Actualización

Tras actualizar el checkout, ejecuta `npm ci` y `npm run instalar`.
Reinstala también si cambia la ubicación de Node o del repositorio.

### Desinstalar

`npm run desinstalar` quita la app y las entradas del Llavero.
Los perfiles del navegador y el registro local permanecen.

### Plataformas

El instalador y el acceso al Llavero están implementados para macOS.

## Uso

### Qué hace una corrida

- Valida la dirección del enlace antes de nada. Si no es exactamente `perfil-lector://leer?corrida=<código>`, termina
  sin leer el Llavero, sin abrir Chrome y sin llamar a la api.
- Toma la URL de la api y el token solo del Llavero.
- Abre Google Chrome con un perfil propio por conexión.
- Si falta la sesión de LinkedIn, abre la ventana en el inicio de sesión y lee al terminar.
- Lee hasta el máximo que la api indique para cada fuente, entrega y termina. No postula ni escribe nada en LinkedIn.
- Bumeran se lee siempre en una ventana de Chrome que la persona ve abrirse y cerrarse: una sola carga de la búsqueda
  de avisos de tecnología más recientes, de la que solo se escucha lo que la propia página carga. Una verificación o
  un bloqueo detienen la lectura sin resolverlo.

LinkedIn lee recomendadas; sus alertas están desactivadas.
El registro local conserva cantidades y motivos, sin guardar el código de corrida ni cuerpos de las respuestas.
Las rutas y los límites están en [ARCHITECTURE.md](ARCHITECTURE.md).

### Pruebas

La guía de [desarrollo](docs/desarrollo.md) reúne los comandos de pruebas y la corrida contra una api local.

## Cómo funciona

La app recibe el enlace y lanza el lector local. Este valida la dirección, inicia la corrida en la api,
lee cada fuente por separado con Chrome, entrega sus resultados y solicita el cierre.

![Diagrama de contexto de perfil-lector](docs/architecture/context.svg)

La vista completa está en [ARCHITECTURE.md](ARCHITECTURE.md).

## Contribuir

Es un proyecto personal y privado: no se aceptan contribuciones externas. Para trabajar
en el código, ver [docs/desarrollo.md](docs/desarrollo.md).

## Licencia

No hay una licencia declarada en el manifiesto ni un archivo de licencia en este repositorio.
