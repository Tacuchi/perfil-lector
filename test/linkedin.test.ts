import { describe, expect, it, vi } from 'vitest';

import { avisosDeRespuestas } from '../src/fuentes/linkedin-avisos.js';
import { enlacesDeAlertas, esperarSesion, LEER_ALERTAS, leerTodo, lectorLinkedIn, SesionChrome, type SesionLi } from '../src/fuentes/linkedin.js';
import { ArranqueFallido, MSG_PERFIL_EN_USO, MSG_SIN_CHROME, abrirChrome } from '../src/fuentes/navegador.js';
import type { ContextoLectura } from '../src/tipos.js';
import { chromeSimulado, conAvisos, RECOMENDADAS, type Escenario } from './dobles/linkedin.js';

const SESION = [{ name: 'li_at', value: 'x' }];
const ctx = (extra: Partial<ContextoLectura> = {}): ContextoLectura => ({
  avisar: async () => true, avisosMaximos: 25, esperaSesionHasta: Date.now() + 60_000, ...extra,
});

/** Fábrica de sesiones sobre Chromes simulados: la primera sin ventana, la siguiente con ventana. */
function fabrica(...escenarios: Escenario[]) {
  const creadas: Array<{ conVentana: boolean; chrome: ReturnType<typeof chromeSimulado> }> = [];
  const crear = (conVentana: boolean): SesionLi => {
    const chrome = chromeSimulado(escenarios[Math.min(creadas.length, escenarios.length - 1)] ?? {});
    creadas.push({ conVentana, chrome });
    const ses = SesionChrome.sobre(chrome.contexto);
    // El Chrome simulado ya está abierto: abrir no lanza nada.
    ses.abrir = async () => {};
    return ses;
  };
  return { crear, creadas };
}

