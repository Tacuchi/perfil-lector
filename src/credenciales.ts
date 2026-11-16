import { execFile } from 'node:child_process';

/** Servicio del Llavero de macOS bajo el que el instalador guarda las credenciales del lector. */
export const SERVICIO_LLAVERO = 'perfil-lector';

export const CUENTAS = {
  apiUrl: 'api-url',
  tokenId: 'access-client-id',
  tokenSecreto: 'access-client-secret',
} as const;

export type Cuenta = (typeof CUENTAS)[keyof typeof CUENTAS];

export interface Credenciales {
  /** Base de la API, sin barra final. */
  apiUrl: string;
  /** Cabeceras que identifican al lector ante la API. */
  identidad: Record<string, string>;
}

export class CredencialesAusentes extends Error {
  override name = 'CredencialesAusentes';
}

/** Lee una entrada del Llavero; null si no existe. */
export type LeerLlavero = (cuenta: Cuenta) => Promise<string | null>;

export const leerLlaveroReal: LeerLlavero = (cuenta) =>
  new Promise((resolver) => {
    execFile('/usr/bin/security', ['find-generic-password', '-s', SERVICIO_LLAVERO, '-a', cuenta, '-w'],
      (error, salida) => resolver(error ? null : salida.trim() || null));
  });

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** https, o http solo hacia la propia máquina (la API local de las pruebas). */
export function apiUrlValida(valor: string): boolean {
  const sinBarra = valor.replace(/\/+$/, '');
  if (LOOPBACK.test(sinBarra)) return true;
  try {
    const url = new URL(sinBarra);
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

/**
 * Las credenciales salen solo del Llavero: la URL de la API y el token de servicio de Cloudflare Access.
 * Cloudflare cambia ese token por su código firmado antes de llegar a la API.
 */
export async function credencialesDelLlavero(leer: LeerLlavero = leerLlaveroReal): Promise<Credenciales> {
  const [apiUrl, tokenId, tokenSecreto] = await Promise.all([
    leer(CUENTAS.apiUrl), leer(CUENTAS.tokenId), leer(CUENTAS.tokenSecreto),
  ]);
  if (apiUrl === null || tokenId === null || tokenSecreto === null) {
    throw new CredencialesAusentes('faltan credenciales del lector en el Llavero: corre «npm run instalar»');
  }
  if (!apiUrlValida(apiUrl)) {
    throw new CredencialesAusentes('la URL de la API guardada en el Llavero no es https: corre «npm run instalar»');
  }
  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    identidad: { 'CF-Access-Client-Id': tokenId, 'CF-Access-Client-Secret': tokenSecreto },
  };
}
