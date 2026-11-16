import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Registro local del lector, fuera de cualquier repositorio. */
export const ARCHIVO_REGISTRO = join(homedir(), 'Library', 'Logs', 'perfil-lector', 'lector.log');

const CODIGO = /[A-Za-z0-9_-]{43}/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

/**
 * Tapa cualquier cosa con forma de código de corrida o de código firmado. Los mensajes ya salen de textos
 * propios; esto es la segunda barrera por si un error de una librería arrastra uno.
 */
export function enmascarar(texto: string): string {
  return texto.replace(JWT, '[código]').replace(CODIGO, '[código]');
}

export interface Registro {
  info(mensaje: string): void;
  error(mensaje: string): void;
}

export function registroEnArchivo(archivo: string = ARCHIVO_REGISTRO): Registro {
  const escribir = (nivel: string, mensaje: string): void => {
    try {
      mkdirSync(dirname(archivo), { recursive: true });
      appendFileSync(archivo, `${new Date().toISOString()} ${nivel} ${enmascarar(mensaje)}\n`, { mode: 0o600 });
    } catch {
      // Sin dónde escribir, el lector sigue: el registro no puede ser el motivo de un fallo.
    }
  };
  return { info: (m) => escribir('INFO', m), error: (m) => escribir('ERROR', m) };
}
