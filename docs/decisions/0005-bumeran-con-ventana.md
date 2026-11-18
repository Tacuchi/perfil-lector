---
status: accepted
date: 2026-11-18
---

# Leer Bumeran con una ventana visible

Motivo tomado de `src/fuentes/bumeran.ts`, comentario de `CON_VENTANA`.

## Contexto y problema

La página de Bumeran aplica protección frente a navegadores automatizados. El lector captura únicamente respuestas de la página de búsqueda.

## Opciones consideradas

- Abrir Chrome sin ventana.
- Abrir Chrome con una ventana visible.

## Resultado de la decisión

Opción elegida: Chrome con ventana. El comentario explica que la protección bloquea los navegadores sin ventana y que la persona ve la lectura.

### Consecuencias

- La ventana se abre y se cierra durante cada lectura.
- Una verificación o un bloqueo detienen la lectura sin resolverse.
- Solo se consume lo que carga la propia búsqueda.
