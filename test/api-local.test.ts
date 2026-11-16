import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { correr, ESPERA_SESION_MS } from '../src/corrida.js';
import { lectorBumeran, SesionChromeBumeran } from '../src/fuentes/bumeran.js';
import { lectorLinkedIn, SesionChrome } from '../src/fuentes/linkedin.js';
import { BUSQUEDA_GUARDADA, ENLACES_GUARDADOS, URL_AVISOS } from './dobles/bumeran.js';
import { chromeSimulado, RECOMENDADAS } from './dobles/linkedin.js';
import { registroEnMemoria } from './dobles/api.js';

/*
 * Corrida contra la API local de perfil-api (`./mvnw spring-boot:test-run`). Solo corre si se indica dónde está:
 * PERFIL_API_LOCAL=http://localhost:8080 y PERFIL_API_TARGET=<carpeta target de perfil-api>, donde la API deja los
 * códigos firmados de la persona y del lector. LinkedIn y Bumeran son Chromes simulados con sus respuestas guardadas.
 */
const API = process.env['PERFIL_API_LOCAL'];
const TARGET = process.env['PERFIL_API_TARGET'];
const ORIGEN_PANEL = 'http://localhost:4200';

const codigo = (archivo: string) => readFileSync(join(TARGET ?? '', archivo), 'utf8').trim();

async function comoPanel(metodo: string, ruta: string): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Cf-Access-Jwt-Assertion': codigo('codigo-local.jwt'), Origin: ORIGEN_PANEL },
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const credenciales = async () => ({ apiUrl: API ?? '', identidad: { 'Cf-Access-Jwt-Assertion': codigo('codigo-lector-local.jwt') } });

function lectorConDoble(cookies = [{ name: 'li_at', value: 'x' }]) {
  return lectorLinkedIn(() => {
    const ses = SesionChrome.sobre(chromeSimulado({ cookies, respuestas: [{ cuerpo: RECOMENDADAS }] }).contexto);
    ses.abrir = async () => {};
    return ses;
  });
}

function bumeranConDoble() {
  return lectorBumeran(() => {
    const chrome = chromeSimulado({ enlaces: ENLACES_GUARDADOS, respuestas: [{ url: URL_AVISOS, metodo: 'POST', cuerpo: BUSQUEDA_GUARDADA }] });
    const ses = SesionChromeBumeran.sobre(chrome.contexto);
    ses.abrir = async () => {};
    return ses;
  });
}

describe.runIf(API !== undefined && TARGET !== undefined)('corrida contra la API local', () => {
  it('un código que la API no emitió se rechaza y no se abre Chrome', async () => {
    let creado = false;
    const registro = registroEnMemoria();
    const salida = await correr(`perfil-lector://leer?corrida=${'A'.repeat(43)}`, {
      credenciales, registro, lectores: { LINKEDIN: () => { creado = true; return lectorConDoble(); } },
    });
    expect(salida).toBe('codigo-rechazado');
    expect(creado).toBe(false);
  });

  it('LinkedIn sin sesión no frena a Bumeran: Bumeran entrega mientras LinkedIn espera el inicio de sesión', async () => {
    const abierta = await comoPanel('POST', '/api/recoleccion/maquina');
    expect(abierta.status).toBe(202);
    const registro = registroEnMemoria();
    const salida = await correr(`perfil-lector://leer?corrida=${abierta.cuerpo['codigo'] as string}`, {
      credenciales, registro,
      lectores: { LINKEDIN: () => lectorConDoble([]), BUMERAN: bumeranConDoble },
      // La espera del inicio de sesión dura unos segundos, no los minutos de una corrida real.
      ahora: () => Date.now() - ESPERA_SESION_MS + 5000,
    });
    expect(salida).toBe('terminada');
    const avance = (await comoPanel('GET', '/api/recoleccion')).cuerpo as {
      estado: string; fuentes: Array<{ fuente: string; resultado: string; ofertasLeidas: number }>;
    };
    expect(avance.estado).toBe('TERMINADA');
    expect(avance.fuentes).toContainEqual(expect.objectContaining({ fuente: 'BUMERAN', resultado: 'CORRECTA', ofertasLeidas: 5 }));
    expect(avance.fuentes.find((f) => f.fuente === 'LINKEDIN')?.resultado).not.toBe('CORRECTA');
    const entregas = registro.lineas.filter((l) => l.includes('entregado'));
    expect(entregas[0]).toContain('BUMERAN');
    expect(entregas[1]).toContain('LINKEDIN');
  });

  it('la persona abre la corrida desde el panel y el lector entrega LinkedIn y la termina', async () => {
    // Esta corrida es solo de LinkedIn: Bumeran queda pausada.
    expect((await comoPanel('POST', '/api/fuentes/BUMERAN/pausar')).status).toBe(200);
    const abierta = await comoPanel('POST', '/api/recoleccion/maquina');
    expect(abierta.status).toBe(202);
    const codigoCorrida = abierta.cuerpo['codigo'] as string;
    const registro = registroEnMemoria();
    const salida = await correr(`perfil-lector://leer?corrida=${codigoCorrida}`, {
      credenciales, registro, lectores: { LINKEDIN: lectorConDoble },
    });
    expect(salida).toBe('terminada');
    const avance = (await comoPanel('GET', '/api/recoleccion')).cuerpo as {
      estado: string; origen: string; cierre: string | null; fuentes: Array<{ fuente: string; resultado: string; ofertasLeidas: number }>;
    };
    expect(avance).toMatchObject({ estado: 'TERMINADA', origen: 'MAQUINA', cierre: null });
    expect(avance.fuentes).toEqual([expect.objectContaining({ fuente: 'LINKEDIN', resultado: 'CORRECTA', ofertasLeidas: 5 })]);
    expect(registro.lineas.join('\n')).not.toContain(codigoCorrida);
    // Una segunda corrida el mismo día ya no tiene lectura de LinkedIn.
    expect((await comoPanel('POST', '/api/recoleccion/maquina')).status).toBe(409);
  });
});
