---
status: accepted
date: 2026-11-18
---

# Ejecutar y entregar cada fuente por separado

Motivo tomado de `src/corrida.ts`, comentario anterior a `Promise.allSettled`.

## Contexto y problema

LinkedIn puede necesitar que la persona inicie sesión. Esa espera afecta a una sola fuente.

## Opciones consideradas

- Esperar una fuente antes de iniciar la siguiente.
- Leer y entregar cada fuente de forma independiente.

## Resultado de la decisión

Opción elegida: lecturas independientes con `Promise.allSettled`. El comentario explica que una espera de inicio de sesión no debe frenar a las demás fuentes.

### Consecuencias

- Bumeran puede entregar antes que LinkedIn.
- El cierre general espera que terminen las tareas de las fuentes.
