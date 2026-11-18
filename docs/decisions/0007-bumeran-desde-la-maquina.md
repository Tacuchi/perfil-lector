---
status: accepted
date: 2026-11-18
---

# Leer Bumeran desde la máquina de la persona

Motivo dado por la persona el 2026-11-18, al confirmar el que consta en el plan 005 — conexiones-de-fuentes del proyecto.

## Contexto y problema

La página de un aviso de Bumeran carga sus datos con su propio código. Había que decidir desde dónde obtenerlos.

## Opciones consideradas

- Obtener los datos desde el servidor sin navegador.
- Leer Bumeran desde la máquina de la persona, con lo que carga la página.

## Resultado de la decisión

Opción elegida: leer Bumeran desde la máquina de la persona, solo con lo que carga la propia página. El plan explica que la prueba del 2026-11-15 recibió un 403 de Cloudflare al pedir los datos sin navegador. Por eso la lectura pasa a la máquina de la persona, como preveía la spec.

### Consecuencias

- El lector abre Chrome con ventana y un perfil dedicado de Bumeran.
- Carga una sola búsqueda de tecnología, con los avisos más recientes primero.
- Convierte las respuestas capturadas y las enlaza con los avisos visibles en la página.
- Una verificación detiene la lectura sin resolverse; el contexto de Chrome se cierra al terminar.
