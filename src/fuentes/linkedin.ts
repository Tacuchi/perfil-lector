import type { ContextoLectura, LectorDeFuente, OfertaEntregada, Resultado } from '../tipos.js';
import { avisosDeRespuestas } from './linkedin-avisos.js';
import { abrirChrome, ArranqueFallido, perfilDe, type Contexto, type Lanzador, type Pagina, type Respuesta } from './navegador.js';

const LI = 'https://www.linkedin.com';
/** Cookie de sesión: solo se comprueba que exista; su valor no se lee ni se usa. */
const COOKIE_SESION = 'li_at';
/** Respuestas de la página de empleos que traen las tarjetas y el detalle de los avisos. */
const MARCADOR_AVISOS = 'voyagerJobsDashJobCards';
const INTERVALO_SESION_MS = 3000;
const PAUSA_MS = 5000;

/** Fallos de LinkedIn con un motivo de catálogo fijo: nunca se copia texto de una respuesta del sitio. */
export class FalloLinkedIn extends Error {
  override name = 'FalloLinkedIn';
  constructor(readonly motivo: 'SESION_INVALIDA' | 'VERIFICACION' | 'RITMO' | 'VACIA') {
    super(motivo);
  }
}

/** Lo que el lector necesita de una sesión de navegador. El punto de inyección de las pruebas. */
export interface SesionLi {
  abrir(): Promise<void>;
  cerrar(): Promise<void>;
  tieneSesion(): Promise<boolean>;
  irAlInicioDeSesion(): Promise<void>;
  /** Direcciones de las alertas de empleo de la persona, tal como las enlaza su página de preferencias. */
  alertas(): Promise<string[]>;
  /** Abre una página de empleos y devuelve los cuerpos de las respuestas de avisos que cargó la propia página. */
  leerPagina(url: string): Promise<unknown[]>;
}

export type FabricaSesion = (conVentana: boolean) => SesionLi;

/** Sesión real sobre Chrome con el perfil persistente de LinkedIn. */
export class SesionChrome implements SesionLi {
  private contexto: Contexto | null = null;
  private pagina: Pagina | null = null;
  private capturadas: Respuesta[] = [];

  constructor(
    private readonly conVentana: boolean,
    private readonly perfil: string = perfilDe('linkedin'),
    private readonly lanzar?: Lanzador,
  ) {}

  /** Sesión sobre un contexto ya abierto: así las pruebas recorren la clasificación real sin navegador. */
  static sobre(contexto: Contexto): SesionChrome {
    const ses = new SesionChrome(false, '(inyectado)');
    ses.usar(contexto);
    return ses;
  }

  async abrir(): Promise<void> {
    this.usar(await abrirChrome(this.perfil, this.conVentana, this.lanzar));
  }

  private usar(contexto: Contexto): void {
    this.contexto = contexto;
    this.pagina = contexto.pages()[0] ?? null;
    contexto.on('response', (r) => {
      if (r.url().includes('/voyager/api/graphql') && r.url().includes(MARCADOR_AVISOS) && r.request().method() === 'GET') {
        this.capturadas.push(r);
      }
    });
  }

  async cerrar(): Promise<void> {
    const contexto = this.contexto;
    this.contexto = null;
    this.pagina = null;
    await contexto?.close().catch(() => {});
  }

  private async pag(): Promise<Pagina> {
    if (this.contexto === null) throw new Error('la sesión de LinkedIn no está abierta');
    this.pagina ??= await this.contexto.newPage();
    return this.pagina;
  }

  async tieneSesion(): Promise<boolean> {
    if (this.contexto === null) return false;
    const galletas = await this.contexto.cookies(LI);
    return galletas.some((g) => g.name === COOKIE_SESION && g.value !== '');
  }

