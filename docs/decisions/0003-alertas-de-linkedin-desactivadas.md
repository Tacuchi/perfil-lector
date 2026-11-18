---
status: accepted
date: 2026-11-18
---

# Mantener apagadas las alertas de LinkedIn

Motivo tomado de `src/fuentes/linkedin.ts`, comentario de `LEER_ALERTAS`.

## Contexto y problema

La conversión exige la descripción completa del aviso. El recorrido de alertas existe en el código.

## Opciones consideradas

- Leer alertas y recomendadas.
- Mantener únicamente recomendadas en el recorrido predeterminado.

## Resultado de la decisión

Opción elegida: alertas desactivadas. El comentario explica que su página de resultados no deja leer el detalle y no se entregan avisos sin descripción.

### Consecuencias

- El recorrido predeterminado lee recomendadas.
- La función de extracción de alertas no implica que la función esté activa.
