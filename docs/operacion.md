# Operación del lector local

Esta guía amplía los detalles remitidos desde [la arquitectura](../ARCHITECTURE.md).

## Alcance y metas complementarias

- Un aviso necesita título y descripción; Bumeran exige además su enlace visible.
- Una verificación se reporta con un motivo fijo.
- Los perfiles de sesión son persistentes.
- El recorrido de alertas de LinkedIn está implementado.

## Módulos y responsabilidades

- El código del enlace tiene 43 caracteres base64url.
- Los conversores recortan y deduplican en `src/fuentes/linkedin-avisos.ts` y `src/fuentes/bumeran-avisos.ts`.
- Los lectores están separados en `src/fuentes/linkedin.ts` y `src/fuentes/bumeran.ts`.
- El navegador distingue entre Chrome ausente y perfil ocupado.
- Los formatos que oculta el registro corresponden a códigos de corrida y JWT.

## Ejecución detallada

Un enlace inválido termina con código de salida 2.
Los plazos de sesión se indican en [configuración y límites](#configuración-y-límites).

Recuperación de sesión de LinkedIn:

1. Empieza sin ventana y comprueba que la cookie de sesión exista y no esté vacía.
2. Sin sesión, vuelve a abrir con ventana y espera el inicio de sesión manual.
3. Si una sesión existente caduca al navegar, permite un único nuevo inicio de sesión y repite la lectura.

LinkedIn escucha las respuestas de avisos.
Bumeran escucha la respuesta de la búsqueda y captura los enlaces visibles.
Los estados de ritmo, verificación o respuesta ilegible se convierten en motivos de catálogo.
Cada lector cierra su contexto en un bloque de finalización.

## Configuración y límites

| Qué | Detalle |
|---|---|
| Perfiles | `~/Library/Application Support/perfil-lector/`, con subcarpetas por fuente y sin opción de usuario. |
| Registro | `~/Library/Logs/perfil-lector/lector.log`, sin opción de usuario. |
| Vista del navegador | 1280 × 860. |
| Petición a la api | Plazo de 30 segundos por POST, fijado en el cliente. |
| Inicio de sesión | Hasta ocho minutos, dejando un minuto antes del vencimiento indicado por `venceEn`. |
| Máximo de avisos | Se expresa como `avisosMaximos` por fuente, sin un máximo fijo local de 25. |
| Búsqueda de Bumeran | La URL está fijada en el lector y corresponde a Perú. |

La constante de alertas de LinkedIn no es una opción de usuario.

Las pruebas opcionales contra una api local usan `PERFIL_API_LOCAL` y `PERFIL_API_TARGET`.
Estas variables solo ajustan las pruebas.
La desinstalación quita la app y las entradas del Llavero.

## Datos, seguridad y persistencia

Las cookies sí viajan al sitio que las usa.
Los perfiles conservan sesiones y caché.
El registro no muestra el contenido íntegro enviado.

Seguridad:

- El patrón del enlace exige una ruta exacta y un único parámetro con formato fijo.
- La app cita por separado Node, el script y la dirección en la orden de AppleScript.
- La URL admite HTTPS sin usuario, contraseña, consulta ni fragmento; HTTP solo en `localhost` o su dirección IPv4 convencional de bucle local.
- Las cabeceras del token son `CF-Access-Client-Id` y `CF-Access-Client-Secret`, enviadas hacia la URL configurada.
- La ocultación del registro no es un filtro general de cualquier secreto arbitrario.
- La creación del directorio de perfil solicita permisos 0700.
- El archivo de registro solicita permisos 0600 al crearse.

El registro añade líneas con fecha ISO, nivel y mensaje.
Un fallo al escribir no interrumpe la lectura.

## Otras decisiones

| Decisión | Registro |
|---|---|
| Mantener apagadas las alertas de LinkedIn | [0003](decisions/0003-alertas-de-linkedin-desactivadas.md) |
| Leer LinkedIn desde la máquina de la persona | [0006](decisions/0006-linkedin-desde-la-maquina.md) |
| Leer Bumeran desde la máquina de la persona | [0007](decisions/0007-bumeran-desde-la-maquina.md) |
