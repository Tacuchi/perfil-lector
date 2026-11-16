import type { Credenciales } from './credenciales.js';
import type { CorridaIniciada, FalloMaquina, OfertaEntregada } from './tipos.js';

/** La API respondió con un estado de rechazo. Nunca guarda el cuerpo: puede repetir lo enviado. */
export class ApiRechazo extends Error {
  override name = 'ApiRechazo';
  constructor(readonly estado: number) {
    super(`la API rechazó la petición (HTTP ${estado})`);
  }
}

export class ApiInalcanzable extends Error {
  override name = 'ApiInalcanzable';
  constructor() {
    super('la API no responde desde esta máquina');
  }
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) =>
  Promise<{ status: number; json(): Promise<unknown> }>;

const PLAZO_PETICION_MS = 30_000;

/** Las cuatro rutas del lector. El código de la corrida solo viaja en el cuerpo. */
export class ClienteApi {
  constructor(
    private readonly credenciales: Credenciales,
    private readonly codigo: string,
    private readonly hacerFetch: Fetch = fetch as unknown as Fetch,
  ) {}

  async iniciar(): Promise<CorridaIniciada> {
    return (await this.enviar('/api/lector/corrida/iniciar', { codigo: this.codigo })) as CorridaIniciada;
  }

  /** false si la API manda no leer esa fuente (409: pausada o sin lecturas hoy). */
  async empezar(fuente: string): Promise<boolean> {
    try {
      await this.enviar(`/api/lector/corrida/fuentes/${fuente}/empezar`, { codigo: this.codigo });
      return true;
    } catch (e) {
      if (e instanceof ApiRechazo && e.estado === 409) return false;
      throw e;
    }
  }

  async entregar(fuente: string, entrega: { ofertas?: OfertaEntregada[]; fallo?: FalloMaquina }): Promise<void> {
    await this.enviar(`/api/lector/corrida/fuentes/${fuente}/entregar`, { codigo: this.codigo, ...entrega });
  }

  async terminar(): Promise<void> {
    await this.enviar('/api/lector/corrida/terminar', { codigo: this.codigo });
  }

  private async enviar(ruta: string, cuerpo: object): Promise<unknown> {
    let respuesta: { status: number; json(): Promise<unknown> };
    try {
      respuesta = await this.hacerFetch(`${this.credenciales.apiUrl}${ruta}`, {
        method: 'POST',
        headers: { ...this.credenciales.identidad, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(PLAZO_PETICION_MS),
      });
    } catch {
      throw new ApiInalcanzable();
    }
    if (respuesta.status === 204) return null;
    if (respuesta.status < 200 || respuesta.status >= 300) throw new ApiRechazo(respuesta.status);
    return await respuesta.json();
  }
}
