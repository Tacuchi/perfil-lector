---
status: accepted
date: 2026-11-18
---

# Iniciar la lectura local solo por acción de la persona

Motivo dado por la persona el 2026-11-18, al confirmar el que consta en la spec 006 — conexiones-de-fuentes del proyecto.

## Contexto y problema

El lector local se ejecuta en la máquina de la persona. Había que decidir qué inicia sus lecturas.

## Opciones consideradas

- Ejecutar lecturas locales automáticamente.
- Ejecutarlas cuando la persona inicia el lector desde el panel.

## Resultado de la decisión

Opción elegida: ejecutar la lectura local cuando la persona la inicia desde el panel. La spec recoge su motivo: con su máquina apagada, o sin su acción, solo corre lo que el servidor puede leer.

### Consecuencias

- El instalador registra una app que recibe enlaces; no instala un servicio programado.
- La app lanza el lector con la dirección recibida y termina enseguida.
- El ejecutable procesa una corrida y devuelve su código de salida.
- Un enlace inválido termina antes de leer el Llavero, abrir Chrome o llamar a la api.
