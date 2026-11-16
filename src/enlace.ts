/** Esquema propio con el que el panel lanza el lector. */
export const ESQUEMA = 'perfil-lector';

/**
 * La única dirección admitida: ruta `leer` y un solo parámetro `corrida` con el código que emite la API
 * (32 bytes en base64url sin relleno). Se compara la cadena entera, sin decodificar ni normalizar nada,
 * para que comillas, `;`, `$()`, saltos de línea o un segundo parámetro no tengan por dónde entrar.
 */
const DIRECCION = /^perfil-lector:\/\/leer\?corrida=([A-Za-z0-9_-]{43})$/;

/** El código de la corrida, o null si la dirección no es exactamente la esperada. */
export function codigoDeEnlace(direccion: unknown): string | null {
  if (typeof direccion !== 'string') return null;
  return DIRECCION.exec(direccion)?.[1] ?? null;
}
