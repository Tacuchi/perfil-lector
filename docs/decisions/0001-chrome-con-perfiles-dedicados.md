---
status: accepted
date: 2026-11-18
---

# Usar el Chrome instalado con perfiles dedicados

Motivo tomado de `src/fuentes/navegador.ts`, comentario de `abrirChrome`.

## Contexto y problema

Los lectores conservan sesiones en perfiles de cada conexión. Había que elegir qué navegador los abre.

## Opciones consideradas

- Abrir el perfil con el Chrome instalado.
- Reutilizar el perfil con otro binario.

## Resultado de la decisión

Opción elegida: Chrome real, sin respaldo en otro navegador. El comentario explica que otro binario puede dañar el perfil creado por Chrome.

### Consecuencias

- Google Chrome debe estar instalado.
- Un perfil ocupado produce un fallo local antes de consultar el sitio.
- Cada fuente conserva un perfil propio.
