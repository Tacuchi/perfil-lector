---
status: accepted
date: 2026-11-18
---

# Validar el enlace como cadena exacta antes de actuar

Motivo tomado de `src/enlace.ts`, comentario del patrón `DIRECCION`, y `src/corrida.ts`, comentario de `correr`.

## Contexto y problema

La app recibe una dirección externa y la pasa al ejecutable. Hay que limitar su forma antes de cualquier efecto.

## Opciones consideradas

- Comparar la cadena completa sin normalizarla.
- Aceptar variantes mediante decodificación o normalización.

## Resultado de la decisión

Opción elegida: comparación exacta del esquema, ruta y único parámetro. El comentario explica que así no entran comillas, separadores, sustituciones, saltos de línea ni parámetros adicionales.

### Consecuencias

- El código tiene exactamente 43 caracteres base64url.
- Un enlace inválido no lee el Llavero ni contacta con Chrome o la api.
- La app pasa cada argumento con la forma citada de AppleScript.
