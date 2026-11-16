import { describe, expect, it, vi } from 'vitest';

import { correr, type Dependencias } from '../src/corrida.js';
import type { LectorDeFuente, OfertaEntregada, Resultado } from '../src/tipos.js';
import { apiSimulada, registroEnMemoria } from './dobles/api.js';

const CODIGO = 'Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9';
const ENLACE = `perfil-lector://leer?corrida=${CODIGO}`;
const CREDENCIALES = { apiUrl: 'https://api.ejemplo.test', identidad: { 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'secreto-del-token' } };

const oferta = (id: string): OfertaEntregada => ({
  idExterno: id, titulo: 'Desarrollador', empresa: 'Empresa', publicadaEn: null, ubicacion: 'Lima, Perú',
  modalidad: 'REMOTO', descripcion: 'Descripción', url: `https://www.linkedin.com/jobs/view/${id}/`,
});

function lectorQue(hace: (avisar: () => Promise<boolean>) => Promise<Resultado>): LectorDeFuente {
  return { fuente: 'LINKEDIN', leer: (ctx) => hace(ctx.avisar) };
}

function dependencias(lector: LectorDeFuente, api = apiSimulada()) {
  const registro = registroEnMemoria();
  const credenciales = vi.fn(async () => CREDENCIALES);
  const crear = vi.fn(() => lector);
  const dep: Dependencias = { credenciales, lectores: { LINKEDIN: crear }, registro, fetch: api.hacerFetch };
  return { dep, registro, credenciales, crear, api };
}

