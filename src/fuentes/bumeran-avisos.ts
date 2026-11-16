import type { Modalidad, OfertaEntregada } from '../tipos.js';

/*
 * Conversión de las respuestas de búsqueda que carga la propia página de Bumeran. Cada respuesta trae sus avisos
 * en `content`, con título, empresa, ubicación, modalidad y descripción, pero sin enlace: el enlace al aviso es el
 * que la misma página muestra, emparejado por el número del aviso. Un campo ausente queda en null.
 */

export const ORIGEN_BUMERAN = 'https://www.bumeran.com.pe';

/** Ruta de un aviso en la página: `/empleos/<título y empresa>-<número>.html`. */
const RUTA_AVISO = /^\/empleos\/[^/]+-(\d+)\.html$/;
/** Fecha de publicación como la informa el sitio, en hora de Lima: `dd-MM-yyyy HH:mm:ss`. */
const FECHA = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

const MODALIDADES: Record<string, Modalidad> = { remoto: 'REMOTO', hibrido: 'HIBRIDO', presencial: 'PRESENCIAL' };

type Entidad = Record<string, unknown>;

const objeto = (v: unknown): Entidad => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Entidad) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const recortar = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, max));

/** Enlace de cada aviso por su número, solo los del propio sitio y sin parámetros. */
export function enlacesPorAviso(hrefs: string[]): Map<string, string> {
  const porId = new Map<string, string>();
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href, ORIGEN_BUMERAN);
    } catch {
      continue;
    }
    const id = url.origin === ORIGEN_BUMERAN ? RUTA_AVISO.exec(url.pathname)?.[1] : undefined;
    if (id !== undefined && !porId.has(id)) porId.set(id, `${ORIGEN_BUMERAN}${url.pathname}`);
  }
  return porId;
}

/**
 * Los avisos de las respuestas, en orden y hasta `maximo`. Un aviso sin título, sin descripción o sin su enlace
 * en la página no se entrega: la API exige los tres.
 */
export function avisosDeBumeran(cuerpos: unknown[], hrefs: string[], maximo: number): OfertaEntregada[] {
  const enlaces = enlacesPorAviso(hrefs);
  const ofertas: OfertaEntregada[] = [];
  for (const cuerpo of cuerpos) {
    for (const item of lista(objeto(cuerpo)['content'])) {
      if (ofertas.length >= maximo) return ofertas;
      const aviso = objeto(item);
      const id = typeof aviso['id'] === 'number' || typeof aviso['id'] === 'string' ? String(aviso['id']) : null;
      const titulo = texto(aviso['titulo']);
      const descripcion = texto(aviso['detalle']);
      const url = id === null ? undefined : enlaces.get(id);
      if (id === null || titulo === null || descripcion === null || url === undefined) continue;
      if (ofertas.some((o) => o.idExterno === id)) continue;
      const empresa = aviso['confidencial'] === true ? null : texto(aviso['empresa']);
      const ubicacion = texto(aviso['localizacion']);
      ofertas.push({
        idExterno: id,
        titulo: recortar(titulo, 500),
        empresa: empresa === null ? null : recortar(empresa, 300),
        publicadaEn: fechaDe(aviso['fechaHoraPublicacion']),
        ubicacion: ubicacion === null ? null : recortar(ubicacion, 500),
        modalidad: modalidadDe(aviso['modalidadTrabajo']),
        descripcion: recortar(descripcion, 100_000),
        url,
      });
    }
  }
  return ofertas;
}

function fechaDe(v: unknown): string | null {
  const m = FECHA.exec(texto(v) ?? '');
  if (m === null) return null;
  const [, dia, mes, anio, h, min, s] = m;
  const fecha = new Date(`${anio}-${mes}-${dia}T${h}:${min}:${s}-05:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function modalidadDe(v: unknown): Modalidad {
  const clave = (texto(v) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return MODALIDADES[clave] ?? 'NO_INFORMA';
}
