import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { avisosDeBumeran } from '../src/fuentes/bumeran-avisos.js';
import { BUSQUEDA, lectorBumeran, SesionChromeBumeran } from '../src/fuentes/bumeran.js';
import { ArranqueFallido, MSG_SIN_CHROME, type Contexto } from '../src/fuentes/navegador.js';
import type { ContextoLectura } from '../src/tipos.js';
import { BUSQUEDA_GUARDADA, conAvisos, ENLACES_GUARDADOS, URL_AVISOS } from './dobles/bumeran.js';
import { chromeSimulado, type Escenario } from './dobles/linkedin.js';

const ctx = (extra: Partial<ContextoLectura> = {}): ContextoLectura => ({
  avisar: async () => true, avisosMaximos: 25, esperaSesionHasta: Date.now() + 60_000, ...extra,
});

const busqueda = (cuerpo: unknown = BUSQUEDA_GUARDADA, extra: Partial<NonNullable<Escenario['respuestas']>[number]> = {}) =>
  ({ url: URL_AVISOS, metodo: 'POST', cuerpo, ...extra });

/** Un lector sobre un Chrome simulado que, al navegar, emite las respuestas guardadas por el mismo camino que el real. */
function lectorSobre(escenario: Escenario) {
  const chrome = chromeSimulado({ enlaces: ENLACES_GUARDADOS, ...escenario });
  const lector = lectorBumeran(() => {
    const ses = SesionChromeBumeran.sobre(chrome.contexto);
    ses.abrir = async () => {};
    return ses;
  });
  return { lector, chrome };
}

