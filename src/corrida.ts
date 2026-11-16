import { ApiInalcanzable, ApiRechazo, ClienteApi, type Fetch } from './api.js';
import { codigoDeEnlace } from './enlace.js';
import { CredencialesAusentes, type Credenciales } from './credenciales.js';
import type { Registro } from './registro.js';
import type { FuenteMaquina, LectorDeFuente, Resultado } from './tipos.js';

/** Espera máxima del inicio de sesión, siempre dentro del plazo total de la corrida. */
export const ESPERA_SESION_MS = 8 * 60_000;
/** Margen para entregar y terminar antes de que la API cierre la corrida. */
const MARGEN_ENTREGA_MS = 60_000;

export type Salida = 'terminada' | 'enlace-invalido' | 'sin-credenciales' | 'codigo-rechazado' | 'api-inalcanzable' | 'fallo';

export interface Dependencias {
  credenciales: () => Promise<Credenciales>;
  /** Un lector por fuente de la máquina; una fuente sin lector se registra y no se lee. */
  lectores: Partial<Record<FuenteMaquina, () => LectorDeFuente>>;
  registro: Registro;
  fetch?: Fetch;
  ahora?: () => number;
}

/**
 * Una corrida completa a partir de la dirección que recibió la app del enlace. La dirección se valida antes que
 * nada: si no es exactamente la esperada, no se lee el Llavero, no se abre Chrome y no se llama a la API.
 */
export async function correr(direccion: unknown, dep: Dependencias): Promise<Salida> {
  const codigo = codigoDeEnlace(direccion);
  if (codigo === null) {
    dep.registro.error('dirección rechazada: no es un enlace de corrida válido');
    return 'enlace-invalido';
  }
  let credenciales: Credenciales;
  try {
    credenciales = await dep.credenciales();
  } catch (e) {
    dep.registro.error(e instanceof CredencialesAusentes ? e.message : 'no se pudo leer el Llavero');
    return 'sin-credenciales';
  }
  const api = new ClienteApi(credenciales, codigo, dep.fetch);
  const ahora = dep.ahora ?? Date.now;

  let corrida;
  try {
    corrida = await api.iniciar();
  } catch (e) {
    return salidaDeError(e, dep.registro, 'al iniciar');
  }
  dep.registro.info(`corrida iniciada: ${corrida.fuentes.length} conexiones a leer`);

  const vence = Date.parse(corrida.venceEn);
  const esperaSesionHasta = Math.min(ahora() + ESPERA_SESION_MS, vence - MARGEN_ENTREGA_MS);
  // Cada fuente lee y entrega por su cuenta: una que espera el inicio de sesión no frena a las demás.
  const entregas = await Promise.allSettled(corrida.fuentes.map(async ({ fuente, avisosMaximos }) => {
      const crear = dep.lectores[fuente as FuenteMaquina];
      if (crear === undefined) {
        dep.registro.error(`${fuente}: este lector no sabe leerla`);
        return;
      }
      const lector = crear();
      let avisada = false;
      let resultado: Resultado;
      try {
        resultado = await lector.leer({
          avisosMaximos,
          esperaSesionHasta,
          avisar: async () => (avisada = await api.empezar(fuente)),
        });
      } catch (e) {
        dep.registro.error(`${fuente}: la lectura falló (${nombreDe(e)})`);
        // Ya consultó el sitio sin traer nada legible: es un fallo, nunca un día sin ofertas.
        resultado = avisada ? { tipo: 'fallo', fallo: 'VACIA' } : { tipo: 'local', motivo: 'la lectura falló antes de empezar' };
      }
      await entregar(api, fuente, resultado, avisada, dep.registro);
    }));
  const fallida = entregas.find((e) => e.status === 'rejected');
  if (fallida !== undefined) {
    const salida = salidaDeError(fallida.reason, dep.registro, 'al entregar');
    await api.terminar().catch(() => {});
    return salida;
  }
  try {
    await api.terminar();
  } catch (e) {
    return salidaDeError(e, dep.registro, 'al terminar');
  }
  dep.registro.info('corrida terminada');
  return 'terminada';
}

async function entregar(api: ClienteApi, fuente: string, resultado: Resultado, avisada: boolean, registro: Registro): Promise<void> {
  switch (resultado.tipo) {
    case 'avisos':
      await api.entregar(fuente, { ofertas: resultado.ofertas });
      registro.info(`${fuente}: ${resultado.ofertas.length} avisos entregados`);
      return;
    case 'fallo':
      if (!avisada) return;
      await api.entregar(fuente, { fallo: resultado.fallo });
      registro.info(`${fuente}: fallo ${resultado.fallo} entregado`);
      return;
    case 'local':
      registro.error(`${fuente}: ${resultado.motivo}`);
      return;
    case 'omitida':
      registro.info(`${fuente}: la API la mandó no leer en esta corrida`);
      return;
  }
}

function salidaDeError(e: unknown, registro: Registro, cuando: string): Salida {
  if (e instanceof ApiInalcanzable) {
    registro.error(`${e.message} (${cuando})`);
    return 'api-inalcanzable';
  }
  if (e instanceof ApiRechazo) {
    registro.error(`${e.message} (${cuando})`);
    return e.estado === 401 || e.estado === 403 ? 'codigo-rechazado' : 'fallo';
  }
  registro.error(`fallo inesperado ${cuando} (${nombreDe(e)})`);
  return 'fallo';
}

const nombreDe = (e: unknown): string => (e instanceof Error ? e.name : typeof e);
