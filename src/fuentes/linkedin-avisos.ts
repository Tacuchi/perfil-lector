import type { Modalidad, OfertaEntregada } from '../tipos.js';

/*
 * Conversión de las respuestas que carga la propia página de empleos de LinkedIn. Los avisos llegan normalizados:
 * cada entidad va en `included` con su `$type`, y las referencias entre ellas usan claves con asterisco
 * (`*location`, `*company`). Se busca defensivamente: un campo ausente queda en null, nunca rompe la lectura.
 */

const TIPO_AVISO = 'com.linkedin.voyager.dash.jobs.JobPosting';
const TIPO_DESCRIPCION = 'com.linkedin.voyager.dash.jobs.JobDescription';
const TIPO_EMPRESA = 'com.linkedin.voyager.dash.organization.Company';
const TIPO_LUGAR = 'com.linkedin.voyager.dash.common.Geo';
const TIPO_MODALIDAD = 'com.linkedin.voyager.dash.jobs.WorkplaceType';

const URN_AVISO = /^urn:li:fsd_jobPosting:(\d+)$/;

const MODALIDADES: Record<string, Modalidad> = { REMOTE: 'REMOTO', HYBRID: 'HIBRIDO', ON_SITE: 'PRESENCIAL' };

type Entidad = Record<string, unknown>;

const objeto = (v: unknown): Entidad => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Entidad) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** Todas las entidades de las respuestas, por su urn. Una entidad repetida conserva la que trae más campos. */
function indexar(cuerpos: unknown[]): Map<string, Entidad> {
  const porUrn = new Map<string, Entidad>();
  for (const cuerpo of cuerpos) {
    for (const item of lista(objeto(cuerpo)['included'])) {
      const entidad = objeto(item);
      const urn = texto(entidad['entityUrn']);
      if (urn === null) continue;
      const previa = porUrn.get(urn);
      porUrn.set(urn, previa === undefined ? entidad : { ...previa, ...sinNulos(entidad) });
    }
  }
  return porUrn;
}

const sinNulos = (e: Entidad): Entidad => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== null && v !== undefined));

const deTipo = (e: Entidad | undefined, tipo: string): Entidad | undefined => (e !== undefined && e['$type'] === tipo ? e : undefined);

/** Identificadores de avisos en el orden en que aparecen, sin repetir. */
export function idsDeAvisos(cuerpos: unknown[]): string[] {
  const ids: string[] = [];
  for (const m of JSON.stringify(cuerpos).matchAll(/urn:li:fsd_jobPosting:(\d+)/g)) {
    const id = m[1] as string;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Los avisos completos (con título y descripción) que traen las respuestas, en orden y hasta `maximo`. Un aviso
 * que solo aparece como tarjeta, sin su detalle, no se entrega: la API exige la descripción.
 */
export function avisosDeRespuestas(cuerpos: unknown[], maximo: number): OfertaEntregada[] {
  const porUrn = indexar(cuerpos);
  const descripciones = new Map<string, string>();
  for (const e of porUrn.values()) {
    if (e['$type'] !== TIPO_DESCRIPCION) continue;
    const delAviso = texto(e['*jobPosting']);
    const cuerpo = texto(objeto(e['descriptionText'])['text']);
    if (delAviso !== null && cuerpo !== null) descripciones.set(delAviso, cuerpo);
  }
  const ofertas: OfertaEntregada[] = [];
  for (const id of idsDeAvisos(cuerpos)) {
    if (ofertas.length >= maximo) break;
    const urn = `urn:li:fsd_jobPosting:${id}`;
    const aviso = deTipo(porUrn.get(urn), TIPO_AVISO);
    if (aviso === undefined) continue;
    const titulo = texto(aviso['title']);
    const descripcion = texto(objeto(aviso['description'])['text']) ?? descripciones.get(urn) ?? null;
    if (titulo === null || descripcion === null || !URN_AVISO.test(urn)) continue;
    ofertas.push({
      idExterno: id,
      titulo: recortar(titulo, 500),
      empresa: empresaDe(aviso, porUrn),
      publicadaEn: typeof aviso['createdAt'] === 'number' ? new Date(aviso['createdAt']).toISOString() : null,
      ubicacion: lugarDe(aviso, porUrn),
      modalidad: modalidadDe(aviso, porUrn),
      descripcion: recortar(descripcion, 100_000),
      url: `https://www.linkedin.com/jobs/view/${id}/`,
    });
  }
  return ofertas;
}

function empresaDe(aviso: Entidad, porUrn: Map<string, Entidad>): string | null {
  const datos = objeto(objeto(aviso['companyDetails'])['jobCompany']);
  const ref = texto(datos['*company']);
  const empresa = ref === null ? undefined : deTipo(porUrn.get(ref), TIPO_EMPRESA);
  const nombre = texto(empresa?.['name']) ?? texto(datos['rawCompanyName']) ?? texto(objeto(aviso['companyDetails'])['rawCompanyName']);
  return nombre === null ? null : recortar(nombre, 300);
}

function lugarDe(aviso: Entidad, porUrn: Map<string, Entidad>): string | null {
  const ref = texto(aviso['*location']);
  const lugar = ref === null ? undefined : deTipo(porUrn.get(ref), TIPO_LUGAR);
  const nombre = texto(lugar?.['defaultLocalizedName']) ?? texto(aviso['formattedLocation']);
  return nombre === null ? null : recortar(nombre, 500);
}

function modalidadDe(aviso: Entidad, porUrn: Map<string, Entidad>): Modalidad {
  for (const ref of lista(aviso['*jobWorkplaceTypes'])) {
    const tipo = typeof ref === 'string' ? deTipo(porUrn.get(ref), TIPO_MODALIDAD) : undefined;
    const valor = MODALIDADES[texto(tipo?.['workplaceTypeEnum']) ?? ''];
    if (valor !== undefined) return valor;
  }
  return 'NO_INFORMA';
}

const recortar = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, max));
