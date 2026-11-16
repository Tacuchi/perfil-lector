import type { ContextoLectura, LectorDeFuente, Resultado } from '../tipos.js';
import { avisosDeBumeran, ORIGEN_BUMERAN } from './bumeran-avisos.js';
import { abrirChrome, ArranqueFallido, perfilDe, type Contexto, type Lanzador, type Pagina, type Respuesta } from './navegador.js';

/** Avisos de tecnología, los más recientes primero: una sola carga de página por corrida trae 20. */
export const BUSQUEDA = `${ORIGEN_BUMERAN}/empleos-area-tecnologia-sistemas-y-telecomunicaciones.html?recientes=true`;
/** Respuesta con los avisos que pide la propia página de búsqueda. */
const RUTA_AVISOS = '/api/avisos/searchV2';
/**
 * Bumeran se lee siempre en un Chrome con ventana: su protección bloquea a los navegadores sin ventana, y la
 * persona ve la lectura.
 */
const CON_VENTANA = true;
const PAUSA_MS = 8000;

/** Fallos de Bumeran con un motivo de catálogo fijo: nunca se copia texto de una respuesta del sitio. */
export class FalloBumeran extends Error {
  override name = 'FalloBumeran';
  constructor(readonly motivo: 'VERIFICACION' | 'RITMO' | 'VACIA') {
    super(motivo);
  }
}

export interface LecturaBumeran {
  /** Cuerpos de las respuestas de avisos que cargó la propia página. */
  cuerpos: unknown[];
  /** Enlaces a avisos que muestra la página. */
  enlaces: string[];
}

/** Lo que el lector necesita de una sesión de navegador. El punto de inyección de las pruebas. */
export interface SesionBum {
  abrir(): Promise<void>;
  cerrar(): Promise<void>;
  leerBusqueda(url: string): Promise<LecturaBumeran>;
}

/** Sesión real sobre Chrome con ventana y el perfil persistente de Bumeran. */
export class SesionChromeBumeran implements SesionBum {
  private contexto: Contexto | null = null;
  private pagina: Pagina | null = null;
  private capturadas: Respuesta[] = [];

  constructor(
    private readonly perfil: string = perfilDe('bumeran'),
    private readonly lanzar?: Lanzador,
  ) {}

  /** Sesión sobre un contexto ya abierto: así las pruebas recorren la clasificación real sin navegador. */
  static sobre(contexto: Contexto): SesionChromeBumeran {
    const ses = new SesionChromeBumeran('(inyectado)');
    ses.usar(contexto);
    return ses;
  }

  async abrir(): Promise<void> {
    this.usar(await abrirChrome(this.perfil, CON_VENTANA, this.lanzar));
  }

  private usar(contexto: Contexto): void {
    this.contexto = contexto;
    this.pagina = contexto.pages()[0] ?? null;
    contexto.on('response', (r) => {
      if (r.request().method() !== 'POST') return;
      const url = new URL(r.url());
      if (url.origin === ORIGEN_BUMERAN && url.pathname === RUTA_AVISOS) this.capturadas.push(r);
    });
  }

  async cerrar(): Promise<void> {
    const contexto = this.contexto;
    this.contexto = null;
    this.pagina = null;
    await contexto?.close().catch(() => {});
  }

  private async pag(): Promise<Pagina> {
    if (this.contexto === null) throw new Error('la sesión de Bumeran no está abierta');
    this.pagina ??= await this.contexto.newPage();
    return this.pagina;
  }

  /** Abre la búsqueda y devuelve lo que cargó la propia página. Una verificación o un bloqueo detienen la lectura. */
  async leerBusqueda(url: string): Promise<LecturaBumeran> {
    this.capturadas = [];
    const pagina = await this.pag();
    const respuesta = await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    revisarEstado(respuesta?.status() ?? 200);
    revisarDesvio(pagina.url());
    await pagina.waitForTimeout(PAUSA_MS);
    try {
      await pagina.mouse.wheel(0, 1500);
      await pagina.waitForTimeout(3000);
    } catch {
      // Sin desplazamiento bastan los enlaces ya mostrados.
    }
    revisarDesvio(pagina.url());
    const cuerpos: unknown[] = [];
    for (const r of this.capturadas) {
      revisarEstado(r.status());
      try {
        cuerpos.push(await r.json());
      } catch {
        // Cuerpo ilegible: se salta.
      }
    }
    // La búsqueda siempre pide sus avisos: cero respuestas es no haber podido leer.
    if (cuerpos.length === 0) throw new FalloBumeran('VACIA');
    const enlaces = await pagina.$$eval('a[href*="/empleos/"]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
    return { cuerpos, enlaces };
  }
}

/** 429 es ritmo; 403 y 503 son la verificación o el bloqueo de la protección del sitio. */
function revisarEstado(estado: number): void {
  if (estado === 429) throw new FalloBumeran('RITMO');
  if (estado === 403 || estado === 503) throw new FalloBumeran('VERIFICACION');
}

function revisarDesvio(url: string): void {
  const final = url.toLowerCase();
  if (final.includes('__cf_chl') || final.includes('challenge') || final.includes('captcha')) throw new FalloBumeran('VERIFICACION');
}

/**
 * Lee los avisos de tecnología recientes de Bumeran con una sola carga de la búsqueda, en un Chrome con ventana.
 * Solo escucha lo que la página carga: no pide nada por su cuenta y no resuelve verificaciones.
 */
export function lectorBumeran(fabrica: () => SesionBum = () => new SesionChromeBumeran()): LectorDeFuente {
  return {
    fuente: 'BUMERAN',
    async leer(ctx: ContextoLectura): Promise<Resultado> {
      const ses = fabrica();
      try {
        await ses.abrir();
      } catch (e) {
        if (e instanceof ArranqueFallido) return { tipo: 'local', motivo: e.message };
        throw e;
      }
      try {
        if (!(await ctx.avisar())) return { tipo: 'omitida' };
        const { cuerpos, enlaces } = await ses.leerBusqueda(BUSQUEDA);
        return { tipo: 'avisos', ofertas: avisosDeBumeran(cuerpos, enlaces, ctx.avisosMaximos) };
      } catch (e) {
        if (e instanceof FalloBumeran) return { tipo: 'fallo', fallo: e.motivo };
        throw e;
      } finally {
        await ses.cerrar();
      }
    },
  };
}