describe('corrida del lector', () => {
  it('inicia, avisa antes de leer, entrega los avisos y termina', async () => {
    const orden: string[] = [];
    const { dep, api } = dependencias(lectorQue(async (avisar) => {
      orden.push('antes de avisar');
      expect(await avisar()).toBe(true);
      orden.push('consulta el sitio');
      return { tipo: 'avisos', ofertas: [oferta('1'), oferta('2')] };
    }));
    expect(await correr(ENLACE, dep)).toBe('terminada');
    expect(api.llamadas.map((l) => l.ruta)).toEqual([
      '/api/lector/corrida/iniciar',
      '/api/lector/corrida/fuentes/LINKEDIN/empezar',
      '/api/lector/corrida/fuentes/LINKEDIN/entregar',
      '/api/lector/corrida/terminar',
    ]);
    expect(orden).toEqual(['antes de avisar', 'consulta el sitio']);
    expect(api.llamadas.every((l) => l.cuerpo['codigo'] === CODIGO)).toBe(true);
    expect(api.llamadas[2]?.cuerpo['ofertas']).toHaveLength(2);
    expect(api.llamadas[0]?.cabeceras['CF-Access-Client-Id']).toBe('id.access');
  });

  it('una dirección maliciosa no lee el Llavero, no abre el navegador ni llama a la API', async () => {
    for (const direccion of [`perfil-lector://leer?corrida=x';touch /tmp/x;'`, `perfil-lector://leer?corrida=${CODIGO}%0Aid`, 'perfil-lector://leer?corrida=$(id)']) {
      const { dep, credenciales, crear, api } = dependencias(lectorQue(async () => ({ tipo: 'omitida' })));
      expect(await correr(direccion, dep)).toBe('enlace-invalido');
      expect(credenciales).not.toHaveBeenCalled();
      expect(crear).not.toHaveBeenCalled();
      expect(api.llamadas).toHaveLength(0);
    }
  });

  it('con el código rechazado por la API termina sin abrir Chrome ni tocar el perfil', async () => {
    const api = apiSimulada((ruta) => (ruta.endsWith('/iniciar') ? { status: 403, cuerpo: { detail: 'rechazado' } } : { status: 200 }));
    const { dep, crear } = dependencias(lectorQue(async () => ({ tipo: 'omitida' })), api);
    expect(await correr(ENLACE, dep)).toBe('codigo-rechazado');
    expect(crear).not.toHaveBeenCalled();
    expect(api.llamadas).toHaveLength(1);
  });

  it('con la API inalcanzable termina y lo deja en su registro local', async () => {
    const { dep, registro, crear } = dependencias(lectorQue(async () => ({ tipo: 'omitida' })));
    dep.fetch = async () => { throw new TypeError('fetch failed'); };
    expect(await correr(ENLACE, dep)).toBe('api-inalcanzable');
    expect(crear).not.toHaveBeenCalled();
    expect(registro.lineas.join('\n')).toContain('la API no responde desde esta máquina');
  });

  it('si la API manda no leer la fuente, no la consulta ni entrega nada', async () => {
    const api = apiSimulada((ruta) => (ruta.endsWith('/empezar') ? { status: 409 } : { status: 200 }));
    const consulto = vi.fn();
    const { dep } = dependencias(lectorQue(async (avisar) => {
      if (!(await avisar())) return { tipo: 'omitida' };
      consulto();
      return { tipo: 'avisos', ofertas: [] };
    }), api);
    expect(await correr(ENLACE, dep)).toBe('terminada');
    expect(consulto).not.toHaveBeenCalled();
    expect(api.llamadas.map((l) => l.ruta.split('/').pop())).toEqual(['iniciar', 'empezar', 'terminar']);
  });

  it('un fallo después de avisar se entrega como lectura vacía, nunca como un día sin ofertas', async () => {
    const { dep, api } = dependencias(lectorQue(async (avisar) => {
      await avisar();
      throw new Error('el navegador se cerró');
    }));
    expect(await correr(ENLACE, dep)).toBe('terminada');
    expect(api.llamadas[2]?.cuerpo).toEqual({ codigo: CODIGO, fallo: 'VACIA' });
  });

  it('Chrome ausente no avisa a la API: la lectura del día no se gasta', async () => {
    const { dep, api, registro } = dependencias(lectorQue(async () => ({ tipo: 'local', motivo: 'no pude abrir Chrome' })));
    expect(await correr(ENLACE, dep)).toBe('terminada');
    expect(api.llamadas.map((l) => l.ruta.split('/').pop())).toEqual(['iniciar', 'terminar']);
    expect(registro.lineas.join('\n')).toContain('no pude abrir Chrome');
  });

  it('una fuente que espera el inicio de sesión no frena a otra', async () => {
    let soltar: () => void = () => {};
    const espera = new Promise<void>((r) => { soltar = r; });
    const api = apiSimulada((ruta) => ruta.endsWith('/iniciar')
      ? { status: 200, cuerpo: { fuentes: [{ fuente: 'LINKEDIN', nombre: 'LinkedIn', avisosMaximos: 25 }, { fuente: 'OTRA', nombre: 'Otra', avisosMaximos: 25 }], venceEn: new Date(Date.now() + 900_000).toISOString() } }
      : { status: 200 });
    const registro = registroEnMemoria();
    const lenta = lectorQue(async (avisar) => { await avisar(); await espera; return { tipo: 'fallo', fallo: 'SIN_SESION' }; });
    const rapida: LectorDeFuente = { fuente: 'LINKEDIN', leer: async (ctx) => { await ctx.avisar(); soltar(); return { tipo: 'avisos', ofertas: [oferta('9')] }; } };
    const lectores = { LINKEDIN: () => lenta, OTRA: () => rapida } as unknown as Dependencias['lectores'];
    expect(await correr(ENLACE, { credenciales: async () => CREDENCIALES, lectores, registro, fetch: api.hacerFetch })).toBe('terminada');
    const entregas = api.llamadas.filter((l) => l.ruta.endsWith('/entregar')).map((l) => l.ruta.split('/')[5]);
    expect(entregas).toEqual(['OTRA', 'LINKEDIN']);
  });

  it('ningún registro contiene el código de la corrida ni el token', async () => {
    const { dep, registro } = dependencias(lectorQue(async (avisar) => { await avisar(); return { tipo: 'avisos', ofertas: [oferta('1')] }; }));
    await correr(ENLACE, dep);
    const api403 = apiSimulada(() => ({ status: 403, cuerpo: { detail: CODIGO } }));
    const otro = dependencias(lectorQue(async () => ({ tipo: 'omitida' })), api403);
    await correr(ENLACE, otro.dep);
    const todo = [...registro.lineas, ...otro.registro.lineas].join('\n');
    expect(todo).not.toContain(CODIGO);
    expect(todo).not.toContain('secreto-del-token');
    expect(todo).not.toContain('id.access');
  });
});
