# Desarrollo

## Pruebas

- `npm test`
- Corrida contra la api local (`./mvnw spring-boot:test-run` en perfil-api):
  `PERFIL_API_LOCAL=http://localhost:8080 PERFIL_API_TARGET=<perfil-api>/target npm test`

La api local debe estar iniciada aparte. El segundo comando corresponde al repositorio de la api.
Las pruebas opcionales requieren las dos variables; sin ellas, ese grupo se omite.
LinkedIn y Bumeran se simulan con respuestas guardadas; no necesitan los perfiles reales de Chrome.

## Compilar e instalar

`npm run build` compila TypeScript en `dist/`.
`npm run instalar` compila y ejecuta el instalador de macOS.
`npm run desinstalar` requiere que el instalador compilado siga disponible.

La app captura las rutas absolutas de Node y del lector al instalarse.
Si alguna cambia, vuelve a ejecutar el instalador.
La configuración y los datos locales se detallan en [la arquitectura](../ARCHITECTURE.md).