  async irAlInicioDeSesion(): Promise<void> {
    // Aquí llegar a /login es el objetivo, no un fallo.
    await (await this.pag()).goto(`${LI}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
  }

  /** Navega y clasifica los desvíos: ritmo, verificación o sesión caída. */
  async ir(url: string): Promise<void> {
    const pagina = await this.pag();
    let respuesta: { status(): number } | null;
    try {
      respuesta = await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } catch (e) {
      if (e instanceof Error && e.message.includes('ERR_TOO_MANY_REDIRECTS')) throw new FalloLinkedIn('SESION_INVALIDA');
      throw e;
    }
    if (respuesta !== null && respuesta.status() === 429) throw new FalloLinkedIn('RITMO');
    this.revisarDesvio(pagina.url());
  }

  private revisarDesvio(url: string): void {
    const final = url.toLowerCase();
    if (final.includes('checkpoint') || final.includes('challenge') || final.includes('captcha')) throw new FalloLinkedIn('VERIFICACION');
    if (final.includes('/login') || final.includes('authwall') || final.includes('/uas/')) throw new FalloLinkedIn('SESION_INVALIDA');
  }

  async alertas(): Promise<string[]> {
    await this.ir(`${LI}/jobs/preferences/`);
    const pagina = await this.pag();
    await pagina.waitForTimeout(PAUSA_MS);
    return enlacesDeAlertas(await pagina.$$eval('a[href*="/jobs/search-results/"]', (as) => as.map((a) => a.getAttribute('href') ?? '')));
  }

  async leerPagina(url: string): Promise<unknown[]> {
    this.capturadas = [];
    await this.ir(url);
    const pagina = await this.pag();
    await pagina.waitForTimeout(PAUSA_MS);
    try {
      await pagina.mouse.wheel(0, 1200);
      await pagina.waitForTimeout(3000);
    } catch {
      // Sin desplazamiento basta la primera página de resultados.
    }
    this.revisarDesvio(pagina.url());
    const cuerpos: unknown[] = [];
    for (const r of this.capturadas) {
      if (r.status() === 429) throw new FalloLinkedIn('RITMO');
      if (r.status() === 401 || r.status() === 403) throw new FalloLinkedIn('SESION_INVALIDA');
      try {
        cuerpos.push(await r.json());
      } catch {
        // Cuerpo ilegible: se salta.
      }
    }
    // La página de empleos siempre pide sus avisos, aun sin resultados: cero respuestas es no haber podido leer.
    if (cuerpos.length === 0) throw new FalloLinkedIn('VACIA');
    return cuerpos;
  }
}

/**
 * Espera a que la persona inicie sesión en la ventana abierta. true en cuanto aparece la cookie de sesión;
 * false si vence el plazo o cierra la ventana.
 */
export async function esperarSesion(
  ses: SesionLi,
  hasta: number,
  ahora: () => number = Date.now,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  if (await ses.tieneSesion()) return true;
  await ses.irAlInicioDeSesion();
  while (ahora() < hasta) {
    await dormir(INTERVALO_SESION_MS);
    try {
      if (await ses.tieneSesion()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

const FALLOS = { SESION_INVALIDA: 'SIN_SESION', VERIFICACION: 'VERIFICACION', RITMO: 'RITMO', VACIA: 'VACIA' } as const;

/**
 * Lee los avisos de empleo de LinkedIn. Solo lee: no postula, no escribe, no guarda búsquedas.
 * Sin sesión (o con la sesión caducada) abre Chrome con ventana en el inicio de sesión y lee al terminar.
 */
export function lectorLinkedIn(fabrica: FabricaSesion = (conVentana) => new SesionChrome(conVentana)): LectorDeFuente {
  return {
    fuente: 'LINKEDIN',
    async leer(ctx: ContextoLectura): Promise<Resultado> {
      let ses = fabrica(false);
      try {
        await ses.abrir();
      } catch (e) {
        if (e instanceof ArranqueFallido) return { tipo: 'local', motivo: e.message };
        throw e;
      }
      try {
        const conSesion = await ses.tieneSesion();
        if (!conSesion) ses = await reabrirConVentana(ses, fabrica);
        if (!(await ctx.avisar())) return { tipo: 'omitida' };
        if (!conSesion && !(await esperarSesion(ses, ctx.esperaSesionHasta))) return { tipo: 'fallo', fallo: 'SIN_SESION' };
        try {
          return { tipo: 'avisos', ofertas: await leerTodo(ses, ctx.avisosMaximos) };
        } catch (e) {
          // La cookie seguía, pero la sesión caducó en el sitio: se pide iniciar sesión una vez y se vuelve a leer.
          if (!(e instanceof FalloLinkedIn) || e.motivo !== 'SESION_INVALIDA' || !conSesion) throw e;
          ses = await reabrirConVentana(ses, fabrica);
          if (!(await esperarSesion(ses, ctx.esperaSesionHasta))) return { tipo: 'fallo', fallo: 'SIN_SESION' };
          return { tipo: 'avisos', ofertas: await leerTodo(ses, ctx.avisosMaximos) };
        }
      } catch (e) {
        if (e instanceof FalloLinkedIn) return { tipo: 'fallo', fallo: FALLOS[e.motivo] };
        if (e instanceof ArranqueFallido) return { tipo: 'local', motivo: e.message };
        throw e;
      } finally {
        await ses.cerrar();
      }
    },
  };
}

async function reabrirConVentana(ses: SesionLi, fabrica: FabricaSesion): Promise<SesionLi> {
  await ses.cerrar();
  const conVentana = fabrica(true);
  await conVentana.abrir();
  return conVentana;
}

/**
 * Las alertas de empleo se leen primero y la página de recomendadas al final, dentro del mismo tope. Las alertas
 * siguen apagadas: su página de resultados no deja leer el detalle de cada aviso, y sin descripción no se entregan.
 */
export const LEER_ALERTAS = false;
const RECOMENDADAS = `${LI}/jobs/`;

/** Enlaces de alertas: búsquedas con palabras clave, sin repetir y sin los parámetros de seguimiento. */
export function enlacesDeAlertas(hrefs: string[]): string[] {
  const alertas = new Set<string>();
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href, LI);
    } catch {
      continue;
    }
    if (url.origin !== LI || url.pathname !== '/jobs/search-results/' || !url.searchParams.get('keywords')) continue;
    const limpia = new URL(`${LI}/jobs/search-results/`);
    for (const clave of ['keywords', 'geoId']) {
      const valor = url.searchParams.get(clave);
      if (valor) limpia.searchParams.set(clave, valor);
    }
    alertas.add(limpia.href);
  }
  return [...alertas];
}

export async function leerTodo(ses: SesionLi, maximo: number, leerAlertas = LEER_ALERTAS): Promise<OfertaEntregada[]> {
  const paginas = [...(leerAlertas ? await ses.alertas() : []), RECOMENDADAS];
  const ofertas: OfertaEntregada[] = [];
  for (const pagina of paginas) {
    if (ofertas.length >= maximo) break;
    for (const o of avisosDeRespuestas(await ses.leerPagina(pagina), maximo)) {
      if (ofertas.length < maximo && !ofertas.some((x) => x.idExterno === o.idExterno)) ofertas.push(o);
    }
  }
  return ofertas;
}