describe('conversión de los avisos de Bumeran', () => {
  it('convierte la respuesta guardada en avisos con título, empresa, ubicación, modalidad, descripción y enlace', () => {
    const avisos = avisosDeBumeran([BUSQUEDA_GUARDADA], ENLACES_GUARDADOS, 25);
    expect(avisos).toHaveLength(5);
    avisos.forEach((a, k) => {
      expect(a.idExterno).toBe(String(BUSQUEDA_GUARDADA.content[k]?.['id']));
      expect(a.titulo.length).toBeGreaterThan(0);
      expect(a.empresa).not.toBeNull();
      expect(a.ubicacion).not.toBeNull();
      expect(['REMOTO', 'HIBRIDO', 'PRESENCIAL']).toContain(a.modalidad);
      expect(a.descripcion.length).toBeGreaterThan(0);
      expect(a.url).toBe(`https://www.bumeran.com.pe${ENLACES_GUARDADOS[k]}`);
      expect(a.publicadaEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('lee la fecha en hora de Lima, la modalidad sin tildes y oculta la empresa confidencial', () => {
    const aviso = { ...BUSQUEDA_GUARDADA.content[0], id: 7, fechaHoraPublicacion: '15-11-2026 13:30:39', modalidadTrabajo: 'Remoto', confidencial: true };
    const [convertido] = avisosDeBumeran([{ content: [aviso] }], ['https://www.bumeran.com.pe/empleos/algo-7.html?origen=x'], 25);
    expect(convertido).toMatchObject({
      publicadaEn: '2026-11-15T18:30:39.000Z', modalidad: 'REMOTO', empresa: null, url: 'https://www.bumeran.com.pe/empleos/algo-7.html',
    });
  });

  it('un aviso sin enlace en la página, sin descripción o con un enlace de otro sitio no se entrega', () => {
    const [primero, segundo] = BUSQUEDA_GUARDADA.content;
    const otros = ['https://otro.example/empleos/x-1.html', ...ENLACES_GUARDADOS.slice(1)];
    const sinDescripcion = { content: [{ ...primero }, { ...segundo, detalle: ' ' }] };
    expect(avisosDeBumeran([BUSQUEDA_GUARDADA], otros, 25).map((a) => a.idExterno)).not.toContain(String(primero?.['id']));
    expect(avisosDeBumeran([sinDescripcion], ENLACES_GUARDADOS, 25)).toHaveLength(1);
  });
});

describe('lector de Bumeran', () => {
  const temporales: string[] = [];
  afterEach(() => temporales.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('abre Chrome real siempre con ventana, en el perfil de la conexión', async () => {
    const perfil = join(mkdtempSync(join(tmpdir(), 'lector-bumeran-')), 'bumeran');
    temporales.push(perfil.slice(0, perfil.lastIndexOf('/')));
    const lanzar = vi.fn(async () => chromeSimulado({}).contexto as Contexto);
    await new SesionChromeBumeran(perfil, lanzar).abrir();
    expect(lanzar).toHaveBeenCalledWith(perfil, true);
  });

  it('avisa a la API y lee los avisos con una sola carga de la búsqueda', async () => {
    const { lector, chrome } = lectorSobre({ respuestas: [busqueda()] });
    const avisar = vi.fn(async () => true);
    const r = await lector.leer(ctx({ avisar }));
    expect(r.tipo === 'avisos' && r.ofertas).toHaveLength(5);
    expect(avisar).toHaveBeenCalledOnce();
    expect(chrome.visitadas).toEqual([BUSQUEDA]);
    expect(chrome.cerrado()).toBe(true);
  });

  it('nunca entrega más de 25 avisos ni carga más de una página por corrida', async () => {
    const { cuerpo, enlaces } = conAvisos(40);
    const { lector, chrome } = lectorSobre({ enlaces, respuestas: [busqueda(cuerpo), busqueda(conAvisos(40).cuerpo)] });
    const r = await lector.leer(ctx());
    expect(r.tipo === 'avisos' && r.ofertas.length).toBe(25);
    expect(chrome.visitadas.length).toBeLessThanOrEqual(4);
    expect(chrome.visitadas).toHaveLength(1);
  });

  it('si la API manda no leer, no navega', async () => {
    const { lector, chrome } = lectorSobre({ respuestas: [busqueda()] });
    expect(await lector.leer(ctx({ avisar: async () => false }))).toEqual({ tipo: 'omitida' });
    expect(chrome.visitadas).toEqual([]);
  });

  it.each([
    ['verificación (403)', { estado: 403 }, 'VERIFICACION'],
    ['bloqueo (503)', { estado: 503 }, 'VERIFICACION'],
    ['ritmo (429)', { estado: 429 }, 'RITMO'],
    ['página de verificación', { final: (u: string) => `${u}&__cf_chl_rt_tk=x` }, 'VERIFICACION'],
    ['búsqueda bloqueada', { respuestas: [busqueda(BUSQUEDA_GUARDADA, { status: 403 })] }, 'VERIFICACION'],
    ['lectura sin respuestas', { respuestas: [] }, 'VACIA'],
    ['respuesta de otra ruta', { respuestas: [busqueda(BUSQUEDA_GUARDADA, { url: 'https://www.bumeran.com.pe/api/avisos/total' })] }, 'VACIA'],
    ['respuesta GET', { respuestas: [busqueda(BUSQUEDA_GUARDADA, { metodo: 'GET' })] }, 'VACIA'],
  ] as Array<[string, Escenario, string]>)('%s detiene la lectura sin reintentar y se reporta', async (_caso, escenario, fallo) => {
    const { lector, chrome } = lectorSobre({ respuestas: [busqueda()], ...escenario });
    expect(await lector.leer(ctx())).toEqual({ tipo: 'fallo', fallo });
    expect(chrome.visitadas).toHaveLength(1);
    expect(chrome.cerrado()).toBe(true);
  });

  it('sin Chrome no avisa a la API: la lectura del día no se gasta', async () => {
    const avisar = vi.fn(async () => true);
    const lector = lectorBumeran(() => {
      const ses = new SesionChromeBumeran('(sin usar)');
      ses.abrir = async () => { throw new ArranqueFallido(MSG_SIN_CHROME); };
      return ses;
    });
    expect(await lector.leer(ctx({ avisar }))).toEqual({ tipo: 'local', motivo: MSG_SIN_CHROME });
    expect(avisar).not.toHaveBeenCalled();
  });
});