describe('conversión de los avisos de LinkedIn', () => {
  it('convierte la respuesta guardada en avisos con sus siete datos', () => {
    const avisos = avisosDeRespuestas([RECOMENDADAS], 25);
    expect(avisos).toHaveLength(5);
    for (const a of avisos) {
      expect(a.idExterno).toMatch(/^\d+$/);
      expect(a.titulo.length).toBeGreaterThan(0);
      expect(a.empresa).not.toBeNull();
      expect(a.ubicacion).not.toBeNull();
      expect(['REMOTO', 'HIBRIDO', 'PRESENCIAL']).toContain(a.modalidad);
      expect(a.descripcion.length).toBeGreaterThan(0);
      expect(a.url).toBe(`https://www.linkedin.com/jobs/view/${a.idExterno}/`);
      expect(a.publicadaEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('un aviso sin descripción no se entrega', () => {
    const sinDescripcion = JSON.parse(JSON.stringify(RECOMENDADAS).replace(/"text":"[^"]*"/g, '"text":""')) as unknown;
    expect(avisosDeRespuestas([sinDescripcion], 25)).toHaveLength(0);
  });

  it('nunca entrega más de 25 avisos por corrida', async () => {
    const { crear } = fabrica({ cookies: SESION, respuestas: [{ cuerpo: conAvisos(40) }] });
    const r = await lectorLinkedIn(crear).leer(ctx());
    expect(r.tipo === 'avisos' && r.ofertas.length).toBe(25);
  });
});

describe('lector de LinkedIn', () => {
  it('con sesión avisa a la API y lee la página de empleos sin abrir ventana', async () => {
    const { crear, creadas } = fabrica({ cookies: SESION, respuestas: [{ cuerpo: RECOMENDADAS }] });
    const avisar = vi.fn(async () => true);
    const r = await lectorLinkedIn(crear).leer(ctx({ avisar }));
    expect(r).toMatchObject({ tipo: 'avisos' });
    expect(r.tipo === 'avisos' && r.ofertas).toHaveLength(5);
    expect(avisar).toHaveBeenCalledOnce();
    expect(creadas.map((c) => c.conVentana)).toEqual([false]);
    expect(creadas[0]?.chrome.visitadas).toEqual(['https://www.linkedin.com/jobs/']);
    expect(creadas[0]?.chrome.cerrado()).toBe(true);
  });

  it('si la API manda no leer, no navega', async () => {
    const { crear, creadas } = fabrica({ cookies: SESION, respuestas: [{ cuerpo: RECOMENDADAS }] });
    expect(await lectorLinkedIn(crear).leer(ctx({ avisar: async () => false }))).toEqual({ tipo: 'omitida' });
    expect(creadas[0]?.chrome.visitadas).toEqual([]);
  });

  it.each([
    ['ritmo (429)', { estado: 429 }, 'RITMO'],
    ['verificación', { final: () => 'https://www.linkedin.com/checkpoint/challenge/x' }, 'VERIFICACION'],
    ['lectura sin respuestas', { respuestas: [] }, 'VACIA'],
    ['respuesta de otra consulta', { respuestas: [{ url: 'https://www.linkedin.com/voyager/api/graphql?queryId=voyagerFeedDashGlobalNavs.1', cuerpo: RECOMENDADAS }] }, 'VACIA'],
    ['respuesta POST', { respuestas: [{ metodo: 'POST', cuerpo: RECOMENDADAS }] }, 'VACIA'],
    ['datos con 429', { respuestas: [{ status: 429, cuerpo: {} }] }, 'RITMO'],
  ] as Array<[string, Escenario, string]>)('detecta %s', async (_caso, escenario, fallo) => {
    const { crear } = fabrica({ cookies: SESION, ...escenario });
    expect(await lectorLinkedIn(crear).leer(ctx())).toEqual({ tipo: 'fallo', fallo });
  });

  it('sin sesión abre Chrome con ventana en el inicio de sesión y lee al terminar', async () => {
    let llamadas = 0;
    const conLogin: Escenario = { respuestas: [{ cuerpo: RECOMENDADAS }] };
    const { crear, creadas } = fabrica({ cookies: [] }, conLogin);
    const original = crear;
    const lector = lectorLinkedIn((conVentana) => {
      const ses = original(conVentana);
      if (conVentana) ses.tieneSesion = async () => ++llamadas >= 3;
      return ses;
    });
    const r = await lector.leer(ctx());
    expect(r.tipo === 'avisos' && r.ofertas).toHaveLength(5);
    expect(creadas.map((c) => c.conVentana)).toEqual([false, true]);
    expect(creadas[1]?.chrome.visitadas).toEqual(['https://www.linkedin.com/login', 'https://www.linkedin.com/jobs/']);
  });

  it('si el inicio de sesión no llega a tiempo reporta falta de sesión', async () => {
    const { crear } = fabrica({ cookies: [] });
    const avisar = vi.fn(async () => true);
    expect(await lectorLinkedIn(crear).leer(ctx({ avisar, esperaSesionHasta: Date.now() - 1 }))).toEqual({ tipo: 'fallo', fallo: 'SIN_SESION' });
    expect(avisar).toHaveBeenCalledOnce();
  });

  it('una sesión caducada en el sitio pide iniciar sesión una vez y vuelve a leer', async () => {
    const caducada: Escenario = { cookies: SESION, final: () => 'https://www.linkedin.com/login?session_redirect=x' };
    const { crear, creadas } = fabrica(caducada, { cookies: SESION, respuestas: [{ cuerpo: RECOMENDADAS }] });
    const r = await lectorLinkedIn(crear).leer(ctx());
    expect(r.tipo === 'avisos' && r.ofertas).toHaveLength(5);
    expect(creadas.map((c) => c.conVentana)).toEqual([false, true]);
  });

  it('esperar la sesión vence en su plazo sin quedarse colgado', async () => {
    const { crear } = fabrica({ cookies: [] });
    let t = 0;
    expect(await esperarSesion(crear(true), 9000, () => t, async (ms) => { t += ms; })).toBe(false);
    expect(t).toBeGreaterThanOrEqual(9000);
  });

  it('Chrome ausente o un perfil en uso no llegan a avisar a la API', async () => {
    for (const [mensaje, esperado] of [['Executable doesn\'t exist at /x', MSG_SIN_CHROME], ['ProcessSingleton: profile appears to be in use', MSG_PERFIL_EN_USO]] as const) {
      const avisar = vi.fn(async () => true);
      const lector = lectorLinkedIn(() => ({
        abrir: async () => { await abrirChrome('/tmp/perfil-lector-prueba-inexistente', false, async () => { throw new Error(mensaje); }); },
        cerrar: async () => {}, tieneSesion: async () => true, irAlInicioDeSesion: async () => {}, leerPagina: async () => [], alertas: async () => [],
      }));
      expect(await lector.leer(ctx({ avisar }))).toEqual({ tipo: 'local', motivo: esperado });
      expect(avisar).not.toHaveBeenCalled();
    }
    expect(new ArranqueFallido('x').name).toBe('ArranqueFallido');
  });

  it('el mensaje de Chrome ausente nunca sugiere playwright install', () => {
    expect(MSG_SIN_CHROME).not.toMatch(/playwright install/);
  });
});

describe('alertas de empleo', () => {
  it('toma solo búsquedas con palabras clave, sin repetir y sin parámetros de seguimiento', () => {
    expect(enlacesDeAlertas([
      '/jobs/search-results/?keywords=desarrollador&geoId=100&trackingId=abc&refId=x',
      'https://www.linkedin.com/jobs/search-results/?keywords=desarrollador&geoId=100&origin=JOB_ALERT',
      '/jobs/search-results/?currentJobId=1',
      'https://otro.test/jobs/search-results/?keywords=x',
      '/jobs/preferences/',
    ])).toEqual(['https://www.linkedin.com/jobs/search-results/?keywords=desarrollador&geoId=100']);
  });

  it('siguen apagadas: una corrida no abre las preferencias', () => {
    expect(LEER_ALERTAS).toBe(false);
  });

  it('encendidas, se leen primero y las recomendadas al final, dentro del mismo tope', async () => {
    const chrome = chromeSimulado({ cookies: SESION, enlaces: ['/jobs/search-results/?keywords=desarrollador&geoId=100'], respuestas: [{ cuerpo: conAvisos(10) }] });
    const ses = SesionChrome.sobre(chrome.contexto);
    const ofertas = await leerTodo(ses, 25, true);
    expect(chrome.visitadas).toEqual([
      'https://www.linkedin.com/jobs/preferences/',
      'https://www.linkedin.com/jobs/search-results/?keywords=desarrollador&geoId=100',
      'https://www.linkedin.com/jobs/',
    ]);
    // Las dos páginas traen los mismos diez avisos: cada uno se entrega una vez.
    expect(ofertas).toHaveLength(10);
  });

  it('si las alertas ya llenan el tope, no abre las recomendadas', async () => {
    const chrome = chromeSimulado({ cookies: SESION, enlaces: ['/jobs/search-results/?keywords=desarrollador'], respuestas: [{ cuerpo: conAvisos(10) }] });
    expect(await leerTodo(SesionChrome.sobre(chrome.contexto), 7, true)).toHaveLength(7);
    expect(chrome.visitadas).not.toContain('https://www.linkedin.com/jobs/');
  });
});
