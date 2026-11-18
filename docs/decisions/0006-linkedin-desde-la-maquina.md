---
status: accepted
date: 2026-11-18
---

# Leer LinkedIn desde la máquina de la persona

Motivo dado por la persona el 2026-11-18, al confirmar el que consta en la spec 006 — conexiones-de-fuentes del proyecto.

## Contexto y problema

La lectura de LinkedIn necesita la sesión de la persona. Había que decidir desde dónde usarla.

## Opciones consideradas

- Leer LinkedIn desde el servidor.
- Leer LinkedIn desde la máquina de la persona.

## Resultado de la decisión

Opción elegida: leer LinkedIn desde la máquina de la persona. La spec explica que LinkedIn invalida una sesión usada desde un centro de datos. La persona inicia sesión cuando hace falta.

### Consecuencias

- El lector abre el Chrome instalado con un perfil dedicado de LinkedIn.
- Si falta la sesión, abre una ventana para que la persona inicie sesión.
- Si una sesión existente caduca al navegar, permite un nuevo inicio de sesión y repite la lectura una vez.
- Entrega los avisos a la api y cierra el contexto de Chrome al terminar.
