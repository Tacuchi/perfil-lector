import type { Fetch } from '../../src/api.js';
import type { Registro } from '../../src/registro.js';

export interface Llamada { ruta: string; cuerpo: Record<string, unknown>; cabeceras: Record<string, string> }

/** API simulada con las cuatro rutas del lector. `responder` decide el estado de cada ruta. */
export function apiSimulada(responder: (ruta: string) => { status: number; cuerpo?: unknown } = () => ({ status: 200 })) {
  const llamadas: Llamada[] = [];
  const hacerFetch: Fetch = async (url, init) => {
    const ruta = new URL(url).pathname;
    llamadas.push({ ruta, cuerpo: JSON.parse(init.body) as Record<string, unknown>, cabeceras: init.headers });
    const r = ruta.endsWith('/iniciar') && responder(ruta).cuerpo === undefined
      ? { status: 200, cuerpo: { fuentes: [{ fuente: 'LINKEDIN', nombre: 'LinkedIn', avisosMaximos: 25 }], venceEn: new Date(Date.now() + 15 * 60_000).toISOString() } }
      : responder(ruta);
    return { status: r.status, json: async () => r.cuerpo ?? {} };
  };
  return { llamadas, hacerFetch };
}

export function registroEnMemoria(): Registro & { lineas: string[] } {
  const lineas: string[] = [];
  return { lineas, info: (m) => lineas.push(`INFO ${m}`), error: (m) => lineas.push(`ERROR ${m}`) };
}
